import 'dart:convert';

import '../http/http_client.dart';
import 'app_config.dart';

Future<AppConfig> loadAppConfig() async {
  final client = createHttpClient('');

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
        return AppConfig.fromJson(payload);
      }
    }
  } catch (_) {
    return AppConfig.defaults();
  }

  return AppConfig.defaults();
}
