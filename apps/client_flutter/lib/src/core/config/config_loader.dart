import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../http/http_client.dart';
import 'app_config.dart';

Future<AppConfig> loadAppConfig() async {
  if (!kIsWeb) {
    final config = AppConfig.defaults();
    config.validateApiBaseUrl();
    return config;
  }

  final client = createHttpClient('');
  AppConfig? loadedConfig;

  try {
    final response = await client.request(
      method: 'GET',
      path: '/config.json',
    );

    if (response.statusCode >= 200 &&
        response.statusCode < 300 &&
        response.body.isNotEmpty) {
      final payload = jsonDecode(response.body);
      if (payload is Map<String, dynamic>) {
        loadedConfig = AppConfig.fromJson(payload).alignLoopbackHost(Uri.base);
      }
    }
  } catch (_) {
    if (kReleaseMode) {
      rethrow;
    }
  } finally {
    if (client is ManagedPlatformHttpClient) {
      (client as ManagedPlatformHttpClient).dispose();
    }
  }

  final config =
      loadedConfig ?? AppConfig.defaults().alignLoopbackHost(Uri.base);
  config.validateApiBaseUrl(pageUri: Uri.base);
  return config;
}
