import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/models/paged_response.dart';
import '../../reminders/data/reminders_repository.dart';
import '../../reminders/domain/reminder_form_data.dart';
import '../../reminders/domain/reminder_item.dart';
import '../data/todo_metadata_repository.dart';
import '../data/todo_repository.dart';
import '../domain/tag_item.dart';
import '../domain/todo_form_data.dart';
import '../domain/todo_item.dart';
import '../domain/todo_list_item.dart';

class TodoListController extends ChangeNotifier {
  TodoListController({
    required TodoRepository todoRepository,
    required TodoMetadataRepository todoMetadataRepository,
    required RemindersRepository remindersRepository,
  })  : _todoRepository = todoRepository,
        _todoMetadataRepository = todoMetadataRepository,
        _remindersRepository = remindersRepository;

  final TodoRepository _todoRepository;
  final TodoMetadataRepository _todoMetadataRepository;
  final RemindersRepository _remindersRepository;

  List<TodoItem> items = const [];
  List<TodoListItem> todoLists = const [];
  List<TagItem> tags = const [];
  List<ReminderItem> upcomingReminders = const [];
  bool isLoading = true;
  bool isSubmitting = false;
  String? errorMessage;
  String? statusFilter = 'pending';
  String? listFilter;
  String? tagFilter;
  String keyword = '';
  int total = 0;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) {
      return;
    }

    _initialized = true;
    await refresh();
  }

  Future<void> refresh() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait<Object>([
        _todoRepository.getTodos(
          status: statusFilter,
          keyword: keyword.isEmpty ? null : keyword,
          listId: listFilter,
          tagId: tagFilter,
        ),
        _remindersRepository.getUpcomingReminders(),
        _todoMetadataRepository.getTodoLists(),
        _todoMetadataRepository.getTags(),
      ]);

      final todosPage = results[0] as PagedResponse<TodoItem>;
      final reminders = results[1] as List<ReminderItem>;
      final lists = results[2] as List<TodoListItem>;
      final loadedTags = results[3] as List<TagItem>;

      items = todosPage.items;
      total = todosPage.total;
      upcomingReminders = reminders;
      todoLists = lists;
      tags = loadedTags;
    } catch (error) {
      errorMessage = AppException.describe(error);
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> setStatusFilter(String? nextStatus) async {
    statusFilter = nextStatus;
    await refresh();
  }

  Future<void> setKeyword(String value) async {
    keyword = value.trim();
    await refresh();
  }

  Future<void> setListFilter(String? nextListId) async {
    listFilter = nextListId;
    await refresh();
  }

  Future<void> setTagFilter(String? nextTagId) async {
    tagFilter = nextTagId;
    await refresh();
  }

  Future<bool> createTodo(TodoFormData draft) async {
    if (draft.title.trim().isEmpty) {
      return false;
    }

    return _runMutation(() async {
      await _todoRepository.createTodo(
        title: draft.title.trim(),
        description: draft.description,
        priority: draft.priority,
        dueAt: draft.dueAt,
        isAllDay: draft.isAllDay,
        listId: draft.listId,
        tagIds: draft.tagIds,
      );
      await refresh();
    });
  }

  Future<bool> updateTodo(String id, TodoFormData draft) async {
    if (draft.title.trim().isEmpty) {
      return false;
    }

    return _runMutation(() async {
      await _todoRepository.updateTodo(
        id: id,
        title: draft.title.trim(),
        description: draft.description,
        priority: draft.priority,
        dueAt: draft.dueAt,
        isAllDay: draft.isAllDay,
        listId: draft.listId,
        tagIds: draft.tagIds,
      );
      await refresh();
    });
  }

  Future<bool> completeTodo(String id) async {
    return _runMutation(() async {
      await _todoRepository.completeTodo(id);
      await refresh();
    });
  }

  Future<bool> reopenTodo(String id) async {
    return _runMutation(() async {
      await _todoRepository.reopenTodo(id);
      await refresh();
    });
  }

  Future<bool> archiveTodo(String id) async {
    return _runMutation(() async {
      await _todoRepository.archiveTodo(id);
      await refresh();
    });
  }

  Future<bool> deleteTodo(String id) async {
    return _runMutation(() async {
      await _todoRepository.deleteTodo(id);
      await refresh();
    });
  }

  Future<bool> createReminder(String todoId, ReminderFormData draft) {
    return _runMutation(() async {
      await _remindersRepository.createReminder(
        todoId: todoId,
        channel: draft.channel,
        remindAt: draft.remindAt,
        repeatType: draft.repeatType,
        repeatRule: draft.repeatRule,
        timezone: draft.timezone,
      );
      await refresh();
    });
  }

  Future<bool> updateReminder(String reminderId, ReminderFormData draft) {
    return _runMutation(() async {
      await _remindersRepository.updateReminder(
        reminderId: reminderId,
        channel: draft.channel,
        remindAt: draft.remindAt,
        repeatType: draft.repeatType,
        repeatRule: draft.repeatRule,
        timezone: draft.timezone,
      );
      await refresh();
    });
  }

  Future<bool> deleteReminder(String reminderId) {
    return _runMutation(() async {
      await _remindersRepository.deleteReminder(reminderId);
      await refresh();
    });
  }

  Future<bool> createTodoList(String name) {
    if (name.trim().isEmpty) {
      return Future.value(false);
    }

    return _runMutation(() async {
      await _todoMetadataRepository.createTodoList(name: name);
      await refresh();
    });
  }

  Future<bool> updateTodoList(String id, String name) {
    if (name.trim().isEmpty) {
      return Future.value(false);
    }

    return _runMutation(() async {
      await _todoMetadataRepository.updateTodoList(id: id, name: name);
      await refresh();
    });
  }

  Future<bool> deleteTodoList(String id) {
    return _runMutation(() async {
      await _todoMetadataRepository.deleteTodoList(id);
      if (listFilter == id) {
        listFilter = null;
      }
      await refresh();
    });
  }

  Future<bool> createTag(String name) {
    if (name.trim().isEmpty) {
      return Future.value(false);
    }

    return _runMutation(() async {
      await _todoMetadataRepository.createTag(name: name);
      await refresh();
    });
  }

  Future<bool> updateTag(String id, String name) {
    if (name.trim().isEmpty) {
      return Future.value(false);
    }

    return _runMutation(() async {
      await _todoMetadataRepository.updateTag(id: id, name: name);
      await refresh();
    });
  }

  Future<bool> deleteTag(String id) {
    return _runMutation(() async {
      await _todoMetadataRepository.deleteTag(id);
      if (tagFilter == id) {
        tagFilter = null;
      }
      await refresh();
    });
  }

  Map<String, int> get statusSummary {
    final summary = <String, int>{
      'pending': 0,
      'completed': 0,
      'archived': 0,
    };

    for (final item in items) {
      summary[item.status] = (summary[item.status] ?? 0) + 1;
    }

    return summary;
  }

  Future<bool> _runMutation(Future<void> Function() action) async {
    isSubmitting = true;
    errorMessage = null;
    notifyListeners();

    try {
      await action();
      return true;
    } catch (error) {
      errorMessage = AppException.describe(error);
      notifyListeners();
      return false;
    } finally {
      isSubmitting = false;
      notifyListeners();
    }
  }
}
