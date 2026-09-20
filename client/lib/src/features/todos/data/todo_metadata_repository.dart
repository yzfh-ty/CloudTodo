import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/tag_item.dart';
import '../domain/todo_list_item.dart';

class TodoMetadataRepository {
  TodoMetadataRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<TodoListItem>> getTodoLists() {
    return _getAllPages('/lists', TodoListItem.fromJson);
  }

  Future<TodoListItem> createTodoList({
    required String name,
    String? color,
    int sortOrder = 0,
  }) {
    return _apiClient.post(
      '/lists',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
        'sort_order': sortOrder,
      },
      parser: (data) => TodoListItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoListItem> updateTodoList({
    required String id,
    required String name,
    String? color,
    int version = 1,
  }) {
    return _apiClient.patch(
      '/lists/$id',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
        'version': version,
      },
      parser: (data) => TodoListItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<void> deleteTodoList(String id) {
    return _apiClient.delete('/lists/$id', parser: (_) => null);
  }

  Future<List<TagItem>> getTags() {
    return _getAllPages('/tags', TagItem.fromJson);
  }

  Future<TagItem> createTag({
    required String name,
    String? color,
  }) {
    return _apiClient.post(
      '/tags',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
      },
      parser: (data) => TagItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TagItem> updateTag({
    required String id,
    required String name,
    String? color,
    int version = 1,
  }) {
    return _apiClient.patch(
      '/tags/$id',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
        'version': version,
      },
      parser: (data) => TagItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<void> deleteTag(String id) {
    return _apiClient.delete('/tags/$id', parser: (_) => null);
  }

  Future<List<T>> _getAllPages<T>(
    String path,
    T Function(Map<String, dynamic>) parse,
  ) async {
    final result = <T>[];
    String? cursor;
    while (true) {
      final page = await _apiClient.get(
        path,
        queryParameters: {'cursor': cursor, 'limit': '100'},
        parser: (data) => PagedResponse.fromJson(
          data as Map<String, dynamic>,
          parse,
        ),
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
}
