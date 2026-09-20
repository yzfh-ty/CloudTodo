import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/todo_item.dart';

class TodoRepository {
  TodoRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<Map<String, int>> getSummary() async {
    final lists = await Future.wait([
      getAllTodos(status: 'pending'),
      getAllTodos(status: 'completed'),
      getAllTodos(status: 'archived'),
      getAllTodos(status: 'deleted'),
    ]);
    return {
      'total': lists.fold<int>(0, (sum, items) => sum + items.length),
      'pending': lists[0].length,
      'completed': lists[1].length,
      'archived': lists[2].length,
    };
  }

  Future<List<TodoItem>> getAllTodos({
    String? status,
    String? keyword,
    String? listId,
    String? tagId,
  }) async {
    final result = <TodoItem>[];
    String? cursor;
    while (true) {
      final page = await _getTodosPage(
        status: status,
        keyword: keyword,
        listId: listId,
        tagId: tagId,
        cursor: cursor,
        limit: 100,
      );
      result.addAll(page.items);
      final nextCursor = page.nextCursor;
      if (!page.hasMore || nextCursor == null || nextCursor == cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return result;
  }

  Future<PagedResponse<TodoItem>> _getTodosPage({
    String? status,
    String? keyword,
    String? listId,
    String? tagId,
    String? cursor,
    int limit = 50,
  }) {
    final effectiveLimit = limit;
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
