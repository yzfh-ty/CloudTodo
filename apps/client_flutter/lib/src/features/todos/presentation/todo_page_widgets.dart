part of 'todo_page.dart';

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
    return SizedBox(
      width: 96,
      height: 44,
      child: ChoiceChip(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        labelPadding: EdgeInsets.zero,
        avatar: SizedBox(
          width: 18,
          child: selected ? const Icon(Icons.check_rounded, size: 18) : null,
        ),
        label: SizedBox(
          width: 44,
          child: Text(
            label,
            maxLines: 1,
            softWrap: false,
            textAlign: TextAlign.center,
            overflow: TextOverflow.visible,
          ),
        ),
        selected: selected,
        showCheckmark: false,
        onSelected: (_) => onSelected(),
      ),
    );
  }
}

enum _TodoAction { detail, edit, reminder, archive, delete }

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

  void _handleAction(_TodoAction action) {
    switch (action) {
      case _TodoAction.detail:
        onViewDetail();
      case _TodoAction.edit:
        onEdit();
      case _TodoAction.reminder:
        onManageReminder();
      case _TodoAction.archive:
        onArchive?.call();
      case _TodoAction.delete:
        onDelete();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isCompleted = item.status == 'completed';
    final statusAction = item.status == 'pending' ? onComplete : onReopen;
    final statusIcon = switch (item.status) {
      'completed' => Icons.check_circle_rounded,
      'archived' => Icons.inventory_2_outlined,
      _ => Icons.radio_button_unchecked_rounded,
    };
    final statusColor = switch (item.status) {
      'completed' => scheme.secondary,
      'archived' => scheme.outline,
      _ => scheme.primary,
    };

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconButton(
              tooltip: item.status == 'pending' ? '完成待办' : '重新打开',
              visualDensity: VisualDensity.compact,
              onPressed: statusAction,
              icon: Icon(statusIcon, color: statusColor),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            decoration:
                                isCompleted ? TextDecoration.lineThrough : null,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _StatusLabel(
                        text: todoStatusText(item.status),
                        color: statusColor,
                      ),
                    ],
                  ),
                  if (item.description != null &&
                      item.description!.trim().isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      item.description!.trim(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 10,
                    runSpacing: 4,
                    children: [
                      _InfoTag(
                        icon: Icons.flag_outlined,
                        value: todoPriorityText(item.priority),
                      ),
                      if (item.dueAt != null)
                        _InfoTag(
                          icon: Icons.schedule_rounded,
                          value: formatDateTime(item.dueAt),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            PopupMenuButton<_TodoAction>(
              tooltip: '更多操作',
              icon: const Icon(Icons.more_vert_rounded),
              onSelected: _handleAction,
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: _TodoAction.detail,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.open_in_new_rounded),
                    title: Text('查看详情'),
                  ),
                ),
                const PopupMenuItem(
                  value: _TodoAction.edit,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.edit_outlined),
                    title: Text('编辑待办'),
                  ),
                ),
                const PopupMenuItem(
                  value: _TodoAction.reminder,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.alarm_add_outlined),
                    title: Text('管理提醒'),
                  ),
                ),
                if (onArchive != null)
                  const PopupMenuItem(
                    value: _TodoAction.archive,
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.archive_outlined),
                      title: Text('归档待办'),
                    ),
                  ),
                const PopupMenuItem(
                  value: _TodoAction.delete,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.delete_outline_rounded),
                    title: Text('删除待办'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusLabel extends StatelessWidget {
  const _StatusLabel({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

class _InfoTag extends StatelessWidget {
  const _InfoTag({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 3),
        Text(
          value,
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
