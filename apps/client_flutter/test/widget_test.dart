import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:client_flutter/src/app.dart';
import 'package:client_flutter/src/core/config/app_config.dart';
import 'package:client_flutter/src/core/utils/app_timezone.dart';
import 'package:client_flutter/src/core/utils/date_time_formatter.dart';
import 'package:client_flutter/src/core/utils/display_texts.dart';
import 'package:client_flutter/src/features/app/application/app_controller.dart';
import 'package:client_flutter/src/features/app/presentation/app_shell.dart';
import 'package:client_flutter/src/core/widgets/form_dialog_frame.dart';
import 'package:client_flutter/src/features/reminders/domain/reminder_item.dart';
import 'package:client_flutter/src/features/reminders/presentation/reminder_detail_dialog.dart';

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

  test('device platforms use user-facing labels', () {
    expect(devicePlatformText('linux'), 'Linux');
    expect(devicePlatformText('web'), '网页');
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
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(1.6)),
          child: AuthPageFrame(
            title: 'Mobile title',
            subtitle: 'Mobile subtitle',
            child: SizedBox(key: Key('mobile-form'), height: 200),
            footer: Text('Footer'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final titleBottom = tester.getBottomLeft(find.text('Mobile title')).dy;
    final formTop = tester.getTopLeft(find.byKey(const Key('mobile-form'))).dy;
    expect(formTop, greaterThan(titleBottom));
    expect(tester.takeException(), isNull);
  });

  testWidgets('app provides branded light and dark themes', (tester) async {
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
    expect(app.theme?.colorScheme.surface, const Color(0xFFF7F8FA));
    expect(app.theme?.colorScheme.primary, const Color(0xFF0F766E));
    expect(app.darkTheme?.colorScheme.surface, const Color(0xFF101315));
    expect(app.darkTheme?.colorScheme.primary, const Color(0xFF5EEAD4));
    expect(app.locale, const Locale('zh', 'CN'));
    expect(app.supportedLocales, contains(const Locale('zh', 'CN')));

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('long form dialogs keep actions visible on short windows',
      (tester) async {
    tester.view.physicalSize = const Size(390, 520);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: FormDialogFrame(
          formKey: GlobalKey<FormState>(),
          title: '编辑任务',
          description: '填写任务内容。',
          body: const SizedBox(height: 720),
          actions: [
            TextButton(onPressed: () {}, child: const Text('取消')),
            FilledButton(onPressed: () {}, child: const Text('保存')),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    final saveRect = tester.getRect(find.text('保存'));
    expect(saveRect.bottom, lessThanOrEqualTo(520));
    expect(find.text('取消'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reminder details hide internal ids and localize timezone',
      (tester) async {
    const internalTodoId = '3a4aa788-e58b-44ed-8a04-a6e508b64d26';
    final item = ReminderItem(
      id: 'reminder-id',
      todoId: internalTodoId,
      channel: 'webhook',
      repeatType: 'none',
      repeatRule: null,
      remindAt: DateTime.utc(2026, 7, 18, 8, 30),
      timezone: 'Asia/Shanghai',
      status: 'pending',
      todoTitle: '季度复盘',
      todoDescription: null,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReminderDetailDialog(
            item: item,
            todoTitle: item.todoTitle,
          ),
        ),
      ),
    );

    expect(find.textContaining(internalTodoId), findsNothing);
    expect(find.text('时区：亚洲/上海'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
