import 'package:flutter/foundation.dart';

class AppConfig {
  const AppConfig({
    required this.appName,
    required this.appEnv,
    required this.apiBaseUrl,
  });

  final String appName;
  final String appEnv;
  final String apiBaseUrl;

  factory AppConfig.defaults() {
    return AppConfig(
      appName: 'CloudTodo',
      appEnv: 'local',
      apiBaseUrl: _defaultApiBaseUrl(),
    );
  }

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      appName: json['appName'] as String? ?? 'CloudTodo',
      appEnv: json['appEnv'] as String? ?? 'local',
      apiBaseUrl: json['apiBaseUrl'] as String? ?? _defaultApiBaseUrl(),
    );
  }

  AppConfig copyWith({
    String? appName,
    String? appEnv,
    String? apiBaseUrl,
  }) {
    return AppConfig(
      appName: appName ?? this.appName,
      appEnv: appEnv ?? this.appEnv,
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
    );
  }

  static String _defaultApiBaseUrl() {
    if (kIsWeb) {
      return '/api';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:3000/api';
      case TargetPlatform.windows:
        return 'http://127.0.0.1:3000/api';
      default:
        return 'http://127.0.0.1:3000/api';
    }
  }
}
