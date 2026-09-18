import '../../../core/http/http_client.dart';
import '../../../core/notifications/local_notification_service.dart';
import '../domain/reminder_event_item.dart';
import '../domain/reminder_item.dart';

class RemindersRepository {
  RemindersRepository(
    this._apiClient, {
    required LocalNotificationService localNotificationService,
    int Function()? sessionGeneration,
  })  : _localNotificationService = localNotificationService,
        _sessionGeneration = sessionGeneration;

  final ApiClient _apiClient;
  final LocalNotificationService _localNotificationService;
  final int Function()? _sessionGeneration;

  Future<List<ReminderItem>> getUpcomingReminders() async {
    final generation = _sessionGeneration?.call();
    final reminders = await _apiClient.get(
      '/reminders/upcoming',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(ReminderItem.fromJson)
            .toList(growable: false);
      },
    );
    _ensureSession(generation);
    await _localNotificationService.syncReminders(
      reminders,
      isSessionCurrent: () => _isSessionCurrent(generation),
    );
    return reminders;
  }

  Future<ReminderItem> createReminder({
    required String todoId,
    required String channel,
    required DateTime remindAt,
    required String repeatType,
    Map<String, dynamic>? repeatRule,
  }) async {
    final generation = _sessionGeneration?.call();
    final reminder = await _apiClient.post(
      '/todos/$todoId/reminders',
      body: {
        'channel': channel,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat_type': repeatType,
        'repeat_rule': repeatRule,
      },
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
    _ensureSession(generation);
    await _localNotificationService.syncReminders(
      [reminder],
      isSessionCurrent: () => _isSessionCurrent(generation),
    );
    return reminder;
  }

  Future<ReminderItem> updateReminder({
    required String reminderId,
    required String channel,
    required DateTime remindAt,
    required String repeatType,
    Map<String, dynamic>? repeatRule,
  }) async {
    final generation = _sessionGeneration?.call();
    final reminder = await _apiClient.patch(
      '/reminders/$reminderId',
      body: {
        'channel': channel,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat_type': repeatType,
        'repeat_rule': repeatRule,
      },
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
    _ensureSession(generation);
    await _localNotificationService.syncReminders(
      [reminder],
      isSessionCurrent: () => _isSessionCurrent(generation),
    );
    return reminder;
  }

  Future<ReminderItem> deleteReminder(String reminderId) async {
    final generation = _sessionGeneration?.call();
    final reminder = await _apiClient.delete(
      '/reminders/$reminderId',
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
    _ensureSession(generation);
    await _localNotificationService.cancelReminder(reminderId);
    return reminder;
  }

  Future<List<ReminderEventItem>> getPendingLocalEvents() {
    return _apiClient.get(
      '/reminder-events',
      queryParameters: {
        'status': 'pending',
      },
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(ReminderEventItem.fromJson)
            .where((item) =>
                item.channel == 'android_local' ||
                item.channel == 'windows_local' ||
                item.channel == 'both')
            .toList(growable: false);
      },
    );
  }

  Future<ReminderEventItem> ackReminderEvent(String id) {
    return _apiClient.post(
      '/reminder-events/$id/ack',
      parser: (data) =>
          ReminderEventItem.fromJson(data as Map<String, dynamic>),
    );
  }

  bool _isSessionCurrent(int? generation) =>
      generation == null || _sessionGeneration?.call() == generation;

  void _ensureSession(int? generation) {
    if (!_isSessionCurrent(generation)) {
      throw const SessionChangedException();
    }
  }
}
