class TodoListItem {
  const TodoListItem({
    required this.id,
    required this.name,
    required this.isDefault,
    required this.sortOrder,
    this.version = 1,
    this.color,
  });

  final String id;
  final String name;
  final String? color;
  final bool isDefault;
  final int sortOrder;
  final int version;

  factory TodoListItem.fromJson(Map<String, dynamic> json) {
    return TodoListItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      color: json['color'] as String?,
      isDefault: json['is_default'] as bool? ?? false,
      sortOrder: json['sort_order'] as int? ?? 0,
      version: json['version'] as int? ?? 1,
    );
  }
}
