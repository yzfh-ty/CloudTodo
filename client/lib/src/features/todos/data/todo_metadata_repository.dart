import '../../../core/http/http_client.dart';
import '../domain/tag_item.dart';
import '../domain/todo_list_item.dart';

class TodoMetadataRepository {
  TodoMetadataRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<TodoListItem>> getTodoLists() {
    return _apiClient.get(
      '/lists',
      parser: (data) => _parseList(data, TodoListItem.fromJson),
    );
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
    return _apiClient.get(
      '/tags',
      parser: (data) => _parseList(data, TagItem.fromJson),
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

  List<T> _parseList<T>(Object? data, T Function(Map<String, dynamic>) parse) {
    final payload = data as Map<String, dynamic>;
    final items = payload['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(parse)
        .toList(growable: false);
  }
}
