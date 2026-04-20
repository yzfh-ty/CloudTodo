import 'package:flutter_test/flutter_test.dart';

import 'package:client_flutter/src/core/config/app_config.dart';

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
}
