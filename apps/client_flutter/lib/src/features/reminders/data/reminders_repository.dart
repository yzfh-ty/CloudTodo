import '../../../core/http/http_client.dart';
import '../domain/reminder_item.dart';

class RemindersRepository {
  RemindersRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<ReminderItem>> getUpcomingReminders() {
    return _apiClient.get(
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
  }

  Future<ReminderItem> createReminder({
    required String todoId,
    required String channel,
    required DateTime remindAt,
    required String repeatType,
    required String timezone,
  }) {
    return _apiClient.post(
      '/todos/$todoId/reminders',
      body: {
        'channel': channel,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat_type': repeatType,
        'timezone': timezone,
      },
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<ReminderItem> updateReminder({
    required String reminderId,
    required String channel,
    required DateTime remindAt,
    required String repeatType,
    required String timezone,
  }) {
    return _apiClient.patch(
      '/reminders/$reminderId',
      body: {
        'channel': channel,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'repeat_type': repeatType,
        'timezone': timezone,
      },
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<ReminderItem> deleteReminder(String reminderId) {
    return _apiClient.delete(
      '/reminders/$reminderId',
      parser: (data) => ReminderItem.fromJson(data as Map<String, dynamic>),
    );
  }
}
