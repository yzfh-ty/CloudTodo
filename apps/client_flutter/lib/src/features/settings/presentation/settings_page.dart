import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../app/application/app_scope.dart';
import '../../notification_endpoints/application/notification_endpoints_controller.dart';
import '../../notification_endpoints/domain/notification_endpoint.dart';
import '../../notification_endpoints/domain/notification_endpoint_form_data.dart';
import '../../notification_endpoints/presentation/notification_endpoint_editor_dialog.dart';
import '../../profile/application/profile_controller.dart';
import '../../profile/domain/profile_user.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.onLogout,
  });

  final Future<void> Function() onLogout;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _formKey = GlobalKey<FormState>();
  final _nicknameController = TextEditingController();
  final _emailController = TextEditingController();
  final _timezoneController = TextEditingController();

  late final ProfileController _profileController;
  late final NotificationEndpointsController _endpointsController;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _profileController = ProfileController(
      repository: services.profileRepository,
      sessionController: services.sessionController,
    )..load();
    _endpointsController = NotificationEndpointsController(
      repository: services.notificationEndpointsRepository,
    )..load();
    _initialized = true;
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    _emailController.dispose();
    _timezoneController.dispose();
    _profileController.dispose();
    _endpointsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([
        _profileController,
        _endpointsController,
      ]),
      builder: (context, _) {
        final theme = Theme.of(context);
        final currentUser = AppScope.of(context).services.sessionController.currentUser;
        final profile = _profileController.profile;
        if (profile != null) {
          _bindProfile(profile);
        }

        return ListView(
          children: [
            Text(
              '设置',
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              '这里统一放账户资料、时区、通知方式和退出，不再把这些内容拆成多个一级菜单。',
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '账户',
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _MetaChip(label: '昵称', value: currentUser?.nickname ?? '-'),
                        _MetaChip(label: '邮箱', value: currentUser?.email ?? '-'),
                        _MetaChip(
                          label: '时区',
                          value: currentUser == null ? '-' : timezoneText(currentUser.timezone),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    FilledButton.tonalIcon(
                      onPressed: widget.onLogout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('退出登录'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '个人资料',
                        style: theme.textTheme.titleLarge,
                      ),
                      const SizedBox(height: 12),
                      if (_profileController.errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            _profileController.errorMessage!,
                            style: const TextStyle(color: Color(0xFFA12E2E)),
                          ),
                        ),
                      Wrap(
                        spacing: 16,
                        runSpacing: 12,
                        children: [
                          _MetaChip(label: '用户 ID', value: profile?.id ?? '-'),
                          _MetaChip(
                            label: '角色',
                            value: profile == null ? '-' : (profile.role == 'admin' ? '管理员' : '普通用户'),
                          ),
                          _MetaChip(
                            label: '状态',
                            value: profile == null ? '-' : (profile.status == 'active' ? '正常' : profile.status),
                          ),
                          _MetaChip(
                            label: '最近登录',
                            value: formatDateTime(profile?.lastLoginAt),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      TextFormField(
                        controller: _nicknameController,
                        decoration: const InputDecoration(labelText: '昵称'),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _emailController,
                        decoration: const InputDecoration(labelText: '邮箱'),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty || !value.contains('@')) {
                            return '请输入合法邮箱';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _timezoneController,
                        decoration: const InputDecoration(labelText: '时区'),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return '请输入时区';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      Text(
                        '创建时间：${formatDateTime(profile?.createdAt)}\n更新时间：${formatDateTime(profile?.updatedAt)}',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF5B4D47),
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _profileController.isSaving ? null : _saveProfile,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          child: Text(_profileController.isSaving ? '保存中...' : '保存资料'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '通知方式',
                            style: theme.textTheme.titleLarge,
                          ),
                        ),
                        FilledButton.icon(
                          onPressed: _endpointsController.isLoading ? null : _createEndpoint,
                          icon: const Icon(Icons.add_link_rounded),
                          label: const Text('新增方式'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '如果你希望把提醒推送到企业微信机器人或自己的服务，可以在这里配置通知方式。',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    if (_endpointsController.errorMessage != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _endpointsController.errorMessage!,
                          style: const TextStyle(color: Color(0xFFA12E2E)),
                        ),
                      ),
                    if (_endpointsController.isLoading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (_endpointsController.items.isEmpty)
                      const Text('当前还没有通知方式。')
                    else
                      ..._endpointsController.items.map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _EndpointCard(
                            item: item,
                            busy: _endpointsController.submittingId == item.id ||
                                _endpointsController.testingId == item.id,
                            onTest: () => _testEndpoint(item),
                            onEdit: () => _editEndpoint(item),
                            onDelete: () => _deleteEndpoint(item),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final updated = await _profileController.save(
      nickname: _nicknameController.text,
      email: _emailController.text,
      timezone: _timezoneController.text,
    );

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(updated ? '资料已更新' : (_profileController.errorMessage ?? '资料更新失败')),
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
        content: Text(created ? '通知方式已创建' : (_endpointsController.errorMessage ?? '通知方式创建失败')),
      ),
    );
  }

  Future<void> _editEndpoint(NotificationEndpoint item) async {
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
        content: Text(updated ? '通知方式已更新' : (_endpointsController.errorMessage ?? '通知方式更新失败')),
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
        content: Text(deleted ? '通知方式已删除' : (_endpointsController.errorMessage ?? '通知方式删除失败')),
      ),
    );
  }

  Future<void> _testEndpoint(NotificationEndpoint item) async {
    final payload = await _endpointsController.testEndpoint(item.id);
    if (!mounted || payload == null) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '通知方式 ${item.name} 已完成一次模拟测试，状态：${payload['status']}',
        ),
      ),
    );
  }

  void _bindProfile(ProfileUser profile) {
    _nicknameController.text = profile.nickname;
    _emailController.text = profile.email;
    _timezoneController.text = profile.timezone;
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text('$label：$value'),
    );
  }
}

class _EndpointCard extends StatelessWidget {
  const _EndpointCard({
    required this.item,
    required this.busy,
    required this.onTest,
    required this.onEdit,
    required this.onDelete,
  });

  final NotificationEndpoint item;
  final bool busy;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F0E6),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              FilledButton.tonal(
                onPressed: busy ? null : onTest,
                child: const Text('测试'),
              ),
              const SizedBox(width: 8),
              FilledButton.tonal(
                onPressed: busy ? null : onEdit,
                child: const Text('编辑'),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: busy ? null : onDelete,
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
              _MetaChip(
                label: '方式',
                value: item.targetUrl.contains('weixin.qq.com/cgi-bin/webhook/send')
                    ? '企业微信机器人'
                    : '标准 Webhook',
              ),
              _MetaChip(label: '状态', value: enabledStatusText(item.isEnabled)),
              _MetaChip(label: '创建时间', value: formatDateTime(item.createdAt)),
              _MetaChip(label: '最近成功', value: formatDateTime(item.lastSuccessAt)),
              _MetaChip(label: '最近失败', value: formatDateTime(item.lastFailureAt)),
            ],
          ),
        ],
      ),
    );
  }
}
