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
      isAllDay: json['isAllDay'] as bool? ?? false,
      listId: json['listId'] as String?,
      tagIds: _parseTagIds(json['tags']),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      archivedAt: json['archivedAt'] == null
          ? null
          : DateTime.parse(json['archivedAt'] as String),
    );
  }

  static List<String> _parseTagIds(Object? raw) {
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map<String, dynamic>>()
        .map((item) => item['tagId'] as String?)
        .whereType<String>()
        .toList(growable: false);
  }
}
