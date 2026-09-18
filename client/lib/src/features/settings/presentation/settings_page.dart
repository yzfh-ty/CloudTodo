import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/config/app_config.dart';
import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/utils/timezone_options.dart';
import '../../../core/widgets/empty_state_card.dart';
import '../../../core/widgets/page_header.dart';
import '../../app/application/app_scope.dart';
import '../../devices/domain/device_item.dart';
import '../../notification_endpoints/application/notification_endpoints_controller.dart';
import '../../notification_endpoints/domain/notification_endpoint.dart';
import '../../notification_endpoints/domain/notification_endpoint_form_data.dart';
import '../../notification_endpoints/presentation/notification_endpoint_editor_dialog.dart';
import '../../profile/application/profile_controller.dart';
import '../../profile/domain/profile_user.dart';
import '../../sync/data/sync_repository.dart';

part 'settings_page_endpoint_actions.dart';
part 'settings_page_actions.dart';
part 'settings_page_navigation.dart';
part 'settings_page_widgets.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.onLogout,
    this.initialSection = SettingsSection.profile,
    this.onSectionChanged,
  });

  final Future<void> Function() onLogout;
  final SettingsSection initialSection;
  final ValueChanged<SettingsSection>? onSectionChanged;

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
  bool _isUpdatingLocalNotifications = false;
  bool _isUpdatingNotificationPrivacy = false;
  late SettingsSection _selectedSettingsSection = widget.initialSection;
  String? _passwordError;
  String? _deviceError;
  String? _syncError;
  String? _syncCursor;
  String? _syncSummary;
  List<DeviceItem> _devices = const [];
  void _selectSettingsSection(SettingsSection value) {
    if (value != _selectedSettingsSection) {
      setState(() => _selectedSettingsSection = value);
      widget.onSectionChanged?.call(value);
    }
  }

  void _updateState(VoidCallback callback) => setState(callback);

  @override
  void didUpdateWidget(covariant SettingsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialSection != widget.initialSection &&
        widget.initialSection != _selectedSettingsSection) {
      _selectedSettingsSection = widget.initialSection;
    }
  }

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
        final viewportWidth = MediaQuery.sizeOf(context).width;
        final isMobile = viewportWidth < 600;
        final usesCompactNavigation = viewportWidth < 900;
        final cardPadding = EdgeInsets.all(isMobile ? 16 : 24);
        final sectionTitleStyle = isMobile
            ? theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
            : theme.textTheme.titleLarge;
        final appScope = AppScope.of(context);
        final currentUser = appScope.services.sessionController.currentUser;
        final localNotificationService =
            appScope.services.localNotificationService;
        final profile = _profileController.profile;
        if (profile != null) {
          _bindProfile(profile);
        }

        return LayoutBuilder(
          builder: (context, constraints) {
            final contentWidth = isMobile || constraints.maxWidth <= 1280
                ? constraints.maxWidth
                : 1280.0;
            return Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                width: contentWidth,
                height: constraints.maxHeight,
                child: _buildSettingsScaffold(
                  showCategorySelector: usesCompactNavigation,
                  content: ListView(
                    children: [
                      PageHeader(
                        title: settingsSectionLabel(_selectedSettingsSection),
                        description: settingsSectionDescription(
                          _selectedSettingsSection,
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (_selectedSettingsSection ==
                          SettingsSection.preferences)
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
                                            icon: Icon(
                                                Icons.brightness_auto_outlined),
                                            label: Text('跟随系统'),
                                          ),
                                          ButtonSegment(
                                            value: ThemeMode.light,
                                            icon:
                                                Icon(Icons.light_mode_outlined),
                                            label: Text('亮色'),
                                          ),
                                          ButtonSegment(
                                            value: ThemeMode.dark,
                                            icon:
                                                Icon(Icons.dark_mode_outlined),
                                            label: Text('暗色'),
                                          ),
                                        ],
                                  selected: {appScope.controller.themeMode},
                                  showSelectedIcon: false,
                                  expandedInsets: EdgeInsets.zero,
                                  onSelectionChanged: (selection) {
                                    appScope.controller
                                        .setThemeMode(selection.first);
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                      if (_selectedSettingsSection ==
                          SettingsSection.preferences)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection == SettingsSection.profile)
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
                                        label: '昵称',
                                        value: currentUser?.nickname ?? '-'),
                                    _MetaChip(
                                        label: '邮箱',
                                        value: currentUser?.email ?? '-'),
                                    if (currentUser?.forcePasswordChange ==
                                        true)
                                      const _MetaChip(
                                          label: '安全状态', value: '需要修改密码'),
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
                      if (_selectedSettingsSection == SettingsSection.profile)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection == SettingsSection.sync)
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
                                      style: TextStyle(
                                          color: theme.colorScheme.error),
                                    ),
                                  ),
                                Wrap(
                                  spacing: 12,
                                  runSpacing: 12,
                                  children: [
                                    FilledButton.tonal(
                                      onPressed:
                                          _isSyncing ? null : _syncBootstrap,
                                      child:
                                          Text(_isSyncing ? '同步中...' : '首次同步'),
                                    ),
                                    OutlinedButton(
                                      onPressed:
                                          _isSyncing || _syncCursor == null
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
                      if (_selectedSettingsSection == SettingsSection.sync)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection == SettingsSection.sync)
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
                                      onPressed: _isLoadingDevices
                                          ? null
                                          : _loadDevices,
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
                                      style: TextStyle(
                                          color: theme.colorScheme.error),
                                    ),
                                  ),
                                if (_isLoadingDevices)
                                  const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 20),
                                    child: Center(
                                        child: CircularProgressIndicator()),
                                  )
                                else if (_devices.isEmpty)
                                  const _CenteredEmptyState(
                                    child: EmptyStateCard(
                                      icon: Icons.devices_other_rounded,
                                      title: '暂无设备',
                                      description: '登录成功后客户端会自动注册当前设备。',
                                    ),
                                  )
                                else
                                  ..._devices.map(
                                    (device) => Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 10),
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
                      if (_selectedSettingsSection == SettingsSection.sync)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection == SettingsSection.profile)
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
                                      style: TextStyle(
                                          color: theme.colorScheme.error),
                                    ),
                                  ),
                                TextFormField(
                                  controller: _currentPasswordController,
                                  obscureText: true,
                                  decoration:
                                      const InputDecoration(labelText: '当前密码'),
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _newPasswordController,
                                  obscureText: true,
                                  decoration:
                                      const InputDecoration(labelText: '新密码'),
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _confirmPasswordController,
                                  obscureText: true,
                                  decoration:
                                      const InputDecoration(labelText: '确认新密码'),
                                ),
                                const SizedBox(height: 16),
                                FilledButton(
                                  onPressed: _isChangingPassword
                                      ? null
                                      : _changePassword,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 14),
                                    child: Text(_isChangingPassword
                                        ? '修改中...'
                                        : '修改密码'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      if (_selectedSettingsSection == SettingsSection.profile)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection ==
                          SettingsSection.preferences)
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
                                    helperText: '使用 HTTPS 地址或 Web 同源 /api',
                                  ),
                                  validator: (value) => appScope.controller
                                      .validateApiBaseUrl(value ?? ''),
                                ),
                                const SizedBox(height: 16),
                                Wrap(
                                  spacing: 12,
                                  runSpacing: 12,
                                  children: [
                                    FilledButton.tonal(
                                      onPressed: () =>
                                          _applyBackendUrl(appScope),
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
                      if (_selectedSettingsSection ==
                          SettingsSection.preferences)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection == SettingsSection.profile)
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
                                      padding:
                                          const EdgeInsets.only(bottom: 12),
                                      child: Text(
                                        _profileController.errorMessage!,
                                        style: TextStyle(
                                            color: theme.colorScheme.error),
                                      ),
                                    ),
                                  Wrap(
                                    spacing: 16,
                                    runSpacing: 12,
                                    children: [
                                      _MetaChip(
                                        label: '角色',
                                        value: profile == null
                                            ? '-'
                                            : (profile.role == 'admin'
                                                ? '管理员'
                                                : '普通用户'),
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
                                        value: formatDateTime(
                                            profile?.lastLoginAt),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 24),
                                  TextFormField(
                                    controller: _nicknameController,
                                    decoration:
                                        const InputDecoration(labelText: '昵称'),
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _emailController,
                                    decoration:
                                        const InputDecoration(labelText: '邮箱'),
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
                                    initialValue:
                                        _timezoneController.text.isEmpty
                                            ? null
                                            : _timezoneController.text,
                                    decoration:
                                        const InputDecoration(labelText: '时区'),
                                    items: kCommonTimezones
                                        .map(
                                          (timezone) =>
                                              DropdownMenuItem<String>(
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
                                      if (value == null ||
                                          value.trim().isEmpty) {
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
                                    onPressed: _profileController.isSaving
                                        ? null
                                        : _saveProfile,
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14),
                                      child: Text(_profileController.isSaving
                                          ? '保存中...'
                                          : '保存资料'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      if (_selectedSettingsSection == SettingsSection.profile)
                        const SizedBox(height: 16),
                      if (_selectedSettingsSection ==
                          SettingsSection.notifications)
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
                                    if (_endpointsController.items.isNotEmpty)
                                      FilledButton.icon(
                                        onPressed:
                                            _endpointsController.isLoading
                                                ? null
                                                : _createEndpoint,
                                        icon:
                                            const Icon(Icons.add_link_rounded),
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
                                if (localNotificationService
                                    .supportsLocalNotifications) ...[
                                  Container(
                                    width: double.infinity,
                                    decoration: BoxDecoration(
                                      color: theme
                                          .colorScheme.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Column(
                                      children: [
                                        SwitchListTile.adaptive(
                                          value: localNotificationService
                                              .localNotificationsEnabled,
                                          title: const Text('本地通知'),
                                          subtitle: const Text('在当前设备显示提醒通知'),
                                          onChanged: _isUpdatingLocalNotifications
                                              ? null
                                              : _setLocalNotificationsEnabled,
                                        ),
                                        if (localNotificationService
                                            .supportsAutostart) ...[
                                          const Divider(height: 1),
                                          SwitchListTile.adaptive(
                                            value: localNotificationService
                                                .autostartEnabled,
                                            title: const Text('开机后在后台运行'),
                                            subtitle: const Text('用于接收桌面提醒'),
                                            onChanged: (value) async {
                                              await localNotificationService
                                                  .setAutostartEnabled(value);
                                              if (mounted) {
                                                setState(() {});
                                              }
                                            },
                                          ),
                                        ],
                                        const Divider(height: 1),
                                        SwitchListTile.adaptive(
                                          value: localNotificationService
                                              .showTaskTitle,
                                          title: const Text('通知中显示任务标题'),
                                          subtitle: const Text('关闭后使用通用提醒内容'),
                                          onChanged:
                                              _isUpdatingNotificationPrivacy
                                                  ? null
                                                  : _setShowTaskTitle,
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                ],
                                if (_endpointsController.errorMessage != null)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: Text(
                                      _endpointsController.errorMessage!,
                                      style: TextStyle(
                                          color: theme.colorScheme.error),
                                    ),
                                  ),
                                if (_endpointsController.isLoading)
                                  const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 24),
                                    child: Center(
                                        child: CircularProgressIndicator()),
                                  )
                                else if (_endpointsController.items.isEmpty)
                                  _CenteredEmptyState(
                                    child: EmptyStateCard(
                                      framed: false,
                                      icon: Icons.notifications_off_rounded,
                                      title: '当前还没有通知方式',
                                      description:
                                          '如果你希望把提醒推送到企业微信机器人或自己的服务，可以先新增一种通知方式。',
                                      action: FilledButton.tonal(
                                        onPressed:
                                            _endpointsController.isLoading
                                                ? null
                                                : _createEndpoint,
                                        child: const Text('新增通知方式'),
                                      ),
                                    ),
                                  )
                                else
                                  ..._endpointsController.items.map(
                                    (item) => Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 12),
                                      child: _EndpointCard(
                                        item: item,
                                        busy: _endpointsController
                                                    .submittingId ==
                                                item.id ||
                                            _endpointsController.testingId ==
                                                item.id,
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
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
