class ReminderItem {
  const ReminderItem({
    required this.id,
    required this.todoId,
    required this.channel,
    required this.repeatType,
    required this.remindAt,
    required this.timezone,
    required this.status,
  });

  final String id;
  final String todoId;
  final String channel;
  final String repeatType;
  final DateTime remindAt;
  final String timezone;
  final String status;

  factory ReminderItem.fromJson(Map<String, dynamic> json) {
    return ReminderItem(
      id: json['id'] as String,
      todoId: json['todoId'] as String,
      channel: json['channel'] as String? ?? 'webhook',
      repeatType: json['repeatType'] as String? ?? 'none',
      remindAt: DateTime.parse(json['remindAt'] as String),
      timezone: json['timezone'] as String? ?? 'UTC',
      status: json['status'] as String? ?? 'pending',
    );
  }
}
