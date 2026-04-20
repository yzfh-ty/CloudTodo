import 'todo_item.dart';

class TodoFormData {
  const TodoFormData({
    required this.title,
    required this.description,
    required this.priority,
    required this.dueAt,
    required this.isAllDay,
  });

  final String title;
  final String description;
  final String priority;
  final DateTime? dueAt;
  final bool isAllDay;

  factory TodoFormData.createDraft() {
    return const TodoFormData(
      title: '',
      description: '',
      priority: 'medium',
      dueAt: null,
      isAllDay: false,
    );
  }

  factory TodoFormData.fromTodo(TodoItem item) {
    return TodoFormData(
      title: item.title,
      description: item.description ?? '',
      priority: item.priority,
      dueAt: item.dueAt?.toLocal(),
      isAllDay: item.isAllDay,
    );
  }

  TodoFormData copyWith({
    String? title,
    String? description,
    String? priority,
    DateTime? dueAt,
    bool? isAllDay,
  }) {
    return TodoFormData(
      title: title ?? this.title,
      description: description ?? this.description,
      priority: priority ?? this.priority,
      dueAt: dueAt ?? this.dueAt,
      isAllDay: isAllDay ?? this.isAllDay,
    );
  }
}
