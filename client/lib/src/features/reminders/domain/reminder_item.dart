class ReminderItem {
  const ReminderItem({
    required this.id,
    required this.todoId,
    required this.channel,
    required this.repeatType,
    required this.repeatRule,
    required this.remindAt,
    required this.timezone,
    required this.status,
    required this.todoTitle,
    required this.todoDescription,
    this.version = 1,
  });

  final String id;
  final String todoId;
  final String channel;
  final String repeatType;
  final Map<String, dynamic>? repeatRule;
  final DateTime remindAt;
  final String timezone;
  final String status;
  final String todoTitle;
  final String? todoDescription;
  final int version;

  List<String> get channels => [channel];

  factory ReminderItem.fromJson(Map<String, dynamic> json) {
    final channels = (json['channels'] as List<dynamic>? ?? const [])
        .whereType<String>()
        .toList(growable: false);
    final repeat = json['repeat'] as Map<String, dynamic>?;
    return ReminderItem(
      id: json['id'] as String,
      todoId: json['todo_id'] as String,
      channel: channels.isEmpty ? 'local' : channels.first,
      repeatType: repeat?['type'] as String? ?? 'none',
      repeatRule: repeat?['rule'] as Map<String, dynamic>?,
      remindAt: DateTime.parse(json['remind_at'] as String),
      timezone: json['timezone'] as String? ?? 'UTC',
      status: json['status'] as String? ?? 'pending',
      todoTitle: (json['todo'] as Map<String, dynamic>?)?['title'] as String? ??
          '待办提醒',
      todoDescription:
          (json['todo'] as Map<String, dynamic>?)?['description'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }
}
