import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/todo_item.dart';

class TodoRepository {
  TodoRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<Map<String, int>> getSummary() {
    return _apiClient.get(
      '/todos/summary',
      parser: (data) {
        final json = data as Map<String, dynamic>;
        return {
          'total': json['total'] as int? ?? 0,
          'pending': json['pending'] as int? ?? 0,
          'completed': json['completed'] as int? ?? 0,
          'archived': json['archived'] as int? ?? 0,
        };
      },
    );
  }

  Future<PagedResponse<TodoItem>> getTodos({
    String? status,
    String? keyword,
    String? listId,
    String? tagId,
    int page = 1,
    int pageSize = 20,
  }) {
    return _apiClient.get(
      '/todos',
      queryParameters: {
        'status': status,
        'keyword': keyword,
        'list_id': listId,
        'tag_id': tagId,
        'page': '$page',
        'page_size': '$pageSize',
      },
      parser: (data) {
        return PagedResponse.fromJson(
          data as Map<String, dynamic>,
          TodoItem.fromJson,
        );
      },
    );
  }

  Future<TodoItem> createTodo({
    required String title,
    String? description,
    String priority = 'medium',
    DateTime? dueAt,
    bool isAllDay = false,
    String? listId,
    List<String> tagIds = const [],
  }) {
    return _apiClient.post(
      '/todos',
      body: {
        'title': title.trim(),
        'description':
            description?.trim().isEmpty ?? true ? null : description?.trim(),
        'priority': priority,
        'due_at': dueAt?.toUtc().toIso8601String(),
        'is_all_day': isAllDay,
        'list_id': listId,
        'tag_ids': tagIds,
      },
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> updateTodo({
    required String id,
    required String title,
    String? description,
    required String priority,
    required DateTime? dueAt,
    required bool isAllDay,
    required String? listId,
    required List<String> tagIds,
  }) {
    return _apiClient.patch(
      '/todos/$id',
      body: {
        'title': title.trim(),
        'description':
            description?.trim().isEmpty ?? true ? null : description?.trim(),
        'priority': priority,
        'due_at': dueAt?.toUtc().toIso8601String(),
        'is_all_day': isAllDay,
        'list_id': listId,
        'tag_ids': tagIds,
      },
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> completeTodo(String id) {
    return _apiClient.post(
      '/todos/$id/complete',
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> reopenTodo(String id) {
    return _apiClient.post(
      '/todos/$id/reopen',
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> archiveTodo(String id) {
    return _apiClient.post(
      '/todos/$id/archive',
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> deleteTodo(String id) {
    return _apiClient.delete(
      '/todos/$id',
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }
}
