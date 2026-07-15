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
    final width = MediaQuery.sizeOf(context).width;
    final isCompact = width < 900;
    final isMobile = width < 600;
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

    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          toolbarHeight: isMobile ? 56 : 72,
          titleSpacing: isMobile ? 16 : 24,
          title: isMobile
              ? Text(
                  services.config.appName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      services.config.appName,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    Text(
                      '任务、提醒和设置',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
          actions: const [
            _ThemeModeButton(),
            SizedBox(width: 8),
          ],
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
        color: Theme.of(context).colorScheme.surfaceContainerLow,
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
