import 'package:flutter/material.dart';

import '../../reminders/presentation/reminders_page.dart';
import '../../settings/presentation/settings_page.dart';
import '../../todos/presentation/todo_page.dart';
import '../../../routing/app_route_path.dart';
import '../application/app_scope.dart';

class AppShell extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final services = AppScope.of(context).services;
    final isCompact = MediaQuery.sizeOf(context).width < 900;
    final body = _buildSection(section);

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

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Color(0xFFF5EFE2),
            Color(0xFFE9E0CC),
            Color(0xFFD7E7E3),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          titleSpacing: 24,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                services.config.appName,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text(
                '管理后台继续走 /admin，普通用户客户端当前聚焦任务、提醒和设置三个主业务入口。',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF5A4E48),
                    ),
              ),
            ],
          ),
        ),
        body: Row(
          children: [
            if (!isCompact)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 0, 16),
                child: _SideRail(
                  section: section,
                  onNavigate: onNavigate,
                ),
              ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: body,
              ),
            ),
          ],
        ),
        bottomNavigationBar: isCompact
            ? NavigationBar(
                selectedIndex: section.index,
                destinations: navigationItems,
                onDestinationSelected: (index) {
                  onNavigate(AppSection.values[index]);
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
        return SettingsPage(onLogout: onLogout);
    }
  }
}

class _SideRail extends StatelessWidget {
  const _SideRail({
    required this.section,
    required this.onNavigate,
  });

  final AppSection section;
  final ValueChanged<AppSection> onNavigate;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: ColoredBox(
        color: Colors.white.withValues(alpha: 0.74),
        child: NavigationRail(
          backgroundColor: Colors.transparent,
          selectedIndex: section.index,
          groupAlignment: -0.7,
          labelType: NavigationRailLabelType.all,
          onDestinationSelected: (index) {
            onNavigate(AppSection.values[index]);
          },
          destinations: const [
            NavigationRailDestination(
              icon: Icon(Icons.format_list_bulleted_rounded),
              label: Text('任务'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.alarm_rounded),
              label: Text('提醒'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.settings_outlined),
              label: Text('设置'),
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
      backgroundColor: Color(0xFFF5EFE2),
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
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [
              Color(0xFFEEE3C8),
              Color(0xFFF9F5EC),
              Color(0xFFDCEBE6),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 960),
              child: Row(
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            style: Theme.of(context).textTheme.headlineLarge,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            subtitle,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          const SizedBox(height: 24),
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: const Text(
                              '这次初始化只做普通用户客户端。`/admin` 管理后台继续留在后端侧，避免权限边界和部署职责混杂。',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
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
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
