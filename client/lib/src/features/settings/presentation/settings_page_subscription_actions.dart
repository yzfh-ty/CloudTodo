part of 'settings_page.dart';

extension _SettingsPageSubscriptionActions on _SettingsPageState {
  Future<Set<String>> _availableNotificationChannels() async {
    try {
      final capabilities = await AppScope.of(context).services.serverCapabilitiesRepository.getCapabilities();
      return {'webhook', 'email', 'telegram'}.where(capabilities.channelEnabled).toSet();
    } catch (_) {
      return {'webhook', 'email', 'telegram'};
    }
  }
  Future<void> _createSubscription() async {
    final availableChannels = await _availableNotificationChannels();
    final draft = await showDialog<NotificationSubscriptionFormData>(
      context: context,
      builder: (context) {
        return NotificationSubscriptionEditorDialog(
          initialValue: NotificationSubscriptionFormData.createDraft(),
          title: '添加通知方式',
          submitLabel: '保存',
          isEditing: false,
          availableChannels: availableChannels,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _subscriptionsController.createSubscription(draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(created
            ? '通知方式已创建'
            : (_subscriptionsController.errorMessage ?? '通知方式创建失败')),
      ),
    );
  }

  Future<void> _editSubscription(NotificationSubscription item) async {
    final availableChannels = await _availableNotificationChannels();
    final target = item.channel == 'email' ? item.email : item.channel == 'telegram' ? item.chatId : item.targetUrl;
    final draft = await showDialog<NotificationSubscriptionFormData>(context: context, builder: (context) => NotificationSubscriptionEditorDialog(initialValue: NotificationSubscriptionFormData(channel: item.channel, targetValue: target ?? '', enabled: item.enabled, secret: '', clearSecret: false), title: '编辑通知渠道', submitLabel: '更新', isEditing: true, availableChannels: availableChannels));
    if (!mounted || draft == null) return;
    final updated = await _subscriptionsController.updateSubscription(item.id, draft);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(updated ? '通知渠道已更新' : (_subscriptionsController.errorMessage ?? '通知渠道更新失败'))));
  }
  Future<void> _deleteSubscription(NotificationSubscription item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除通知方式'),
              content: Text('确认删除通知方式“${item.channel}”？'),
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

    final deleted = await _subscriptionsController.deleteSubscription(item.id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(deleted
            ? '通知方式已删除'
            : (_subscriptionsController.errorMessage ?? '通知方式删除失败')),
      ),
    );
  }

  Future<void> _testSubscription(NotificationSubscription item) async {
    final payload = await _subscriptionsController.testSubscription(item.id);
    if (!mounted || payload == null) return;
    final channel = payload['channel'] as String? ?? item.channel;
    final tested = payload['tested'] == true;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('测试结果'),
        content: Text('通知渠道：$channel\n状态：${tested ? '成功' : '失败'}'),
        actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('知道了'))],
      ),
    );
  }
  Future<void> _copySubscriptionUrl(NotificationSubscription item) async {
    final value = item.channel == 'email' ? item.email : item.channel == 'telegram' ? item.chatId : item.targetUrl;
    await Clipboard.setData(ClipboardData(text: value ?? ''));
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('通知方式地址已复制')),
    );
  }
}
