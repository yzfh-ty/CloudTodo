import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/models/paged_response.dart';
import '../../todos/data/todo_repository.dart';
import '../../todos/domain/todo_item.dart';
import '../data/reminders_repository.dart';
import '../domain/reminder_form_data.dart';
import '../domain/reminder_item.dart';

class RemindersController extends ChangeNotifier {
  RemindersController({
    required RemindersRepository remindersRepository,
    required TodoRepository todoRepository,
  })  : _remindersRepository = remindersRepository,
        _todoRepository = todoRepository;

  final RemindersRepository _remindersRepository;
  final TodoRepository _todoRepository;

  List<ReminderItem> reminders = const [];
  List<TodoItem> todos = const [];
  bool isLoading = true;
  String? errorMessage;
  String? submittingId;
  String? selectedTodoId;

  Future<void> load() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait<Object>([
        _remindersRepository.getUpcomingReminders(),
        _todoRepository.getTodos(pageSize: 100),
      ]);

      final remindersResult = results[0] as List<ReminderItem>;
      final todosPage = results[1] as PagedResponse<TodoItem>;

      reminders = remindersResult;
      todos = todosPage.items;
      selectedTodoId ??= todos.isNotEmpty ? todos.first.id : null;
    } catch (error) {
      errorMessage = AppException.describe(error);
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  void setSelectedTodoId(String? value) {
    selectedTodoId = value;
    notifyListeners();
  }

  Future<bool> createReminder(ReminderFormData draft) async {
    final todoId = selectedTodoId;
    if (todoId == null) {
      errorMessage = '请先选择 Todo';
      notifyListeners();
      return false;
    }

    return _runMutation('creating', () async {
      await _remindersRepository.createReminder(
        todoId: todoId,
        channel: draft.channel,
        remindAt: draft.remindAt,
        repeatType: draft.repeatType,
        timezone: draft.timezone,
      );
      await load();
    });
  }

  Future<bool> updateReminder(String reminderId, ReminderFormData draft) {
    return _runMutation(reminderId, () async {
      await _remindersRepository.updateReminder(
        reminderId: reminderId,
        channel: draft.channel,
        remindAt: draft.remindAt,
        repeatType: draft.repeatType,
        timezone: draft.timezone,
      );
      await load();
    });
  }

  Future<bool> deleteReminder(String reminderId) {
    return _runMutation(reminderId, () async {
      await _remindersRepository.deleteReminder(reminderId);
      await load();
    });
  }

  Future<bool> _runMutation(
    String marker,
    Future<void> Function() action,
  ) async {
    submittingId = marker;
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
      submittingId = null;
      notifyListeners();
    }
  }
}
