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
    final todo = json['todo'] as Map<String, dynamic>?;
    final reminder = json['reminder'] as Map<String, dynamic>?;
    return ReminderEventItem(
      id: json['event_id'] as String? ?? json['id'] as String,
      reminderId:
          reminder?['id'] as String? ?? json['reminder_id'] as String? ?? '',
      todoId: todo?['id'] as String? ?? json['todo_id'] as String? ?? '',
      channel: json['channel'] as String? ?? 'local',
      scheduledFor: DateTime.parse(
        reminder?['scheduled_for'] as String? ??
            json['scheduled_for'] as String,
      ),
      triggeredAt: DateTime.parse(
        json['triggered_at'] as String? ?? json['created_at'] as String,
      ),
      status: json['status'] as String? ?? 'pending',
      todoTitle: todo?['title'] as String? ?? '待办提醒',
      todoDescription: todo?['description'] as String?,
    );
  }
}
