import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as timezone;

import '../../features/reminders/domain/reminder_event_item.dart';
import '../../features/reminders/domain/reminder_item.dart';
import '../utils/app_timezone.dart';
import 'local_autostart.dart';

class LocalNotificationService {
  LocalNotificationService()
      : _autostart = LocalAutostart(),
        _plugin = FlutterLocalNotificationsPlugin();

  static const _scheduledIdsKey = 'local_notification_scheduled_ids';
  static const _localNotificationsEnabledKey = 'local_notifications_enabled';
  static const _showTaskTitleKey = 'local_notifications_show_task_title';
  static const _notificationChannelId = 'cloudtodo_reminders';

  final LocalAutostart _autostart;
  final FlutterLocalNotificationsPlugin _plugin;
  final Map<int, String> _scheduledReminderKeys = {};
  Set<int> _knownScheduledIds = <int>{};
  bool _initialized = false;
  bool _autostartEnabled = false;
  bool _localNotificationsEnabled = true;
  bool _showTaskTitle = false;
  // Account transitions and reminder polling share OS schedules and a
  // persisted id set. Serialize mutations so a stale cleanup cannot erase
  // state written by the next account.
  Future<void> _mutationTail = Future<void>.value();

  bool get supportsAutostart => _autostart.isSupported;
  bool get supportsPermissionRequest =>
      defaultTargetPlatform == TargetPlatform.android;
  bool get supportsLocalNotifications =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.linux ||
          defaultTargetPlatform == TargetPlatform.windows);
  bool get autostartEnabled => _autostartEnabled;
  bool get localNotificationsEnabled => _localNotificationsEnabled;
  bool get showTaskTitle => _showTaskTitle;

  Future<void> initialize() async {
    if (_initialized || !supportsLocalNotifications) {
      return;
    }

    const settings = InitializationSettings(
      android: AndroidInitializationSettings('ic_launcher'),
      linux: LinuxInitializationSettings(defaultActionName: '打开 CloudTodo'),
      windows: WindowsInitializationSettings(
        appName: 'CloudTodo',
        guid: 'f6e6a93f-2e76-4d91-9f92-0fb3e2cf3ab4',
        appUserModelId: 'com.cloudtodo.client_flutter',
      ),
    );

    await _plugin.initialize(settings: settings);
    _initialized = true;
    _autostartEnabled = await _autostart.isEnabled();
    final preferences = await SharedPreferences.getInstance();
    _localNotificationsEnabled =
        preferences.getBool(_localNotificationsEnabledKey) ?? true;
    _showTaskTitle = preferences.getBool(_showTaskTitleKey) ?? false;
    _knownScheduledIds =
        (preferences.getStringList(_scheduledIdsKey) ?? const [])
            .map(int.tryParse)
            .whereType<int>()
            .toSet();
    if (defaultTargetPlatform == TargetPlatform.android) {
      final plugin = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      final systemEnabled = await plugin?.areNotificationsEnabled();
      _localNotificationsEnabled =
          _localNotificationsEnabled && (systemEnabled ?? true);
    }
    if (!_localNotificationsEnabled) {
      for (final id in _knownScheduledIds) {
        await _plugin.cancel(id: id);
      }
      _knownScheduledIds = <int>{};
      await preferences.setStringList(_scheduledIdsKey, const []);
    }
  }

  void dispose() {
    // The plugin owns its platform resources; in-memory state only needs
    // clearing when the app controller is replaced.
    _scheduledReminderKeys.clear();
  }

  /// Removes scheduled and in-memory reminder state owned by the previous
  /// account. Refresh/logout transitions call this before a new account can
  /// start scheduling notifications.
  Future<void> clearAccountState() {
    return _serializeMutation(_clearAccountState);
  }

  Future<void> _clearAccountState() async {
    final scheduledIds = _knownScheduledIds.toList(growable: false);
    final allScheduledIds = <int>{
      ...scheduledIds,
      ..._scheduledReminderKeys.keys,
    };
    _knownScheduledIds = <int>{};
    _scheduledReminderKeys.clear();
    if (_initialized) {
      for (final id in allScheduledIds) {
        try {
          await _plugin.cancel(id: id);
        } catch (_) {
          // A platform notification provider may already be unavailable.
        }
      }
    }
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(_scheduledIdsKey, const []);
    } catch (_) {
      // In-memory state is still cleared when preferences are unavailable.
    }
  }

  Future<bool> requestPermission() async {
    await initialize();
    if (defaultTargetPlatform != TargetPlatform.android) {
      return supportsLocalNotifications;
    }

    final plugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    return await plugin?.requestNotificationsPermission() ?? true;
  }

  Future<void> setAutostartEnabled(bool enabled) async {
    await _autostart.setEnabled(enabled);
    _autostartEnabled = enabled && supportsAutostart;
  }

  Future<void> setLocalNotificationsEnabled(bool enabled) {
    return _serializeMutation(() => _setLocalNotificationsEnabled(enabled));
  }

  Future<void> _setLocalNotificationsEnabled(bool enabled) async {
    await initialize();
    _localNotificationsEnabled = enabled;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_localNotificationsEnabledKey, enabled);
    if (enabled) {
      return;
    }

    for (final id in _knownScheduledIds) {
      await _plugin.cancel(id: id);
    }
    _knownScheduledIds = <int>{};
    _scheduledReminderKeys.clear();
    await preferences.setStringList(_scheduledIdsKey, const []);
  }

  Future<void> setShowTaskTitle(bool enabled) {
    return _serializeMutation(() => _setShowTaskTitle(enabled));
  }

  Future<void> _setShowTaskTitle(bool enabled) async {
    if (_showTaskTitle == enabled) {
      return;
    }
    _showTaskTitle = enabled;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_showTaskTitleKey, enabled);
    // Existing OS schedules contain the old body text. Cancel them so a
    // privacy change cannot leave stale task titles on the lock screen; the
    // next reminder poll will schedule them with the new setting.
    final scheduledIds = _knownScheduledIds.toList(growable: false);
    for (final id in scheduledIds) {
      try {
        await _plugin.cancel(id: id);
      } catch (_) {
        // Best effort: the preference still takes effect for future events.
      }
    }
    _knownScheduledIds = <int>{};
    _scheduledReminderKeys.clear();
    await preferences.setStringList(_scheduledIdsKey, const []);
  }

  Future<void> syncReminders(
    List<ReminderItem> reminders, {
    bool Function()? isSessionCurrent,
  }) {
    return _serializeMutation(
      () => _syncReminders(reminders, isSessionCurrent: isSessionCurrent),
    );
  }

  Future<void> _syncReminders(
    List<ReminderItem> reminders, {
    bool Function()? isSessionCurrent,
  }) async {
    if (isSessionCurrent != null && !isSessionCurrent()) {
      return;
    }
    await initialize();
    if (isSessionCurrent != null && !isSessionCurrent()) {
      return;
    }
    if (!_initialized) {
      return;
    }
    if (!_localNotificationsEnabled) {
      return;
    }

    final localReminders = reminders.where(_isLocalReminder).toList();
    final activeIds =
        localReminders.map((item) => _notificationId(item.id)).toSet();
    for (final staleId in _knownScheduledIds.difference(activeIds)) {
      if (isSessionCurrent != null && !isSessionCurrent()) {
        return;
      }
      await _plugin.cancel(id: staleId);
    }

    if (defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.windows) {
      for (final reminder in localReminders) {
        if (isSessionCurrent != null && !isSessionCurrent()) {
          return;
        }
        try {
          await _scheduleNative(reminder);
        } catch (_) {
          // Notification permissions or platform schedulers may be unavailable;
          // reminder data should remain usable in that case.
        }
      }
    }

    _knownScheduledIds = (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.windows)
        ? activeIds
        : <int>{};
    if (isSessionCurrent != null && !isSessionCurrent()) {
      return;
    }
    final preferences = await SharedPreferences.getInstance();
    await preferences.setStringList(
      _scheduledIdsKey,
      activeIds.map((id) => id.toString()).toList(growable: false),
    );
  }

  Future<void> cancelReminder(String reminderId) {
    return _serializeMutation(() => _cancelReminder(reminderId));
  }

  Future<void> _cancelReminder(String reminderId) async {
    await initialize();
    if (!_initialized) {
      return;
    }

    final id = _notificationId(reminderId);
    await _plugin.cancel(id: id);
    _knownScheduledIds.remove(id);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setStringList(
      _scheduledIdsKey,
      _knownScheduledIds
          .map((value) => value.toString())
          .toList(growable: false),
    );
  }

  Future<bool> shouldShowEvent(ReminderEventItem event) {
    return _serializeMutation(() => _shouldShowEvent(event));
  }

  Future<bool> _shouldShowEvent(ReminderEventItem event) async {
    await initialize();
    return _localNotificationsEnabled &&
        !_knownScheduledIds.contains(_notificationId(event.reminderId));
  }

  Future<void> showEvent(ReminderEventItem event) {
    return _serializeMutation(() => _showEvent(event));
  }

  Future<void> _showEvent(ReminderEventItem event) async {
    await initialize();
    if (!_initialized || !_localNotificationsEnabled) {
      return;
    }

    await _plugin.show(
      id: _notificationId(event.reminderId),
      title: 'CloudTodo 提醒',
      body: notificationBodyForTask(event.todoTitle),
      notificationDetails: _notificationDetails,
      payload: event.todoId,
    );
    _knownScheduledIds.add(_notificationId(event.reminderId));
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(
        _scheduledIdsKey,
        _knownScheduledIds
            .map((value) => value.toString())
            .toList(growable: false),
      );
    } catch (_) {
      // The OS notification is still shown when preferences are unavailable.
    }
  }

  Future<T> _serializeMutation<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    _mutationTail = _mutationTail.then<void>((_) async {
      try {
        completer.complete(await action());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  bool _isLocalReminder(ReminderItem reminder) {
    if (reminder.status != 'pending' ||
        reminder.remindAt.isBefore(DateTime.now())) {
      return false;
    }

    if (reminder.channel == 'both') {
      return true;
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return reminder.channel == 'android_local';
    }
    return defaultTargetPlatform == TargetPlatform.linux ||
            defaultTargetPlatform == TargetPlatform.windows
        ? reminder.channel == 'windows_local'
        : false;
  }

  Future<void> _scheduleNative(ReminderItem reminder) async {
    final id = _notificationId(reminder.id);
    final scheduleKey =
        '${reminder.remindAt.toIso8601String()}:${reminder.repeatType}';
    if (_scheduledReminderKeys[id] == scheduleKey) {
      return;
    }

    final scheduledDate = timezone.TZDateTime.from(
      reminder.remindAt,
      appTimezoneLocation,
    );
    final matchDateTimeComponents = switch (reminder.repeatType) {
      'daily' => DateTimeComponents.time,
      'weekly' => DateTimeComponents.dayOfWeekAndTime,
      _ => null,
    };

    await _plugin.zonedSchedule(
      id: id,
      title: 'CloudTodo 提醒',
      body: notificationBodyForTask(reminder.todoTitle),
      scheduledDate: scheduledDate,
      notificationDetails: _notificationDetails,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: matchDateTimeComponents,
      payload: reminder.todoId,
    );
    _scheduledReminderKeys[id] = scheduleKey;
  }

  NotificationDetails get _notificationDetails => const NotificationDetails(
        android: AndroidNotificationDetails(
          _notificationChannelId,
          'CloudTodo 提醒',
          channelDescription: '待办事项和提醒通知',
          importance: Importance.high,
          priority: Priority.high,
        ),
        linux: LinuxNotificationDetails(
          urgency: LinuxNotificationUrgency.normal,
        ),
        windows: WindowsNotificationDetails(),
      );

  @visibleForTesting
  String notificationBodyForTask(String todoTitle) {
    return _showTaskTitle ? todoTitle : '你有一条待办提醒';
  }

  int _notificationId(String value) {
    var hash = 0x811c9dc5;
    for (final byte in value.codeUnits) {
      hash ^= byte;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash == 0 ? 1 : hash;
  }
}
