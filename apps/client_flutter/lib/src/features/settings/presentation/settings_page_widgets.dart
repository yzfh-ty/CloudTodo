part of 'settings_page.dart';

class _CenteredEmptyState extends StatelessWidget {
  const _CenteredEmptyState({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: SizedBox(
          width: double.infinity,
          child: child,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text('$label：$value'),
    );
  }
}

class _EndpointCard extends StatelessWidget {
  const _EndpointCard({
    required this.item,
    required this.busy,
    required this.onCopyUrl,
    required this.onTest,
    required this.onEdit,
    required this.onDelete,
  });

  final NotificationEndpoint item;
  final bool busy;
  final VoidCallback onCopyUrl;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 600;
    final title = Text(
      item.name,
      style: Theme.of(context).textTheme.titleMedium,
    );
    final actions = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        FilledButton.tonal(
          onPressed: busy ? null : onTest,
          child: const Text('测试'),
        ),
        FilledButton.tonal(
          onPressed: busy ? null : onCopyUrl,
          child: const Text('复制地址'),
        ),
        FilledButton.tonal(
          onPressed: busy ? null : onEdit,
          child: const Text('编辑'),
        ),
        TextButton(
          style: TextButton.styleFrom(
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: busy ? null : onDelete,
          child: const Text('删除'),
        ),
      ],
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isMobile) ...[
            title,
            const SizedBox(height: 12),
            actions,
          ] else
            Row(
              children: [
                Expanded(child: title),
                const SizedBox(width: 12),
                actions,
              ],
            ),
          const SizedBox(height: 8),
          SelectableText(item.targetUrl),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              _MetaChip(
                label: '方式',
                value: item.targetUrl
                        .contains('weixin.qq.com/cgi-bin/webhook/send')
                    ? '企业微信机器人'
                    : '标准 Webhook',
              ),
              _MetaChip(label: '状态', value: enabledStatusText(item.isEnabled)),
              _MetaChip(label: '最近结果', value: _latestResultText(item)),
              _MetaChip(label: '上次测试', value: _latestTestedAtText(item)),
              _MetaChip(
                label: '最近响应码',
                value: item.lastResponseCode?.toString() ?? '无',
              ),
              _MetaChip(label: '创建时间', value: formatDateTime(item.createdAt)),
              _MetaChip(
                label: '最近成功',
                value: formatDateTime(item.lastSuccessAt),
              ),
              _MetaChip(
                label: '最近失败',
                value: formatDateTime(item.lastFailureAt),
              ),
            ],
          ),
          if (item.lastResponseSummary?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '最近返回摘要：${item.lastResponseSummary}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DeviceCard extends StatelessWidget {
  const _DeviceCard({
    required this.item,
    required this.busy,
    required this.onDelete,
  });

  final DeviceItem item;
  final bool busy;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.sizeOf(context).width < 600;
    final details = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.devices_rounded),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.deviceName.isEmpty ? item.platform : item.deviceName,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                '平台：${devicePlatformText(item.platform)}\n版本：${item.appVersion ?? '-'}\n最近活跃：${formatDateTime(item.lastActiveAt)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ],
    );
    final actions = Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _MetaChip(label: '状态', value: item.isOnline ? '在线' : '离线'),
        TextButton(
          style: TextButton.styleFrom(
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: busy ? null : onDelete,
          child: const Text('删除'),
        ),
      ],
    );

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: isMobile
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                details,
                const SizedBox(height: 12),
                actions,
              ],
            )
          : Row(
              children: [
                Expanded(child: details),
                const SizedBox(width: 12),
                actions,
              ],
            ),
    );
  }
}

String _latestResultText(NotificationEndpoint item) {
  if (item.lastSuccessAt == null && item.lastFailureAt == null) {
    return '未测试';
  }
  if (item.lastSuccessAt != null && item.lastFailureAt == null) {
    return '最近成功';
  }
  if (item.lastSuccessAt == null && item.lastFailureAt != null) {
    return '最近失败';
  }
  return item.lastSuccessAt!.isAfter(item.lastFailureAt!) ? '最近成功' : '最近失败';
}

String _latestTestedAtText(NotificationEndpoint item) {
  if (item.lastSuccessAt == null && item.lastFailureAt == null) {
    return '未测试';
  }
  if (item.lastSuccessAt == null) {
    return formatDateTime(item.lastFailureAt);
  }
  if (item.lastFailureAt == null) {
    return formatDateTime(item.lastSuccessAt);
  }
  final latest = item.lastSuccessAt!.isAfter(item.lastFailureAt!)
      ? item.lastSuccessAt
      : item.lastFailureAt;
  return formatDateTime(latest);
}
