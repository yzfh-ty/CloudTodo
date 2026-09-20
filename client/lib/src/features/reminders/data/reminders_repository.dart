import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
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
    final reminders = <ReminderItem>[];
    String? cursor;
    while (true) {
      final page = await _apiClient.get(
        '/reminders/upcoming',
        queryParameters: {'cursor': cursor, 'limit': '100'},
        parser: (data) => _parseReminderPage(data),
      );
      reminders.addAll(page.items);
      final nextCursor = page.nextCursor;
      if (!page.hasMore || nextCursor == null || nextCursor == cursor) {
        break;
      }
      cursor = nextCursor;
    }
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
        'channels': _channelsForSelection(channel),
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
        'channels': _channelsForSelection(channel),
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

  Future<List<ReminderEventItem>> getPendingLocalEvents() async {
    final result = <ReminderEventItem>[];
    String? cursor;
    while (true) {
      final page = await _apiClient.get(
        '/reminder-events',
        queryParameters: {'cursor': cursor, 'limit': '100'},
        parser: (data) => PagedResponse.fromJson(
          data as Map<String, dynamic>,
          ReminderEventItem.fromJson,
        ),
      );
      result.addAll(page.items);
      final nextCursor = page.nextCursor;
      if (!page.hasMore || nextCursor == null || nextCursor == cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return result;
  }

  Future<void> ackReminderEvent(String id) {
    return _apiClient.post('/reminder-events/$id/ack', parser: (_) => null);
  }

  List<String> _channelsForSelection(String selection) {
    if (selection == 'both') return const ['webhook', 'local'];
    if (selection == 'android_local' || selection == 'windows_local')
      return const ['local'];
    return [selection];
  }

  PagedResponse<ReminderItem> _parseReminderPage(Object? data) {
    return PagedResponse.fromJson(
      data as Map<String, dynamic>,
      ReminderItem.fromJson,
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
