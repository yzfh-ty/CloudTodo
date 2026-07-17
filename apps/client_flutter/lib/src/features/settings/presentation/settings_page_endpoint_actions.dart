part of 'settings_page.dart';

extension _SettingsPageEndpointActions on _SettingsPageState {
  Future<void> _createEndpoint() async {
    final draft = await showDialog<NotificationEndpointFormData>(
      context: context,
      builder: (context) {
        return NotificationEndpointEditorDialog(
          initialValue: NotificationEndpointFormData.createDraft(),
          title: '添加通知方式',
          submitLabel: '保存',
          isEditing: false,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _endpointsController.createEndpoint(draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(created
            ? '通知方式已创建'
            : (_endpointsController.errorMessage ?? '通知方式创建失败')),
      ),
    );
  }

  Future<void> _editEndpoint(NotificationEndpoint item) async {
    final draft = await showDialog<NotificationEndpointFormData>(
      context: context,
      builder: (context) {
        return NotificationEndpointEditorDialog(
          initialValue: NotificationEndpointFormData(
            deliveryKind:
                item.targetUrl.contains('weixin.qq.com/cgi-bin/webhook/send')
                    ? 'wecom_robot'
                    : 'standard_webhook',
            name: item.name,
            targetUrl: item.targetUrl,
            payloadTemplate: item.payloadTemplate ?? '',
            isEnabled: item.isEnabled,
            secret: '',
            clearSecret: false,
          ),
          title: '编辑通知方式',
          submitLabel: '更新',
          isEditing: true,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final updated = await _endpointsController.updateEndpoint(item.id, draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(updated
            ? '通知方式已更新'
            : (_endpointsController.errorMessage ?? '通知方式更新失败')),
      ),
    );
  }

  Future<void> _deleteEndpoint(NotificationEndpoint item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除通知方式'),
              content: Text('确认删除通知方式“${item.name}”？'),
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

    final deleted = await _endpointsController.deleteEndpoint(item.id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(deleted
            ? '通知方式已删除'
            : (_endpointsController.errorMessage ?? '通知方式删除失败')),
      ),
    );
  }

  Future<void> _testEndpoint(NotificationEndpoint item) async {
    final payload = await _endpointsController.testEndpoint(item.id);
    if (!mounted || payload == null) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) {
        final provider = payload['provider'] as String?;
        final providerText = switch (provider) {
          'wecom_robot' => '企业微信机器人',
          'standard_webhook' => '标准 Webhook',
          _ => '未识别方式',
        };
        final responseCode = payload['response_code']?.toString() ?? '-';
        final responseBody = payload['response_body']?.toString() ?? '无返回内容';
        final renderedBody = payload['rendered_body']?.toString() ?? '无请求体预览';
        final testedAt = payload['tested_at']?.toString();

        return AlertDialog(
          title: const Text('测试结果'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('通知方式：${item.name}'),
                  Text('类型：$providerText'),
                  Text(
                      '状态：${endpointTestStatusText(payload['status']?.toString() ?? '-')}'),
                  Text('响应码：$responseCode'),
                  Text(
                      '测试时间：${testedAt == null ? '-' : formatDateTime(DateTime.tryParse(testedAt))}'),
                  const SizedBox(height: 12),
                  const Text(
                    '返回内容',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  _PayloadPreview(value: responseBody),
                  const SizedBox(height: 12),
                  const Text(
                    '本次请求体',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  _PayloadPreview(value: renderedBody),
                ],
              ),
            ),
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('知道了'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _copyEndpointUrl(NotificationEndpoint item) async {
    await Clipboard.setData(ClipboardData(text: item.targetUrl));
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('通知方式地址已复制')),
    );
  }
}

class _PayloadPreview extends StatelessWidget {
  const _PayloadPreview({required this.value});

  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        value,
        style: const TextStyle(
          fontFamily: 'DejaVuSans',
          fontFamilyFallback: ['DroidSansFallback'],
          fontSize: 12,
          height: 1.5,
        ),
      ),
    );
  }
}
