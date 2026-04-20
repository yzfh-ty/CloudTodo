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
  State<NotificationEndpointsPage> createState() => _NotificationEndpointsPageState();
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

        return ListView(
          children: [
            Text(
              '通知端点',
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: _controller.isLoading ? null : _createEndpoint,
                  icon: const Icon(Icons.add_link_rounded),
                  label: const Text('新增端点'),
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
              '该模块对应通知端点接口。当前已经补到列表、创建、编辑、删除和模拟测试，三端可共用这套端点配置流。',
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
                    style: const TextStyle(color: Color(0xFFA12E2E)),
                  ),
                ),
              )
            else if (_controller.items.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('当前还没有通知端点。'),
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
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  item.name,
                                  style: theme.textTheme.titleLarge,
                                ),
                              ),
                              FilledButton.tonal(
                                onPressed: _controller.testingId == item.id
                                    ? null
                                    : () => _test(item),
                                child: Text(
                                  _controller.testingId == item.id ? '测试中...' : '模拟测试',
                                ),
                              ),
                              const SizedBox(width: 8),
                              FilledButton.tonal(
                                onPressed: _controller.submittingId == item.id
                                    ? null
                                    : () => _edit(item),
                                child: const Text('编辑'),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                                onPressed: _controller.submittingId == item.id
                                    ? null
                                    : () => _delete(item),
                                child: const Text('删除'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          SelectableText(item.targetUrl),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              _Chip(label: '类型', value: endpointTypeText(item.type)),
                              _Chip(label: '状态', value: enabledStatusText(item.isEnabled)),
                              _Chip(label: '创建时间', value: formatDateTime(item.createdAt)),
                              _Chip(label: '最近成功', value: formatDateTime(item.lastSuccessAt)),
                              _Chip(label: '最近失败', value: formatDateTime(item.lastFailureAt)),
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

  Future<void> _test(NotificationEndpoint item) async {
    final payload = await _controller.testEndpoint(item.id);
    if (!mounted || payload == null) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '端点 ${payload['endpoint_id']} 已完成一次模拟测试，状态：${payload['status']}',
        ),
      ),
    );
  }

  Future<void> _createEndpoint() async {
    final draft = await showDialog<NotificationEndpointFormData>(
      context: context,
      builder: (context) {
        return const NotificationEndpointEditorDialog(
          initialValue: NotificationEndpointFormData(
            deliveryKind: 'standard_webhook',
            name: '',
            targetUrl: '',
            payloadTemplate: '',
            isEnabled: true,
            secret: '',
            clearSecret: false,
          ),
          title: '创建端点',
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
        content: Text(created ? '端点已创建' : (_controller.errorMessage ?? '端点创建失败')),
      ),
    );
  }

  Future<void> _edit(NotificationEndpoint item) async {
    final draft = await showDialog<NotificationEndpointFormData>(
      context: context,
      builder: (context) {
        return NotificationEndpointEditorDialog(
          initialValue: NotificationEndpointFormData(
            deliveryKind: item.targetUrl.contains('weixin.qq.com/cgi-bin/webhook/send')
                ? 'wecom_robot'
                : 'standard_webhook',
            name: item.name,
            targetUrl: item.targetUrl,
            payloadTemplate: item.payloadTemplate ?? '',
            isEnabled: item.isEnabled,
            secret: '',
            clearSecret: false,
          ),
          title: '编辑端点',
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
        content: Text(updated ? '端点已更新' : (_controller.errorMessage ?? '端点更新失败')),
      ),
    );
  }

  Future<void> _delete(NotificationEndpoint item) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除端点'),
              content: Text('确认删除端点“${item.name}”？'),
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

    final deleted = await _controller.deleteEndpoint(item.id);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(deleted ? '端点已删除' : (_controller.errorMessage ?? '端点删除失败')),
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
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text('$label：$value'),
    );
  }
}
