import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:shared_preferences/shared_preferences.dart';
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

  var config = loadedConfig ?? AppConfig.defaults().alignLoopbackHost(Uri.base);
  const overrideApiBaseUrl = String.fromEnvironment('CLOUDTODO_API_BASE_URL');
  if (overrideApiBaseUrl.trim().isNotEmpty) {
    config = config.copyWith(apiBaseUrl: overrideApiBaseUrl.trim()).alignLoopbackHost(Uri.base);
  } else {
    try {
      final preferences = await SharedPreferences.getInstance();
      final savedApiBaseUrl = preferences.getString('cloudtodo_api_base_url');
      if (savedApiBaseUrl != null && savedApiBaseUrl.trim().isNotEmpty) {
        config = config.copyWith(apiBaseUrl: savedApiBaseUrl.trim()).alignLoopbackHost(Uri.base);
      }
    } catch (_) {
      // Fall back to config.json when local storage is unavailable.
    }
  }
  config.validateApiBaseUrl(pageUri: Uri.base);
  return config;
}
