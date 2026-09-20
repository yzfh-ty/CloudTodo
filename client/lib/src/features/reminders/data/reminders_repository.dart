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
      queryParameters: {'limit': '50'},
      parser: (data) => _parseItems(data),
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
        'channels': [channel],
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat': {'type': repeatType, 'rule': repeatRule},
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
    int version = 1,
  }) async {
    final generation = _sessionGeneration?.call();
    final reminder = await _apiClient.patch(
      '/reminders/$reminderId',
      body: {
        'channels': [channel],
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat': {'type': repeatType, 'rule': repeatRule},
        'version': version,
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

  Future<void> deleteReminder(String reminderId) async {
    final generation = _sessionGeneration?.call();
    await _apiClient.delete('/reminders/$reminderId', parser: (_) => null);
    _ensureSession(generation);
    await _localNotificationService.cancelReminder(reminderId);
  }

  Future<List<ReminderEventItem>> getPendingLocalEvents() {
    return _apiClient.get(
      '/reminder-events',
      queryParameters: {'limit': '50'},
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(ReminderEventItem.fromJson)
            .toList(growable: false);
      },
    );
  }

  Future<ReminderEventItem> ackReminderEvent(String id) {
    return _apiClient.post(
      '/reminder-events/$id/ack',
      parser: (data) => ReminderEventItem.fromJson(
        data as Map<String, dynamic>,
      ),
    );
  }

  List<ReminderItem> _parseItems(Object? data) {
    final payload = data as Map<String, dynamic>;
    final items = payload['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ReminderItem.fromJson)
        .toList(growable: false);
  }

  bool _isSessionCurrent(int? generation) =>
      generation == null || _sessionGeneration?.call() == generation;

  void _ensureSession(int? generation) {
    if (!_isSessionCurrent(generation)) {
      throw const SessionChangedException();
    }
  }
}
