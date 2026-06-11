import 'todo_item.dart';

class TodoFormData {
  const TodoFormData({
    required this.title,
    required this.description,
    required this.priority,
    required this.dueAt,
    required this.isAllDay,
    required this.listId,
    required this.tagIds,
  });

  final String title;
  final String description;
  final String priority;
  final DateTime? dueAt;
  final bool isAllDay;
  final String? listId;
  final List<String> tagIds;

  factory TodoFormData.createDraft() {
    return const TodoFormData(
      title: '',
      description: '',
      priority: 'medium',
      dueAt: null,
      isAllDay: false,
      listId: null,
      tagIds: [],
    );
  }

  factory TodoFormData.fromTodo(TodoItem item) {
    return TodoFormData(
      title: item.title,
      description: item.description ?? '',
      priority: item.priority,
      dueAt: item.dueAt?.toLocal(),
      isAllDay: item.isAllDay,
      listId: item.listId,
      tagIds: item.tagIds,
    );
  }

  TodoFormData copyWith({
    String? title,
    String? description,
    String? priority,
    DateTime? dueAt,
    bool? isAllDay,
    String? listId,
    List<String>? tagIds,
    bool clearList = false,
  }) {
    return TodoFormData(
      title: title ?? this.title,
      description: description ?? this.description,
      priority: priority ?? this.priority,
      dueAt: dueAt ?? this.dueAt,
      isAllDay: isAllDay ?? this.isAllDay,
      listId: clearList ? null : listId ?? this.listId,
      tagIds: tagIds ?? this.tagIds,
    );
  }
}
