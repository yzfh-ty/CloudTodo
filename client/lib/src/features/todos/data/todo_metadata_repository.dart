import '../../../core/http/http_client.dart';
import '../domain/tag_item.dart';
import '../domain/todo_list_item.dart';

class TodoMetadataRepository {
  TodoMetadataRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<TodoListItem>> getTodoLists() {
    return _apiClient.get(
      '/todo-lists',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(TodoListItem.fromJson)
            .toList(growable: false);
      },
    );
  }

  Future<TodoListItem> createTodoList({
    required String name,
    String? color,
  }) {
    return _apiClient.post(
      '/todo-lists',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
      },
      parser: (data) => TodoListItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoListItem> updateTodoList({
    required String id,
    required String name,
    String? color,
  }) {
    return _apiClient.patch(
      '/todo-lists/$id',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
      },
      parser: (data) => TodoListItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TodoListItem> deleteTodoList(String id) {
    return _apiClient.delete(
      '/todo-lists/$id',
      parser: (data) => TodoListItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<List<TagItem>> getTags() {
    return _apiClient.get(
      '/tags',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(TagItem.fromJson)
            .toList(growable: false);
      },
    );
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
  }) {
    return _apiClient.patch(
      '/tags/$id',
      body: {
        'name': name.trim(),
        'color': color?.trim().isEmpty ?? true ? null : color?.trim(),
      },
      parser: (data) => TagItem.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<TagItem> deleteTag(String id) {
    return _apiClient.delete(
      '/tags/$id',
      parser: (data) => TagItem.fromJson(data as Map<String, dynamic>),
    );
  }
}
