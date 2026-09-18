class TodoListItem {
  const TodoListItem({
    required this.id,
    required this.name,
    required this.isDefault,
    required this.sortOrder,
    this.color,
  });

  final String id;
  final String name;
  final String? color;
  final bool isDefault;
  final int sortOrder;

  factory TodoListItem.fromJson(Map<String, dynamic> json) {
    return TodoListItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      color: json['color'] as String?,
      isDefault: json['isDefault'] as bool? ?? false,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}
