class ReminderEventItem {
  const ReminderEventItem({
    required this.id,
    required this.reminderId,
    required this.todoId,
    required this.channel,
    required this.scheduledFor,
    required this.triggeredAt,
    required this.status,
    required this.todoTitle,
    required this.todoDescription,
  });

  final String id;
  final String reminderId;
  final String todoId;
  final String channel;
  final DateTime scheduledFor;
  final DateTime triggeredAt;
  final String status;
  final String todoTitle;
  final String? todoDescription;

  factory ReminderEventItem.fromJson(Map<String, dynamic> json) {
    return ReminderEventItem(
      id: json['id'] as String,
      reminderId: json['reminderId'] as String,
      todoId: json['todoId'] as String,
      channel: json['channel'] as String? ?? 'webhook',
      scheduledFor: DateTime.parse(json['scheduledFor'] as String),
      triggeredAt: DateTime.parse(json['triggeredAt'] as String),
      status: json['status'] as String? ?? 'pending',
      todoTitle: (json['payload'] as Map<String, dynamic>?)?['todo_title']
              as String? ??
          '待办提醒',
      todoDescription: (json['payload']
          as Map<String, dynamic>?)?['todo_description'] as String?,
    );
  }
}
