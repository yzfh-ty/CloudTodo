import 'reminder_item.dart';

class ReminderFormData {
  const ReminderFormData({
    required this.channel,
    required this.repeatType,
    required this.repeatRule,
    required this.remindAt,
    required this.timezone,
  });

  final String channel;
  final String repeatType;
  final Map<String, dynamic>? repeatRule;
  final DateTime remindAt;
  final String timezone;

  factory ReminderFormData.createDraft() {
    return ReminderFormData(
      channel: 'webhook',
      repeatType: 'none',
      repeatRule: null,
      remindAt: DateTime.now().add(const Duration(hours: 1)),
      timezone: 'Asia/Shanghai',
    );
  }

  factory ReminderFormData.fromReminder(ReminderItem item) {
    return ReminderFormData(
      channel: item.channel,
      repeatType: item.repeatType,
      repeatRule: item.repeatRule,
      remindAt: item.remindAt.toLocal(),
      timezone: item.timezone,
    );
  }

  ReminderFormData copyWith({
    String? channel,
    String? repeatType,
    Map<String, dynamic>? repeatRule,
    DateTime? remindAt,
    String? timezone,
    bool clearRepeatRule = false,
  }) {
    return ReminderFormData(
      channel: channel ?? this.channel,
      repeatType: repeatType ?? this.repeatType,
      repeatRule: clearRepeatRule ? null : repeatRule ?? this.repeatRule,
      remindAt: remindAt ?? this.remindAt,
      timezone: timezone ?? this.timezone,
    );
  }
}
