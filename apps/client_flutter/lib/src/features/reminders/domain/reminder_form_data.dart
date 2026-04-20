import 'reminder_item.dart';

class ReminderFormData {
  const ReminderFormData({
    required this.channel,
    required this.repeatType,
    required this.remindAt,
    required this.timezone,
  });

  final String channel;
  final String repeatType;
  final DateTime remindAt;
  final String timezone;

  factory ReminderFormData.createDraft() {
    return ReminderFormData(
      channel: 'webhook',
      repeatType: 'none',
      remindAt: DateTime.now().add(const Duration(hours: 1)),
      timezone: 'Asia/Shanghai',
    );
  }

  factory ReminderFormData.fromReminder(ReminderItem item) {
    return ReminderFormData(
      channel: item.channel,
      repeatType: item.repeatType,
      remindAt: item.remindAt.toLocal(),
      timezone: item.timezone,
    );
  }

  ReminderFormData copyWith({
    String? channel,
    String? repeatType,
    DateTime? remindAt,
    String? timezone,
  }) {
    return ReminderFormData(
      channel: channel ?? this.channel,
      repeatType: repeatType ?? this.repeatType,
      remindAt: remindAt ?? this.remindAt,
      timezone: timezone ?? this.timezone,
    );
  }
}
