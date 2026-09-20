class TodoItem {
  const TodoItem({
    required this.id,
    required this.title,
    required this.status,
    required this.priority,
    required this.isAllDay,
    required this.createdAt,
    required this.updatedAt,
    required this.tagIds,
    this.version = 1,
    this.description,
    this.listId,
    this.dueAt,
    this.completedAt,
    this.archivedAt,
  });

  final String id;
  final String title;
  final String? description;
  final String status;
  final String priority;
  final bool isAllDay;
  final String? listId;
  final List<String> tagIds;
  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? dueAt;
  final DateTime? completedAt;
  final DateTime? archivedAt;

  factory TodoItem.fromJson(Map<String, dynamic> json) {
    return TodoItem(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      status: json['status'] as String? ?? 'pending',
      priority: json['priority'] as String? ?? 'medium',
      isAllDay: json['is_all_day'] as bool? ?? false,
      listId: json['list_id'] as String?,
      tagIds: (json['tag_ids'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(growable: false),
      version: json['version'] as int? ?? 1,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      dueAt: json['due_at'] == null
          ? null
          : DateTime.parse(json['due_at'] as String),
      completedAt: json['completed_at'] == null
          ? null
          : DateTime.parse(json['completed_at'] as String),
      archivedAt: json['archived_at'] == null
          ? null
          : DateTime.parse(json['archived_at'] as String),
    );
  }
}
