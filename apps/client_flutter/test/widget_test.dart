import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:client_flutter/src/app.dart';
import 'package:client_flutter/src/core/config/app_config.dart';
import 'package:client_flutter/src/core/utils/app_timezone.dart';
import 'package:client_flutter/src/core/utils/date_time_formatter.dart';
import 'package:client_flutter/src/features/app/application/app_controller.dart';
import 'package:client_flutter/src/features/app/presentation/app_shell.dart';

void main() {
  test('app config defaults are stable', () {
    const config = AppConfig(
      appName: 'CloudTodo Web',
      appEnv: 'local',
      apiBaseUrl: '/api',
    );

    expect(config.appName, 'CloudTodo Web');
    expect(config.appEnv, 'local');
    expect(config.apiBaseUrl, '/api');
  });

  test('app config aligns loopback API host with the Web page host', () {
    const localhostConfig = AppConfig(
      appName: 'CloudTodo Web',
      appEnv: 'local',
      apiBaseUrl: 'http://localhost:3000/api',
    );
    const addressConfig = AppConfig(
      appName: 'CloudTodo Web',
      appEnv: 'local',
      apiBaseUrl: 'http://127.0.0.1:3000/api',
    );

    expect(
      localhostConfig
          .alignLoopbackHost(Uri.parse('http://127.0.0.1:4201'))
          .apiBaseUrl,
      'http://127.0.0.1:3000/api',
    );
    expect(
      addressConfig
          .alignLoopbackHost(Uri.parse('http://localhost:4201'))
          .apiBaseUrl,
      'http://localhost:3000/api',
    );
  });

  test('app config preserves non-loopback API hosts', () {
    const config = AppConfig(
      appName: 'CloudTodo Web',
      appEnv: 'production',
      apiBaseUrl: 'https://api.example.com/api',
    );

    expect(
      config.alignLoopbackHost(Uri.parse('http://127.0.0.1:4201')).apiBaseUrl,
      'https://api.example.com/api',
    );
  });

  test('global timezone formats and converts reminder times', () {
    setAppTimezone('Asia/Tokyo');
    expect(
      formatDateTime(DateTime.utc(2026, 1, 1)),
      '2026-01-01 09:00',
    );

    final wallClock = appTimezoneWallClock(
      year: 2026,
      month: 1,
      day: 1,
      hour: 9,
      minute: 0,
    );
    expect(wallClock.toUtc(), DateTime.utc(2026, 1, 1));
    setAppTimezone(defaultAppTimezone);
  });

  test('theme mode restores and persists across app launches', () async {
    SharedPreferences.setMockInitialValues({'theme_mode': 'dark'});
    final controller = AppController(
      initialConfig: const AppConfig(
        appName: 'CloudTodo',
        appEnv: 'test',
        apiBaseUrl: 'http://localhost:3000/api',
      ),
    );
    addTearDown(controller.dispose);

    await controller.restoreThemeMode();
    expect(controller.themeMode, ThemeMode.dark);

    controller.setThemeMode(ThemeMode.light);
    await Future<void>.delayed(Duration.zero);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getString('theme_mode'), 'light');
  });

  testWidgets('auth frame stacks content on a phone viewport', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: AuthPageFrame(
          title: 'Mobile title',
          subtitle: 'Mobile subtitle',
          child: SizedBox(key: Key('mobile-form'), height: 200),
          footer: Text('Footer'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final titleBottom = tester.getBottomLeft(find.text('Mobile title')).dy;
    final formTop = tester.getTopLeft(find.byKey(const Key('mobile-form'))).dy;
    expect(formTop, greaterThan(titleBottom));
    expect(tester.takeException(), isNull);
  });

  testWidgets('app provides monochrome light and dark themes', (tester) async {
    final controller = AppController(
      initialConfig: const AppConfig(
        appName: 'CloudTodo',
        appEnv: 'test',
        apiBaseUrl: 'http://localhost:3000/api',
      ),
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(App(controller: controller));

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.themeMode, ThemeMode.system);
    expect(app.theme?.colorScheme.surface, Colors.white);
    expect(app.theme?.colorScheme.primary, const Color(0xFF111111));
    expect(app.darkTheme?.colorScheme.surface, Colors.black);
    expect(app.darkTheme?.colorScheme.primary, const Color(0xFFF5F5F5));

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
