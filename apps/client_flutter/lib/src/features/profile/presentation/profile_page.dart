import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/utils/timezone_options.dart';
import '../../app/application/app_scope.dart';
import '../application/profile_controller.dart';
import '../domain/profile_user.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _nicknameController = TextEditingController();
  final _emailController = TextEditingController();
  final _timezoneController = TextEditingController();
  late final ProfileController _controller;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    _controller = ProfileController(
      repository: services.profileRepository,
      sessionController: services.sessionController,
    )..load();
    _initialized = true;
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    _emailController.dispose();
    _timezoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final theme = Theme.of(context);
        final profile = _controller.profile;
        if (profile != null) {
          _bindProfile(profile);
        }

        return ListView(
          children: [
            Text(
              '我的资料',
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              '这里直接对接 `/api/users/me`。用户资料和会话资料拆开建模，避免后续 Android / Windows 端继续开发时混成一个“大而全”的状态对象。',
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
            else ...[
              if (_controller.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _controller.errorMessage!,
                    style: const TextStyle(color: Color(0xFFA12E2E)),
                  ),
                ),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
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
                        DropdownButtonFormField<String>(
                          value: _timezoneController.text.isEmpty ? null : _timezoneController.text,
                          decoration: const InputDecoration(labelText: '时区'),
                          items: kCommonTimezones
                              .map(
                                (timezone) => DropdownMenuItem<String>(
                                  value: timezone,
                                  child: Text(timezoneText(timezone)),
                                ),
                              )
                              .toList(growable: false),
                          onChanged: (value) {
                            if (value == null) {
                              return;
                            }
                            _timezoneController.text = value;
                          },
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return '请选择时区';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        Text(
                          '创建时间：${formatDateTime(profile?.createdAt)}\n更新时间：${formatDateTime(profile?.updatedAt)}\n当前时区：${profile == null ? '未设置' : timezoneText(profile.timezone)}',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: const Color(0xFF5B4D47),
                          ),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _controller.isSaving ? null : _save,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            child: Text(_controller.isSaving ? '保存中...' : '保存资料'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final updated = await _controller.save(
      nickname: _nicknameController.text,
      email: _emailController.text,
      timezone: _timezoneController.text,
    );

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(updated ? '资料已更新' : (_controller.errorMessage ?? '资料更新失败')),
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
