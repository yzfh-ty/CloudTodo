import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/widgets/empty_state_card.dart';
import '../../../core/widgets/page_header.dart';
import '../../app/application/app_scope.dart';
import '../../reminders/domain/reminder_form_data.dart';
import '../../reminders/presentation/reminder_editor_dialog.dart';
import '../application/todo_list_controller.dart';
import 'todo_detail_dialog.dart';
import '../domain/todo_form_data.dart';
import '../domain/todo_item.dart';
import 'todo_editor_dialog.dart';

part 'todo_page_widgets.dart';
part 'todo_page_toolbar.dart';

class TodoPage extends StatefulWidget {
  const TodoPage({super.key});

  @override
  State<TodoPage> createState() => _TodoPageState();
}

class _TodoPageState extends State<TodoPage> {
  late final TodoListController _controller;
  final _createController = TextEditingController();
  final _searchController = TextEditingController();
  bool _initialized = false;
  bool _showAdvancedFilters = false;
  bool _headerCollapsed = false;

  void _toggleAdvancedFilters() {
    setState(() => _showAdvancedFilters = !_showAdvancedFilters);
  }

  bool _handleTodoScroll(UserScrollNotification notification) {
    final shouldCollapse = notification.metrics.pixels > 0 &&
        notification.direction == ScrollDirection.reverse;
    final shouldExpand = notification.metrics.pixels <= 0 ||
        notification.direction == ScrollDirection.forward;
    final nextValue = shouldCollapse
        ? true
        : shouldExpand
            ? false
            : _headerCollapsed;
    if (nextValue != _headerCollapsed && mounted) {
      setState(() => _headerCollapsed = nextValue);
    }
    return false;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _controller = TodoListController(
      todoRepository: services.todoRepository,
      todoMetadataRepository: services.todoMetadataRepository,
      remindersRepository: services.remindersRepository,
    )..initialize();
    _initialized = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _createController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final summary = _controller.statusSummary;

        return LayoutBuilder(
          builder: (context, constraints) {
            final isMobile = constraints.maxWidth < 760;
            final filterWidth = isMobile ? constraints.maxWidth - 48 : 220.0;
            return ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(
                scrollbars: false,
              ),
              child: NotificationListener<UserScrollNotification>(
                onNotification: _handleTodoScroll,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    AnimatedSize(
                      duration: MediaQuery.disableAnimationsOf(context)
                          ? Duration.zero
                          : const Duration(milliseconds: 180),
                      alignment: Alignment.topCenter,
                      child: _headerCollapsed
                          ? const SizedBox.shrink()
                          : Column(
                              children: [
                                PageHeader(
                                  title: '待办',
                                  description:
                                      '${summary['pending'] ?? 0} 项待办 · ${summary['completed'] ?? 0} 项已完成',
                                  action: isMobile
                                      ? IconButton.filled(
                                          tooltip: '新建任务',
                                          onPressed: _controller.isSubmitting
                                              ? null
                                              : _openCreateDialog,
                                          icon: const Icon(Icons.add_rounded),
                                        )
                                      : FilledButton.icon(
                                          onPressed: _controller.isSubmitting
                                              ? null
                                              : _openCreateDialog,
                                          icon: const Icon(Icons.add_rounded),
                                          label: const Text('新建任务'),
                                        ),
                                ),
                                const SizedBox(height: 16),
                                _buildFocusedToolbar(isMobile),
                                const SizedBox(height: 12),
                                Offstage(
                                  offstage: !_showAdvancedFilters,
                                  child: Card(
                                    child: Padding(
                                      padding:
                                          EdgeInsets.all(isMobile ? 14 : 18),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            '清单与标签',
                                            style: theme.textTheme.titleMedium
                                                ?.copyWith(
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          Wrap(
                                            spacing: 12,
                                            runSpacing: 10,
                                            crossAxisAlignment:
                                                WrapCrossAlignment.center,
                                            children: [
                                              SizedBox(
                                                width: filterWidth,
                                                child: DropdownButtonFormField<
                                                    String>(
                                                  initialValue:
                                                      _controller.listFilter ??
                                                          '',
                                                  decoration:
                                                      const InputDecoration(
                                                          labelText: '清单'),
                                                  items: [
                                                    const DropdownMenuItem(
                                                      value: '',
                                                      child: Text('全部清单'),
                                                    ),
                                                    ..._controller.todoLists
                                                        .map(
                                                      (list) =>
                                                          DropdownMenuItem(
                                                        value: list.id,
                                                        child: Text(list.name),
                                                      ),
                                                    ),
                                                  ],
                                                  onChanged: (value) =>
                                                      _controller.setListFilter(
                                                    value == null ||
                                                            value.isEmpty
                                                        ? null
                                                        : value,
                                                  ),
                                                ),
                                              ),
                                              SizedBox(
                                                width: filterWidth,
                                                child: DropdownButtonFormField<
                                                    String>(
                                                  initialValue:
                                                      _controller.tagFilter ??
                                                          '',
                                                  decoration:
                                                      const InputDecoration(
                                                          labelText: '标签'),
                                                  items: [
                                                    const DropdownMenuItem(
                                                      value: '',
                                                      child: Text('全部标签'),
                                                    ),
                                                    ..._controller.tags.map(
                                                      (tag) => DropdownMenuItem(
                                                        value: tag.id,
                                                        child: Text(tag.name),
                                                      ),
                                                    ),
                                                  ],
                                                  onChanged: (value) =>
                                                      _controller.setTagFilter(
                                                    value == null ||
                                                            value.isEmpty
                                                        ? null
                                                        : value,
                                                  ),
                                                ),
                                              ),
                                              OutlinedButton.icon(
                                                onPressed:
                                                    _controller.isSubmitting
                                                        ? null
                                                        : _createTodoList,
                                                icon: const Icon(Icons
                                                    .create_new_folder_rounded),
                                                label: const Text('新建清单'),
                                              ),
                                              OutlinedButton.icon(
                                                onPressed:
                                                    _controller.isSubmitting
                                                        ? null
                                                        : _createTag,
                                                icon: const Icon(
                                                    Icons.sell_rounded),
                                                label: const Text('新建标签'),
                                              ),
                                            ],
                                          ),
                                          if (_controller
                                                  .todoLists.isNotEmpty ||
                                              _controller.tags.isNotEmpty) ...[
                                            const SizedBox(height: 10),
                                            Wrap(
                                              spacing: 8,
                                              runSpacing: 6,
                                              children: [
                                                ..._controller.todoLists.map(
                                                  (list) => InputChip(
                                                    avatar: const Icon(
                                                        Icons.folder_rounded,
                                                        size: 17),
                                                    label: Text(list.name),
                                                    onPressed: () =>
                                                        _editTodoList(
                                                            list.id, list.name),
                                                    onDeleted: () =>
                                                        _deleteTodoList(
                                                            list.id, list.name),
                                                  ),
                                                ),
                                                ..._controller.tags.map(
                                                  (tag) => InputChip(
                                                    avatar: const Icon(
                                                        Icons.sell_rounded,
                                                        size: 17),
                                                    label: Text(tag.name),
                                                    onPressed: () => _editTag(
                                                        tag.id, tag.name),
                                                    onDeleted: () => _deleteTag(
                                                        tag.id, tag.name),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                          if (_controller.errorMessage !=
                                              null) ...[
                                            const SizedBox(height: 10),
                                            Text(
                                              _controller.errorMessage!,
                                              style: TextStyle(
                                                  color:
                                                      theme.colorScheme.error),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Text(
                          '任务列表',
                          style: isMobile
                              ? theme.textTheme.titleMedium
                              : theme.textTheme.titleLarge,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${_controller.items.length}',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (_controller.isLoading)
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                      )
                    else if (_controller.items.isEmpty)
                      EmptyStateCard(
                        icon: Icons.inbox_rounded,
                        title: '当前没有任务',
                        description: _controller.keyword.isNotEmpty ||
                                _controller.statusFilter != null
                            ? '当前筛选条件下没有匹配的任务，试试切换筛选条件或清空搜索词。'
                            : '先创建第一条任务，再逐步补充提醒和通知方式。',
                        action: FilledButton.tonal(
                          onPressed: _controller.isSubmitting
                              ? null
                              : _openCreateDialog,
                          child: const Text('新建任务'),
                        ),
                      )
                    else
                      ..._controller.items.map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _TodoCard(
                            item: item,
                            onViewDetail: () => _openTodoDetail(item),
                            onEdit: () => _openEditDialog(item),
                            onManageReminder: () =>
                                _openCreateReminderDialog(item),
                            onComplete: item.status == 'pending'
                                ? () => _controller.completeTodo(item.id)
                                : null,
                            onReopen: item.status != 'pending'
                                ? () => _controller.reopenTodo(item.id)
                                : null,
                            onArchive: item.status != 'archived'
                                ? () => _controller.archiveTodo(item.id)
                                : null,
                            onDelete: () => _confirmDeleteTodo(item),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _createTodo() async {
    final created = await _controller.createTodo(
      TodoFormData.createDraft().copyWith(
        title: _createController.text,
        listId: _controller.listFilter,
        tagIds:
            _controller.tagFilter == null ? const [] : [_controller.tagFilter!],
      ),
    );
    if (created) {
      _createController.clear();
    }
  }

  Future<void> _openCreateDialog() async {
    final draft = await showDialog<TodoFormData>(
      context: context,
      builder: (context) {
        return TodoEditorDialog(
          initialValue: const TodoFormData(
            title: '',
            description: '',
            priority: 'medium',
            dueAt: null,
            isAllDay: false,
            listId: null,
            tagIds: [],
          ),
          title: '创建任务',
          submitLabel: '保存',
          todoLists: _controller.todoLists,
          tags: _controller.tags,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _controller.createTodo(draft);
    if (created && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('任务已创建')),
      );
    }
  }

  Future<void> _openEditDialog(TodoItem item) async {
    final draft = await showDialog<TodoFormData>(
      context: context,
      builder: (context) {
        return TodoEditorDialog(
          initialValue: TodoFormData.fromTodo(item),
          title: '编辑任务',
          submitLabel: '更新',
          todoLists: _controller.todoLists,
          tags: _controller.tags,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final updated = await _controller.updateTodo(item.id, draft);
    if (updated && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('任务已更新')),
      );
    }
  }

  Future<void> _createTodoList() async {
    final name = await _showNameDialog(
      title: '新建清单',
      labelText: '清单名称',
    );
    if (!mounted || name == null) {
      return;
    }

    final created = await _controller.createTodoList(name);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(created ? '清单已创建' : (_controller.errorMessage ?? '清单创建失败'))),
    );
  }

  Future<void> _createTag() async {
    final name = await _showNameDialog(
      title: '新建标签',
      labelText: '标签名称',
    );
    if (!mounted || name == null) {
      return;
    }

    final created = await _controller.createTag(name);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(created ? '标签已创建' : (_controller.errorMessage ?? '标签创建失败'))),
    );
  }

  Future<void> _editTodoList(String id, String currentName) async {
    final name = await _showNameDialog(
      title: '编辑清单',
      labelText: '清单名称',
      initialValue: currentName,
    );
    if (!mounted || name == null) {
      return;
    }

    final updated = await _controller.updateTodoList(id, name);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(updated ? '清单已更新' : (_controller.errorMessage ?? '清单更新失败'))),
    );
  }

  Future<void> _deleteTodoList(String id, String name) async {
    final confirmed = await _confirmMetadataDelete('清单', name);
    if (!mounted || !confirmed) {
      return;
    }

    final deleted = await _controller.deleteTodoList(id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(deleted ? '清单已删除' : (_controller.errorMessage ?? '清单删除失败'))),
    );
  }

  Future<void> _editTag(String id, String currentName) async {
    final name = await _showNameDialog(
      title: '编辑标签',
      labelText: '标签名称',
      initialValue: currentName,
    );
    if (!mounted || name == null) {
      return;
    }

    final updated = await _controller.updateTag(id, name);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(updated ? '标签已更新' : (_controller.errorMessage ?? '标签更新失败'))),
    );
  }

  Future<void> _deleteTag(String id, String name) async {
    final confirmed = await _confirmMetadataDelete('标签', name);
    if (!mounted || !confirmed) {
      return;
    }

    final deleted = await _controller.deleteTag(id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content:
              Text(deleted ? '标签已删除' : (_controller.errorMessage ?? '标签删除失败'))),
    );
  }

  Future<String?> _showNameDialog({
    required String title,
    required String labelText,
    String initialValue = '',
  }) {
    final controller = TextEditingController(text: initialValue);
    return showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: InputDecoration(labelText: labelText),
            onSubmitted: (value) {
              final name = value.trim();
              if (name.isNotEmpty) {
                Navigator.of(context).pop(name);
              }
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () {
                final name = controller.text.trim();
                if (name.isNotEmpty) {
                  Navigator.of(context).pop(name);
                }
              },
              child: const Text('保存'),
            ),
          ],
        );
      },
    ).whenComplete(controller.dispose);
  }

  Future<bool> _confirmMetadataDelete(String type, String name) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: Text('删除$type'),
              content: Text('确认删除$type“$name”？相关任务会保留。'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error,
                    foregroundColor: Theme.of(context).colorScheme.onError,
                  ),
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('删除'),
                ),
              ],
            );
          },
        ) ??
        false;
  }

  Future<void> _openTodoDetail(TodoItem item) async {
    final relatedReminders = _controller.upcomingReminders
        .where((reminder) => reminder.todoId == item.id)
        .toList(growable: false);

    await showDialog<void>(
      context: context,
      builder: (context) => TodoDetailDialog(
        item: item,
        relatedReminders: relatedReminders,
      ),
    );
  }

  Future<void> _openCreateReminderDialog(TodoItem item) async {
    final draft = await showDialog<ReminderFormData>(
      context: context,
      builder: (context) {
        return ReminderEditorDialog(
          initialValue: ReminderFormData.createDraft(),
          title: '为“${item.title}”添加提醒',
          submitLabel: '保存提醒',
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _controller.createReminder(item.id, draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content:
            Text(created ? '提醒已创建' : (_controller.errorMessage ?? '提醒创建失败')),
      ),
    );
  }

  Future<void> _confirmDeleteTodo(TodoItem item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除任务'),
              content: Text('确认删除“${item.title}”？该操作会把记录标记为已删除。'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error,
                    foregroundColor: Theme.of(context).colorScheme.onError,
                  ),
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('删除'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!mounted || !confirmed) {
      return;
    }

    final deleted = await _controller.deleteTodo(item.id);
    if (deleted && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('任务已删除')),
      );
    }
  }
}
