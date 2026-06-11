class ReminderEventItem {
  const ReminderEventItem({
    required this.id,
    required this.reminderId,
    required this.todoId,
    required this.channel,
    required this.scheduledFor,
    required this.triggeredAt,
    required this.status,
  });

  final String id;
  final String reminderId;
  final String todoId;
  final String channel;
  final DateTime scheduledFor;
  final DateTime triggeredAt;
  final String status;

  factory ReminderEventItem.fromJson(Map<String, dynamic> json) {
    return ReminderEventItem(
      id: json['id'] as String,
      reminderId: json['reminderId'] as String,
      todoId: json['todoId'] as String,
      channel: json['channel'] as String? ?? 'webhook',
      scheduledFor: DateTime.parse(json['scheduledFor'] as String),
      triggeredAt: DateTime.parse(json['triggeredAt'] as String),
      status: json['status'] as String? ?? 'pending',
    );
  }
}
