import 'package:flutter/material.dart';

import '../../reminders/presentation/reminders_page.dart';
import '../../settings/presentation/settings_page.dart';
import '../../todos/presentation/todo_page.dart';
import '../../../routing/app_route_path.dart';
import '../application/app_scope.dart';

class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.section,
    required this.onNavigate,
    required this.onLogout,
  });

  final AppSection section;
  final ValueChanged<AppSection> onNavigate;
  final Future<void> Function() onLogout;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  SettingsSection _settingsSection = SettingsSection.profile;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context).services;
    final width = MediaQuery.sizeOf(context).width;
    final isCompact = width < 900;
    final isMobile = width < 600;
    final body = _buildSection(widget.section);

    final navigationItems = const [
      NavigationDestination(
        icon: Icon(Icons.format_list_bulleted_rounded),
        label: '任务',
      ),
      NavigationDestination(
        icon: Icon(Icons.alarm_rounded),
        label: '提醒',
      ),
      NavigationDestination(
        icon: Icon(Icons.settings_outlined),
        label: '设置',
      ),
    ];

    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: isCompact
            ? AppBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                toolbarHeight: isMobile ? 56 : 64,
                titleSpacing: isMobile ? 16 : 24,
                title: Text(
                  services.config.appName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                actions: const [
                  _ThemeModeButton(),
                  SizedBox(width: 8),
                ],
              )
            : null,
        body: Row(
          children: [
            if (!isCompact)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 0, 16),
                child: _SideRail(
                  section: widget.section,
                  settingsSection: _settingsSection,
                  onNavigate: widget.onNavigate,
                  onSettingsSectionChanged: (value) {
                    setState(() => _settingsSection = value);
                  },
                ),
              ),
            Expanded(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1200),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      isMobile ? 12 : 24,
                      isMobile ? 8 : 24,
                      isMobile ? 12 : 24,
                      isMobile ? 12 : 24,
                    ),
                    child: body,
                  ),
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: isCompact
            ? NavigationBar(
                selectedIndex: widget.section.index,
                destinations: navigationItems,
                onDestinationSelected: (index) {
                  widget.onNavigate(AppSection.values[index]);
                },
              )
            : null,
      ),
    );
  }

  Widget _buildSection(AppSection value) {
    switch (value) {
      case AppSection.todos:
        return const TodoPage();
      case AppSection.reminders:
        return const RemindersPage();
      case AppSection.settings:
        return SettingsPage(
          onLogout: widget.onLogout,
          initialSection: _settingsSection,
          onSectionChanged: (value) {
            setState(() => _settingsSection = value);
          },
        );
    }
  }
}

class _SideRail extends StatelessWidget {
  const _SideRail({
    required this.section,
    required this.settingsSection,
    required this.onNavigate,
    required this.onSettingsSectionChanged,
  });

  final AppSection section;
  final SettingsSection settingsSection;
  final ValueChanged<AppSection> onNavigate;
  final ValueChanged<SettingsSection> onSettingsSectionChanged;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        child: SizedBox(
          width: 224,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _RailBrand(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                  children: [
                    const _NavigationGroupLabel('工作'),
                    _SidebarDestination(
                      icon: Icons.format_list_bulleted_rounded,
                      label: '任务',
                      selected: section == AppSection.todos,
                      onTap: () => onNavigate(AppSection.todos),
                    ),
                    _SidebarDestination(
                      icon: Icons.alarm_outlined,
                      selectedIcon: Icons.alarm_rounded,
                      label: '提醒',
                      selected: section == AppSection.reminders,
                      onTap: () => onNavigate(AppSection.reminders),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Divider(),
                    ),
                    const _NavigationGroupLabel('设置'),
                    for (final item in _settingsNavigationItems)
                      _SidebarDestination(
                        icon: item.icon,
                        selectedIcon: item.selectedIcon,
                        label: item.label,
                        selected: section == AppSection.settings &&
                            settingsSection == item.section,
                        onTap: () {
                          onSettingsSectionChanged(item.section);
                          onNavigate(AppSection.settings);
                        },
                      ),
                  ],
                ),
              ),
              const Divider(),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: _ThemeModeButton(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsNavigationItem {
  const _SettingsNavigationItem({
    required this.section,
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final SettingsSection section;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

const _settingsNavigationItems = [
  _SettingsNavigationItem(
    section: SettingsSection.profile,
    icon: Icons.manage_accounts_outlined,
    selectedIcon: Icons.manage_accounts_rounded,
    label: '账户资料',
  ),
  _SettingsNavigationItem(
    section: SettingsSection.sync,
    icon: Icons.sync_outlined,
    selectedIcon: Icons.sync_rounded,
    label: '同步设备',
  ),
  _SettingsNavigationItem(
    section: SettingsSection.notifications,
    icon: Icons.notifications_outlined,
    selectedIcon: Icons.notifications_rounded,
    label: '通知方式',
  ),
  _SettingsNavigationItem(
    section: SettingsSection.preferences,
    icon: Icons.tune_outlined,
    selectedIcon: Icons.tune_rounded,
    label: '外观连接',
  ),
];

class _NavigationGroupLabel extends StatelessWidget {
  const _NavigationGroupLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

class _SidebarDestination extends StatelessWidget {
  const _SidebarDestination({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.selectedIcon,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: ListTile(
        minTileHeight: 48,
        leading: Icon(selected ? selectedIcon ?? icon : icon),
        title: Text(label),
        selected: selected,
        selectedColor: scheme.onPrimaryContainer,
        selectedTileColor: scheme.primaryContainer,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        onTap: onTap,
      ),
    );
  }
}

class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class _RailBrand extends StatelessWidget {
  const _RailBrand();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 16, 18),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'CloudTodo',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              '任务与提醒',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AuthPageFrame extends StatelessWidget {
  const AuthPageFrame({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    required this.footer,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final Widget footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        actions: const [
          _ThemeModeButton(),
          SizedBox(width: 8),
        ],
      ),
      body: Container(
        color: Theme.of(context).colorScheme.surface,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isMobile = constraints.maxWidth < 720;
                final form = Card(
                  child: Padding(
                    padding: EdgeInsets.all(isMobile ? 20 : 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        child,
                        const SizedBox(height: 16),
                        footer,
                      ],
                    ),
                  ),
                );

                return ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        title,
                        style: isMobile
                            ? Theme.of(context).textTheme.headlineMedium
                            : Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                      ),
                      const SizedBox(height: 20),
                      form,
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _ThemeModeButton extends StatelessWidget {
  const _ThemeModeButton();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return IconButton(
      onPressed: () {
        AppScope.of(context).controller.toggleTheme(
              Theme.of(context).brightness,
            );
      },
      icon: Icon(isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
      tooltip: isDark ? '切换到亮色' : '切换到暗色',
    );
  }
}
