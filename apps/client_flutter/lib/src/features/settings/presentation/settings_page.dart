import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/config/app_config.dart';
import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/utils/timezone_options.dart';
import '../../../core/widgets/empty_state_card.dart';
import '../../app/application/app_scope.dart';
import '../../devices/domain/device_item.dart';
import '../../notification_endpoints/application/notification_endpoints_controller.dart';
import '../../notification_endpoints/domain/notification_endpoint.dart';
import '../../notification_endpoints/domain/notification_endpoint_form_data.dart';
import '../../notification_endpoints/presentation/notification_endpoint_editor_dialog.dart';
import '../../profile/application/profile_controller.dart';
import '../../profile/domain/profile_user.dart';
import '../../sync/data/sync_repository.dart';

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
  final _backendUrlController = TextEditingController();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  late final ProfileController _profileController;
  late final NotificationEndpointsController _endpointsController;
  bool _initialized = false;
  bool _backendUrlInitialized = false;
  bool _isChangingPassword = false;
  bool _isLoadingDevices = false;
  bool _isDeletingDevice = false;
  bool _isSyncing = false;
  String? _passwordError;
  String? _deviceError;
  String? _syncError;
  String? _syncCursor;
  String? _syncSummary;
  List<DeviceItem> _devices = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }

    final services = AppScope.of(context).services;
    if (!_backendUrlInitialized) {
      _backendUrlController.text =
          AppScope.of(context).controller.currentApiBaseUrl;
      _backendUrlInitialized = true;
    }
    _profileController = ProfileController(
      repository: services.profileRepository,
      sessionController: services.sessionController,
    )..load();
    _endpointsController = NotificationEndpointsController(
      repository: services.notificationEndpointsRepository,
    )..load();
    _loadDevices();
    _initialized = true;
  }

  @override
  void dispose() {
    _nicknameController.dispose();
    _emailController.dispose();
    _timezoneController.dispose();
    _backendUrlController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
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
        final isMobile = MediaQuery.sizeOf(context).width < 600;
        final cardPadding = EdgeInsets.all(isMobile ? 16 : 24);
        final sectionTitleStyle = isMobile
            ? theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
            : theme.textTheme.titleLarge;
        final appScope = AppScope.of(context);
        final currentUser = appScope.services.sessionController.currentUser;
        final profile = _profileController.profile;
        if (profile != null) {
          _bindProfile(profile);
        }

        return ListView(
          children: [
            Text(
              '设置',
              style: isMobile
                  ? theme.textTheme.titleLarge
                  : theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              '这里统一放账户资料、时区、通知方式和退出，不再把这些内容拆成多个一级菜单。',
              style: isMobile
                  ? theme.textTheme.bodyMedium
                  : theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('外观', style: sectionTitleStyle),
                    const SizedBox(height: 16),
                    SegmentedButton<ThemeMode>(
                      segments: isMobile
                          ? const [
                              ButtonSegment(
                                value: ThemeMode.system,
                                label: Text('系统'),
                              ),
                              ButtonSegment(
                                value: ThemeMode.light,
                                label: Text('亮色'),
                              ),
                              ButtonSegment(
                                value: ThemeMode.dark,
                                label: Text('暗色'),
                              ),
                            ]
                          : const [
                              ButtonSegment(
                                value: ThemeMode.system,
                                icon: Icon(Icons.brightness_auto_outlined),
                                label: Text('跟随系统'),
                              ),
                              ButtonSegment(
                                value: ThemeMode.light,
                                icon: Icon(Icons.light_mode_outlined),
                                label: Text('亮色'),
                              ),
                              ButtonSegment(
                                value: ThemeMode.dark,
                                icon: Icon(Icons.dark_mode_outlined),
                                label: Text('暗色'),
                              ),
                            ],
                      selected: {appScope.controller.themeMode},
                      showSelectedIcon: false,
                      expandedInsets: EdgeInsets.zero,
                      onSelectionChanged: (selection) {
                        appScope.controller.setThemeMode(selection.first);
                      },
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '账户',
                      style: sectionTitleStyle,
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _MetaChip(
                            label: '昵称', value: currentUser?.nickname ?? '-'),
                        _MetaChip(
                            label: '邮箱', value: currentUser?.email ?? '-'),
                        if (currentUser?.forcePasswordChange == true)
                          const _MetaChip(label: '安全状态', value: '需要修改密码'),
                        _MetaChip(
                          label: '时区',
                          value: currentUser == null
                              ? '-'
                              : timezoneText(currentUser.timezone),
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
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '同步',
                      style: sectionTitleStyle,
                    ),
                    const SizedBox(height: 12),
                    if (_syncError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _syncError!,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        FilledButton.tonal(
                          onPressed: _isSyncing ? null : _syncBootstrap,
                          child: Text(_isSyncing ? '同步中...' : '首次同步'),
                        ),
                        OutlinedButton(
                          onPressed: _isSyncing || _syncCursor == null
                              ? null
                              : _syncChanges,
                          child: const Text('拉取增量'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text('游标：${_syncCursor ?? '-'}'),
                    if (_syncSummary != null) ...[
                      const SizedBox(height: 8),
                      Text(_syncSummary!),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '设备',
                            style: sectionTitleStyle,
                          ),
                        ),
                        OutlinedButton.icon(
                          onPressed: _isLoadingDevices ? null : _loadDevices,
                          icon: const Icon(Icons.refresh_rounded),
                          label: const Text('刷新'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (_deviceError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _deviceError!,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ),
                    if (_isLoadingDevices)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 20),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (_devices.isEmpty)
                      const EmptyStateCard(
                        icon: Icons.devices_other_rounded,
                        title: '暂无设备',
                        description: '登录成功后客户端会自动注册当前设备。',
                      )
                    else
                      ..._devices.map(
                        (device) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _DeviceCard(
                            item: device,
                            busy: _isDeletingDevice,
                            onDelete: () => _deleteDevice(device),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '密码',
                      style: sectionTitleStyle,
                    ),
                    const SizedBox(height: 12),
                    if (_passwordError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _passwordError!,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ),
                    TextFormField(
                      controller: _currentPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '当前密码'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _newPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '新密码'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _confirmPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '确认新密码'),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _isChangingPassword ? null : _changePassword,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Text(_isChangingPassword ? '修改中...' : '修改密码'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '高级设置',
                      style: sectionTitleStyle,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '这里可以切换当前客户端连接的后端地址。切换后会重新进入登录页。',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _backendUrlController,
                      decoration: const InputDecoration(
                        labelText: '后端地址',
                        helperText: '输入 http://localhost:3000 或完整的 /api 地址',
                      ),
                      validator: (value) =>
                          appScope.controller.validateApiBaseUrl(value ?? ''),
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        FilledButton.tonal(
                          onPressed: () => _applyBackendUrl(appScope),
                          child: const Text('应用后端地址'),
                        ),
                        OutlinedButton(
                          onPressed: () {
                            _backendUrlController.text =
                                AppConfig.defaults().apiBaseUrl;
                          },
                          child: const Text('恢复默认地址'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: cardPadding,
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '个人资料',
                        style: sectionTitleStyle,
                      ),
                      const SizedBox(height: 12),
                      if (_profileController.errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            _profileController.errorMessage!,
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                        ),
                      Wrap(
                        spacing: 16,
                        runSpacing: 12,
                        children: [
                          _MetaChip(label: '用户 ID', value: profile?.id ?? '-'),
                          _MetaChip(
                            label: '角色',
                            value: profile == null
                                ? '-'
                                : (profile.role == 'admin' ? '管理员' : '普通用户'),
                          ),
                          _MetaChip(
                            label: '状态',
                            value: profile == null
                                ? '-'
                                : (profile.status == 'active'
                                    ? '正常'
                                    : profile.status),
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
                          if (value == null ||
                              value.trim().isEmpty ||
                              !value.contains('@')) {
                            return '请输入合法邮箱';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _timezoneController.text.isEmpty
                            ? null
                            : _timezoneController.text,
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
                        '创建时间：${formatDateTime(profile?.createdAt)}\n更新时间：${formatDateTime(profile?.updatedAt)}',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed:
                            _profileController.isSaving ? null : _saveProfile,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          child: Text(
                              _profileController.isSaving ? '保存中...' : '保存资料'),
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
                padding: cardPadding,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '通知方式',
                            style: sectionTitleStyle,
                          ),
                        ),
                        FilledButton.icon(
                          onPressed: _endpointsController.isLoading
                              ? null
                              : _createEndpoint,
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
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ),
                    if (_endpointsController.isLoading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (_endpointsController.items.isEmpty)
                      EmptyStateCard(
                        icon: Icons.notifications_off_rounded,
                        title: '当前还没有通知方式',
                        description: '如果你希望把提醒推送到企业微信机器人或自己的服务，可以先新增一种通知方式。',
                        action: FilledButton.tonal(
                          onPressed: _endpointsController.isLoading
                              ? null
                              : _createEndpoint,
                          child: const Text('新增通知方式'),
                        ),
                      )
                    else
                      ..._endpointsController.items.map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _EndpointCard(
                            item: item,
                            busy:
                                _endpointsController.submittingId == item.id ||
                                    _endpointsController.testingId == item.id,
                            onCopyUrl: () => _copyEndpointUrl(item),
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
        content: Text(
            updated ? '资料已更新' : (_profileController.errorMessage ?? '资料更新失败')),
      ),
    );
  }

  Future<void> _changePassword() async {
    final currentPassword = _currentPasswordController.text;
    final newPassword = _newPasswordController.text;
    final confirmPassword = _confirmPasswordController.text;
    if (currentPassword.isEmpty ||
        newPassword.length < 8 ||
        newPassword != confirmPassword) {
      setState(() {
        _passwordError = '请检查当前密码、新密码长度和确认密码是否一致';
      });
      return;
    }

    setState(() {
      _isChangingPassword = true;
      _passwordError = null;
    });

    try {
      await AppScope.of(context).services.authRepository.changePassword(
            currentPassword: currentPassword,
            newPassword: newPassword,
            confirmPassword: confirmPassword,
          );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('密码已修改，请重新登录')),
      );
      await widget.onLogout();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _passwordError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isChangingPassword = false;
        });
      }
    }
  }

  Future<void> _loadDevices() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _isLoadingDevices = true;
      _deviceError = null;
    });

    try {
      final devices =
          await AppScope.of(context).services.deviceRepository.getDevices();
      if (!mounted) {
        return;
      }
      setState(() {
        _devices = devices;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _deviceError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingDevices = false;
        });
      }
    }
  }

  Future<void> _deleteDevice(DeviceItem device) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除设备'),
              content: Text('确认删除设备“${device.deviceName}”？'),
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

    setState(() {
      _isDeletingDevice = true;
      _deviceError = null;
    });

    try {
      await AppScope.of(context)
          .services
          .deviceRepository
          .deleteDevice(device.id);
      await _loadDevices();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _deviceError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isDeletingDevice = false;
        });
      }
    }
  }

  Future<void> _syncBootstrap() {
    return _runSync(
        () => AppScope.of(context).services.syncRepository.bootstrap());
  }

  Future<void> _syncChanges() {
    final cursor = _syncCursor;
    if (cursor == null) {
      return Future.value();
    }

    return _runSync(() =>
        AppScope.of(context).services.syncRepository.changes(cursor: cursor));
  }

  Future<void> _runSync(Future<SyncSnapshot> Function() action) async {
    setState(() {
      _isSyncing = true;
      _syncError = null;
    });

    try {
      final snapshot = await action();
      if (!mounted) {
        return;
      }
      setState(() {
        _syncCursor = snapshot.cursor;
        _syncSummary = _buildSyncSummary(snapshot.raw);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _syncError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSyncing = false;
        });
      }
    }
  }

  String _buildSyncSummary(Map<String, dynamic> raw) {
    final names = {
      'todo_lists': '清单',
      'tags': '标签',
      'todo_tags': '任务标签关系',
      'todos': '任务',
      'reminders': '提醒',
      'reminder_events': '提醒事件',
      'notification_endpoints': '通知方式',
      'notification_deliveries': '通知投递',
      'devices': '设备',
    };

    return names.entries.map((entry) {
      final value = raw[entry.key];
      final count = value is List ? value.length : 0;
      return '${entry.value}: $count';
    }).join('  ');
  }

  Future<void> _applyBackendUrl(AppScope appScope) async {
    final validation =
        appScope.controller.validateApiBaseUrl(_backendUrlController.text);
    if (validation != null) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validation)),
      );
      return;
    }

    final nextUrl =
        appScope.controller.normalizeApiBaseUrl(_backendUrlController.text);
    if (nextUrl == appScope.controller.currentApiBaseUrl) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('当前已经在使用这个后端地址')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('切换后端地址'),
              content: Text(
                '将后端地址切换为：\n${_backendUrlController.text.trim()}\n\n切换后会退出当前登录，并重新回到登录页。是否继续？',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('继续'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!mounted || !confirmed) {
      return;
    }

    await appScope.controller.updateApiBaseUrl(nextUrl);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('后端地址已更新，请重新登录')),
    );
  }

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
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: SelectableText(
                      responseBody,
                      style: const TextStyle(
                        fontFamily: 'Consolas',
                        fontSize: 12,
                        height: 1.5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    '本次请求体',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: SelectableText(
                      renderedBody,
                      style: const TextStyle(
                        fontFamily: 'Consolas',
                        fontSize: 12,
                        height: 1.5,
                      ),
                    ),
                  ),
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
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
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
          onPressed: busy ? null : onDelete,
          child: const Text('删除'),
        ),
      ],
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(18),
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
                  label: '最近成功', value: formatDateTime(item.lastSuccessAt)),
              _MetaChip(
                  label: '最近失败', value: formatDateTime(item.lastFailureAt)),
            ],
          ),
          if (item.lastResponseSummary?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
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
                '平台：${item.platform}\n版本：${item.appVersion ?? '-'}\n最近活跃：${formatDateTime(item.lastActiveAt)}',
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
          onPressed: busy ? null : onDelete,
          child: const Text('删除'),
        ),
      ],
    );

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(18),
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
