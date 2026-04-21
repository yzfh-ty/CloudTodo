import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/widgets/empty_state_card.dart';
import '../../app/application/app_scope.dart';
import '../../reminders/domain/reminder_form_data.dart';
import '../../reminders/domain/reminder_item.dart';
import '../../reminders/presentation/reminder_detail_dialog.dart';
import '../../reminders/presentation/reminder_editor_dialog.dart';
import '../application/todo_list_controller.dart';
import 'todo_detail_dialog.dart';
import '../domain/todo_form_data.dart';
import '../domain/todo_item.dart';
import 'todo_editor_dialog.dart';

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _controller = TodoListController(
      todoRepository: services.todoRepository,
      remindersRepository: services.remindersRepository,
    )..initialize();
    _initialized = true;
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

        return ListView(
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                gradient: const LinearGradient(
                  colors: [
                    Color(0xFF1D5C63),
                    Color(0xFF2C7A7B),
                    Color(0xFFC56B3D),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '任务中心',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                      '先把用户的个人工作流打通：登录后恢复会话、拉取任务、查看近期提醒，再逐步扩成多端共享的业务层。',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _SummaryCard(label: '当前任务总数', value: '${_controller.total}'),
                      _SummaryCard(label: '待办', value: '${summary['pending'] ?? 0}'),
                      _SummaryCard(label: '已完成', value: '${summary['completed'] ?? 0}'),
                      _SummaryCard(label: '已归档', value: '${summary['archived'] ?? 0}'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 20,
              runSpacing: 20,
              crossAxisAlignment: WrapCrossAlignment.start,
              children: [
                SizedBox(
                  width: 780,
                  child: Column(
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '快速添加',
                                style: theme.textTheme.titleLarge,
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _createController,
                                      decoration: const InputDecoration(
                                        hintText: '输入一条新的任务标题',
                                      ),
                                      onSubmitted: (_) => _createTodo(),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  FilledButton(
                                    onPressed:
                                        _controller.isSubmitting ? null : _createTodo,
                                    child: Text(
                                      _controller.isSubmitting ? '提交中...' : '添加',
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  OutlinedButton(
                                    onPressed: _controller.isSubmitting ? null : _openCreateDialog,
                                    child: const Text('完整表单'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _searchController,
                                      decoration: const InputDecoration(
                                        hintText: '按标题或描述搜索',
                                        prefixIcon: Icon(Icons.search_rounded),
                                      ),
                                      onSubmitted: (value) {
                                        _controller.setKeyword(value);
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  FilledButton.tonal(
                                    onPressed: () {
                                      _controller.setKeyword(_searchController.text);
                                    },
                                    child: const Text('筛选'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  _StatusFilterChip(
                                    label: '待办',
                                    selected: _controller.statusFilter == 'pending',
                                    onSelected: () {
                                      _controller.setStatusFilter('pending');
                                    },
                                  ),
                                  _StatusFilterChip(
                                    label: '已完成',
                                    selected: _controller.statusFilter == 'completed',
                                    onSelected: () {
                                      _controller.setStatusFilter('completed');
                                    },
                                  ),
                                  _StatusFilterChip(
                                    label: '已归档',
                                    selected: _controller.statusFilter == 'archived',
                                    onSelected: () {
                                      _controller.setStatusFilter('archived');
                                    },
                                  ),
                                  _StatusFilterChip(
                                    label: '全部',
                                    selected: _controller.statusFilter == null,
                                    onSelected: () {
                                      _controller.setStatusFilter(null);
                                    },
                                  ),
                                ],
                              ),
                              if (_controller.errorMessage != null) ...[
                                const SizedBox(height: 12),
                                Text(
                                  _controller.errorMessage!,
                                  style: const TextStyle(color: Color(0xFFA12E2E)),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
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
                          description: _controller.keyword.isNotEmpty || _controller.statusFilter != null
                              ? '当前筛选条件下没有匹配的任务，试试切换筛选条件或清空搜索词。'
                              : '先创建第一条任务，再逐步补充提醒和通知方式。',
                          action: FilledButton.tonal(
                            onPressed: _controller.isSubmitting ? null : _openCreateDialog,
                            child: const Text('新建任务'),
                          ),
                        )
                      else
                        ..._controller.items.map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _TodoCard(
                              item: item,
                              onViewDetail: () => _openTodoDetail(item),
                              onEdit: () => _openEditDialog(item),
                              onManageReminder: () => _openCreateReminderDialog(item),
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
                SizedBox(
                  width: 320,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '近期提醒',
                            style: theme.textTheme.titleLarge,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '这里展示近期提醒，用于证明客户端模块拆分已经覆盖任务之外的第二条业务链路。',
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 16),
                          if (_controller.upcomingReminders.isEmpty)
                            const EmptyStateCard(
                              icon: Icons.alarm_off_rounded,
                              title: '暂无近期提醒',
                              description: '你可以在任务卡片里添加提醒，之后这里会显示最近即将触发的提醒。',
                            )
                          else
                            ..._controller.upcomingReminders.map(
                              (item) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _ReminderCard(
                                  item: item,
                                  onViewDetail: () => _openReminderDetail(item),
                                  onEdit: () => _openEditReminderDialog(item),
                                  onDelete: () => _deleteReminder(item),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _createTodo() async {
    final created = await _controller.createTodo(
      TodoFormData.createDraft().copyWith(title: _createController.text),
    );
    if (created) {
      _createController.clear();
    }
  }

  Future<void> _openCreateDialog() async {
    final draft = await showDialog<TodoFormData>(
      context: context,
      builder: (context) {
        return const TodoEditorDialog(
          initialValue: TodoFormData(
            title: '',
            description: '',
            priority: 'medium',
            dueAt: null,
            isAllDay: false,
          ),
          title: '创建任务',
          submitLabel: '保存',
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
    final user = AppScope.of(context).services.sessionController.currentUser;
    final draft = await showDialog<ReminderFormData>(
      context: context,
      builder: (context) {
        return ReminderEditorDialog(
          initialValue: ReminderFormData.createDraft()
              .copyWith(timezone: user?.timezone ?? 'Asia/Shanghai'),
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
        content: Text(created ? '提醒已创建' : (_controller.errorMessage ?? '提醒创建失败')),
      ),
    );
  }

  Future<void> _openEditReminderDialog(ReminderItem item) async {
    final draft = await showDialog<ReminderFormData>(
      context: context,
      builder: (context) {
        return ReminderEditorDialog(
          initialValue: ReminderFormData.fromReminder(item),
          title: '编辑提醒',
          submitLabel: '更新提醒',
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final updated = await _controller.updateReminder(item.id, draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(updated ? '提醒已更新' : (_controller.errorMessage ?? '提醒更新失败')),
      ),
    );
  }

  Future<void> _openReminderDetail(ReminderItem item) async {
    final relatedTodo = _controller.items.where((todo) => todo.id == item.todoId).firstOrNull;
    await showDialog<void>(
      context: context,
      builder: (context) => ReminderDetailDialog(
        item: item,
        todoTitle: relatedTodo?.title,
      ),
    );
  }

  Future<void> _deleteReminder(ReminderItem item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除提醒'),
              content: Text('确认删除提醒 ${formatDateTime(item.remindAt)}？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
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

    final deleted = await _controller.deleteReminder(item.id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(deleted ? '提醒已删除' : (_controller.errorMessage ?? '提醒删除失败')),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white.withValues(alpha: 0.84),
                ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: Colors.white,
                ),
          ),
        ],
      ),
    );
  }
}

class _StatusFilterChip extends StatelessWidget {
  const _StatusFilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}

class _TodoCard extends StatelessWidget {
  const _TodoCard({
    required this.item,
    required this.onViewDetail,
    required this.onEdit,
    required this.onManageReminder,
    required this.onDelete,
    this.onComplete,
    this.onReopen,
    this.onArchive,
  });

  final TodoItem item;
  final VoidCallback onViewDetail;
  final VoidCallback onEdit;
  final VoidCallback onManageReminder;
  final VoidCallback? onComplete;
  final VoidCallback? onReopen;
  final VoidCallback? onArchive;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (item.status) {
      'completed' => const Color(0xFF2C7A7B),
      'archived' => const Color(0xFF8A6B53),
      _ => const Color(0xFFA2471E),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    todoStatusText(item.status),
                    style: TextStyle(color: statusColor),
                  ),
                ),
              ],
            ),
            if (item.description != null && item.description!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(item.description!),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                _InfoTag(label: '优先级', value: todoPriorityText(item.priority)),
                _InfoTag(label: '截止', value: formatDateTime(item.dueAt)),
                _InfoTag(label: '更新于', value: formatDateTime(item.updatedAt)),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (onComplete != null)
                  FilledButton.tonal(
                    onPressed: onComplete,
                    child: const Text('完成'),
                  ),
                if (onReopen != null)
                  FilledButton.tonal(
                    onPressed: onReopen,
                    child: const Text('重新打开'),
                  ),
                if (onArchive != null)
                  FilledButton.tonal(
                    onPressed: onArchive,
                    child: const Text('归档'),
                  ),
                FilledButton.tonal(
                  onPressed: onViewDetail,
                  child: const Text('详情'),
                ),
                FilledButton.tonal(
                  onPressed: onEdit,
                  child: const Text('编辑'),
                ),
                FilledButton.tonal(
                  onPressed: onManageReminder,
                  child: const Text('提醒'),
                ),
                TextButton(
                  onPressed: onDelete,
                  child: const Text('删除'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoTag extends StatelessWidget {
  const _InfoTag({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text('$label：$value'),
    );
  }
}

class _ReminderCard extends StatelessWidget {
  const _ReminderCard({
    required this.item,
    required this.onViewDetail,
    required this.onEdit,
    required this.onDelete,
  });

  final ReminderItem item;
  final VoidCallback onViewDetail;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            reminderChannelText(item.channel),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text('任务 ID：${item.todoId}'),
          Text('提醒时间：${formatDateTime(item.remindAt)}'),
          Text('重复：${reminderRepeatTypeText(item.repeatType)}'),
          Text('状态：${reminderStatusText(item.status)}'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              FilledButton.tonal(
                onPressed: onViewDetail,
                child: const Text('详情'),
              ),
              FilledButton.tonal(
                onPressed: onEdit,
                child: const Text('编辑'),
              ),
              TextButton(
                onPressed: onDelete,
                child: const Text('删除'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
