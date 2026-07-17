import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../app/application/app_scope.dart';
import '../application/notification_endpoints_controller.dart';
import '../domain/notification_endpoint.dart';
import '../domain/notification_endpoint_form_data.dart';
import 'notification_endpoint_editor_dialog.dart';

class NotificationEndpointsPage extends StatefulWidget {
  const NotificationEndpointsPage({super.key});

  @override
  State<NotificationEndpointsPage> createState() =>
      _NotificationEndpointsPageState();
}

class _NotificationEndpointsPageState extends State<NotificationEndpointsPage> {
  late final NotificationEndpointsController _controller;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _controller = NotificationEndpointsController(
      repository: services.notificationEndpointsRepository,
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
        final isMobile = MediaQuery.sizeOf(context).width < 600;

        return ListView(
          children: [
            Text(
              '通知方式',
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: _controller.isLoading ? null : _createEndpoint,
                  icon: const Icon(Icons.add_link_rounded),
                  label: const Text('新增方式'),
                ),
                const SizedBox(width: 12),
                OutlinedButton(
                  onPressed: _controller.isLoading ? null : _controller.load,
                  child: const Text('刷新'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '管理通知地址、启用状态和连通性测试。',
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
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
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ),
              )
            else if (_controller.items.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('当前还没有通知方式。'),
                ),
              )
            else
              ..._controller.items.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildEndpointHeader(
                            context,
                            item,
                            isMobile,
                          ),
                          const SizedBox(height: 8),
                          SelectableText(item.targetUrl),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              _Chip(
                                  label: '类型',
                                  value: endpointTypeText(item.type)),
                              _Chip(
                                  label: '状态',
                                  value: enabledStatusText(item.isEnabled)),
                              _Chip(
                                  label: '密钥',
                                  value: item.secretExists ? '已设置' : '未设置'),
                              _Chip(
                                  label: '创建时间',
                                  value: formatDateTime(item.createdAt)),
                              _Chip(
                                  label: '最近成功',
                                  value: formatDateTime(item.lastSuccessAt)),
                              _Chip(
                                  label: '最近失败',
                                  value: formatDateTime(item.lastFailureAt)),
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

  Widget _buildEndpointHeader(
    BuildContext context,
    NotificationEndpoint item,
    bool isMobile,
  ) {
    final title = Text(
      item.name,
      style: Theme.of(context).textTheme.titleLarge,
    );
    final actions = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        FilledButton.tonal(
          onPressed:
              _controller.testingId == item.id ? null : () => _test(item),
          child: Text(_controller.testingId == item.id ? '测试中...' : '模拟测试'),
        ),
        FilledButton.tonal(
          onPressed:
              _controller.submittingId == item.id ? null : () => _edit(item),
          child: const Text('编辑'),
        ),
        TextButton(
          style: TextButton.styleFrom(
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed:
              _controller.submittingId == item.id ? null : () => _delete(item),
          child: const Text('删除'),
        ),
      ],
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title,
          const SizedBox(height: 12),
          actions,
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: title),
        const SizedBox(width: 12),
        actions,
      ],
    );
  }

  Future<void> _test(NotificationEndpoint item) async {
    final payload = await _controller.testEndpoint(item.id);
    if (!mounted || payload == null) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '通知方式 ${payload['endpoint_id']} 已完成一次模拟测试，状态：${payload['status']}',
        ),
      ),
    );
  }

  Future<void> _createEndpoint() async {
    final draft = await showDialog<NotificationEndpointFormData>(
      context: context,
      builder: (context) {
        return NotificationEndpointEditorDialog(
          initialValue: NotificationEndpointFormData.createDraft(),
          title: '创建通知方式',
          submitLabel: '保存',
          isEditing: false,
        );
      },
    );

    if (!mounted || draft == null) {
      return;
    }

    final created = await _controller.createEndpoint(draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            created ? '通知方式已创建' : (_controller.errorMessage ?? '通知方式创建失败')),
      ),
    );
  }

  Future<void> _edit(NotificationEndpoint item) async {
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

    final updated = await _controller.updateEndpoint(item.id, draft);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            updated ? '通知方式已更新' : (_controller.errorMessage ?? '通知方式更新失败')),
      ),
    );
  }

  Future<void> _delete(NotificationEndpoint item) async {
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

    final deleted = await _controller.deleteEndpoint(item.id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            deleted ? '通知方式已删除' : (_controller.errorMessage ?? '通知方式删除失败')),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
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
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text('$label：$value'),
    );
  }
}
