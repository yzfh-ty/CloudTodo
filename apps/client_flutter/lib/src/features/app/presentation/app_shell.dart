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
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  isMobile ? 12 : 16,
                  isMobile ? 8 : 16,
                  isMobile ? 12 : 16,
                  isMobile ? 12 : 16,
                ),
                child: body,
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
    final destinations = [
      const NavigationRailDestination(
        icon: Icon(Icons.format_list_bulleted_rounded),
        label: Text('任务'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.alarm_rounded),
        label: Text('提醒'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.manage_accounts_outlined),
        selectedIcon: Icon(Icons.manage_accounts_rounded),
        label: Text('账户资料'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.sync_outlined),
        selectedIcon: Icon(Icons.sync_rounded),
        label: Text('同步设备'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.notifications_outlined),
        selectedIcon: Icon(Icons.notifications_rounded),
        label: Text('通知方式'),
      ),
      const NavigationRailDestination(
        icon: Icon(Icons.tune_outlined),
        selectedIcon: Icon(Icons.tune_rounded),
        label: Text('外观连接'),
      ),
    ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        child: Column(
          children: [
            Expanded(
              child: NavigationRail(
                backgroundColor: Colors.transparent,
                selectedIndex: section == AppSection.settings
                    ? 2 + settingsSection.index
                    : section.index,
                groupAlignment: -0.7,
                labelType: NavigationRailLabelType.all,
                onDestinationSelected: (index) {
                  if (index >= 2) {
                    onSettingsSectionChanged(
                      SettingsSection.values[index - 2],
                    );
                    onNavigate(AppSection.settings);
                    return;
                  }
                  onNavigate(AppSection.values[index]);
                },
                destinations: destinations,
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: _ThemeModeButton(),
            ),
          ],
        ),
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
                final intro = Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: isMobile
                          ? Theme.of(context).textTheme.titleLarge
                          : Theme.of(context).textTheme.headlineLarge,
                    ),
                    if (!isMobile) ...[
                      const SizedBox(height: 12),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ],
                  ],
                );
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
                  constraints: const BoxConstraints(maxWidth: 960),
                  child: isMobile
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            intro,
                            const SizedBox(height: 20),
                            form,
                          ],
                        )
                      : Row(
                          children: [
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(right: 24),
                                child: intro,
                              ),
                            ),
                            Expanded(child: form),
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
