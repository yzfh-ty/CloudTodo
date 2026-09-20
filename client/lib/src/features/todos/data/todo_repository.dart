import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/todo_item.dart';

class TodoRepository {
  TodoRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<Map<String, int>> getSummary() async {
    final pages = await Future.wait([
      getTodos(status: 'pending', limit: 100),
      getTodos(status: 'completed', limit: 100),
      getTodos(status: 'archived', limit: 100),
      getTodos(status: 'deleted', limit: 100),
    ]);
    return {
      'total': pages.fold<int>(0, (sum, page) => sum + page.items.length),
      'pending': pages[0].items.length,
      'completed': pages[1].items.length,
      'archived': pages[2].items.length,
    };
  }

  Future<PagedResponse<TodoItem>> getTodos({
    String? status,
    String? keyword,
    String? listId,
    String? tagId,
    String? cursor,
    int limit = 50,
    @Deprecated('The API uses cursor/limit; this is retained for UI callers.')
    int? pageSize,
  }) {
    final effectiveLimit = pageSize ?? limit;
    return _apiClient.get(
      '/todos',
      queryParameters: {
        'cursor': cursor,
        'limit': '$effectiveLimit',
        'status': status,
        'keyword': keyword,
        'list_id': listId,
        'tag_id': tagId,
      },
      parser: (data) => PagedResponse.fromJson(
        data as Map<String, dynamic>,
        TodoItem.fromJson,
      ),
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
        'list_id': listId,
        'tag_ids': tagIds,
        'priority': priority,
        'due_at': dueAt?.toUtc().toIso8601String(),
        'is_all_day': isAllDay,
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
    int version = 1,
  }) {
    return _apiClient.patch(
      '/todos/$id',
      body: {
        'title': title.trim(),
        'description':
            description?.trim().isEmpty ?? true ? null : description?.trim(),
        'list_id': listId,
        'tag_ids': tagIds,
        'priority': priority,
        'due_at': dueAt?.toUtc().toIso8601String(),
        'is_all_day': isAllDay,
        'version': version,
      },
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> _updateStatus(String id, String status, int version) {
    return _apiClient.patch(
      '/todos/$id',
      body: {'status': status, 'version': version},
      parser: (data) => TodoItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoItem> completeTodo(String id, {int version = 1}) =>
      _updateStatus(id, 'completed', version);

  Future<TodoItem> reopenTodo(String id, {int version = 1}) =>
      _updateStatus(id, 'pending', version);

  Future<TodoItem> archiveTodo(String id, {int version = 1}) =>
      _updateStatus(id, 'archived', version);

  Future<void> deleteTodo(String id) {
    return _apiClient.delete(
      '/todos/$id',
      parser: (_) => null,
    );
  }
}
