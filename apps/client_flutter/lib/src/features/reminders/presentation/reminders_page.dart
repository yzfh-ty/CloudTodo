import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../app/application/app_scope.dart';
import '../application/reminders_controller.dart';
import '../domain/reminder_form_data.dart';
import '../domain/reminder_item.dart';
import 'reminder_editor_dialog.dart';

class RemindersPage extends StatefulWidget {
  const RemindersPage({super.key});

  @override
  State<RemindersPage> createState() => _RemindersPageState();
}

class _RemindersPageState extends State<RemindersPage> {
  late final RemindersController _controller;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _controller = RemindersController(
      remindersRepository: services.remindersRepository,
      todoRepository: services.todoRepository,
    )..load();
    _initialized = true;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final theme = Theme.of(context);
        final todoTitleById = {
          for (final todo in _controller.todos) todo.id: todo.title,
        };

        return ListView(
          children: [
            Text(
              '提醒中心',
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              '提醒现在已经提升成独立模块，不再只是任务列表里的附属按钮。这里统一管理近期提醒，并为后续 Android 和 Windows 本地提醒扩展留入口。',
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '新建提醒',
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        SizedBox(
                          width: 320,
                            child: DropdownButtonFormField<String>(
                              value: _controller.selectedTodoId,
                            decoration: const InputDecoration(
                              labelText: '选择任务',
                            ),
                            items: _controller.todos
                                .map(
                                  (todo) => DropdownMenuItem<String>(
                                    value: todo.id,
                                    child: Text(todo.title),
                                  ),
                                )
                                .toList(growable: false),
                            onChanged: _controller.setSelectedTodoId,
                          ),
                        ),
                        FilledButton.icon(
                          onPressed: _controller.isLoading || _controller.selectedTodoId == null
                              ? null
                              : _createReminder,
                          icon: const Icon(Icons.alarm_add_rounded),
                          label: const Text('添加提醒'),
                        ),
                        OutlinedButton(
                          onPressed: _controller.isLoading ? null : _controller.load,
                          child: const Text('刷新'),
                        ),
                      ],
                    ),
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
            else if (_controller.errorMessage != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    _controller.errorMessage!,
                    style: const TextStyle(color: Color(0xFFA12E2E)),
                  ),
                ),
              )
            else if (_controller.reminders.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('当前没有近期提醒。'),
                ),
              )
            else
              ..._controller.reminders.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      todoTitleById[item.todoId] ?? item.todoId,
                                      style: theme.textTheme.titleLarge,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '提醒时间：${formatDateTime(item.remindAt)}',
                                      style: theme.textTheme.bodyMedium,
                                    ),
                                  ],
                                ),
                              ),
                              FilledButton.tonal(
                                onPressed: _controller.submittingId == item.id
                                    ? null
                                    : () => _editReminder(item),
                                child: const Text('编辑'),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                                onPressed: _controller.submittingId == item.id
                                    ? null
                                    : () => _deleteReminder(item),
                                child: const Text('删除'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              _MetaChip(label: '任务 ID', value: item.todoId),
                              _MetaChip(label: '通道', value: reminderChannelText(item.channel)),
                              _MetaChip(label: '重复', value: reminderRepeatTypeText(item.repeatType)),
                              _MetaChip(label: '时区', value: timezoneText(item.timezone)),
                              _MetaChip(label: '状态', value: reminderStatusText(item.status)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Future<void> _createReminder() async {
    if (_controller.selectedTodoId == null) {
      return;
    }

    final user = AppScope.of(context).services.sessionController.currentUser;

    final draft = await showDialog<ReminderFormData>(
      context: context,
      builder: (context) {
        return ReminderEditorDialog(
          initialValue: ReminderFormData.createDraft()
              .copyWith(timezone: user?.timezone ?? 'Asia/Shanghai'),
          title: '创建提醒',
          submitLabel: '保存提醒',
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _controller.createReminder(draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(created ? '提醒已创建' : (_controller.errorMessage ?? '提醒创建失败')),
      ),
    );
  }

  Future<void> _editReminder(ReminderItem item) async {
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

  Future<void> _deleteReminder(ReminderItem item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除提醒'),
              content: Text('确认删除 ${formatDateTime(item.remindAt)} 这条提醒？'),
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
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
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
