import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../reminders/domain/reminder_item.dart';
import '../domain/todo_item.dart';

class TodoDetailDialog extends StatelessWidget {
  const TodoDetailDialog({
    super.key,
    required this.item,
    required this.relatedReminders,
  });

  final TodoItem item;
  final List<ReminderItem> relatedReminders;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '任务详情',
                  style: theme.textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  item.title,
                  style: theme.textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _DetailChip(label: '状态', value: todoStatusText(item.status)),
                    _DetailChip(label: '优先级', value: todoPriorityText(item.priority)),
                    _DetailChip(label: '截止时间', value: formatDateTime(item.dueAt)),
                    _DetailChip(label: '全天事项', value: item.isAllDay ? '是' : '否'),
                  ],
                ),
                const SizedBox(height: 20),
                _Section(
                  title: '描述',
                  child: Text(
                    item.description?.trim().isNotEmpty == true ? item.description! : '暂无描述',
                  ),
                ),
                const SizedBox(height: 16),
                _Section(
                  title: '时间信息',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('创建时间：${formatDateTime(item.createdAt)}'),
                      Text('更新时间：${formatDateTime(item.updatedAt)}'),
                      Text('完成时间：${formatDateTime(item.completedAt)}'),
                      Text('归档时间：${formatDateTime(item.archivedAt)}'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _Section(
                  title: '近期关联提醒',
                  child: relatedReminders.isEmpty
                      ? const Text('当前没有近期提醒')
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('共 ${relatedReminders.length} 条近期提醒'),
                            const SizedBox(height: 8),
                            ...relatedReminders.map(
                              (reminder) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.65),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${reminderChannelText(reminder.channel)} · ${reminderRepeatTypeText(reminder.repeatType)}',
                                        style: theme.textTheme.bodyMedium?.copyWith(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text('提醒时间：${formatDateTime(reminder.remindAt)}'),
                                      Text('状态：${reminderStatusText(reminder.status)}'),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
                const SizedBox(height: 20),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('关闭'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _DetailChip extends StatelessWidget {
  const _DetailChip({
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
