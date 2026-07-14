import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:client_flutter/src/core/config/app_config.dart';
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
}
