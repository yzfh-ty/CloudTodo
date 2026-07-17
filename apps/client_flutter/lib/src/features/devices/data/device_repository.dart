import 'package:flutter/foundation.dart';

import '../../../core/http/http_client.dart';
import '../domain/device_item.dart';

class DeviceRepository {
  DeviceRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<void> registerCurrentDevice() {
    return _apiClient.post(
      '/devices/register',
      body: {
        'platform': _platformType(),
        'device_name': _deviceName(),
        'device_identifier': _deviceIdentifier(),
        'app_version': '0.1.0',
      },
      parser: (_) => null,
    );
  }

  Future<List<DeviceItem>> getDevices() {
    return _apiClient.get(
      '/devices',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(DeviceItem.fromJson)
            .toList(growable: false);
      },
    );
  }

  Future<DeviceItem> deleteDevice(String id) {
    return _apiClient.delete(
      '/devices/$id',
      parser: (data) => DeviceItem.fromJson(data as Map<String, dynamic>),
    );
  }

  String _platformType() {
    if (kIsWeb) {
      return 'web';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.windows => 'windows',
      TargetPlatform.linux => 'linux',
      _ => 'web',
    };
  }

  String _deviceName() {
    if (kIsWeb) {
      return 'Flutter Web';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'Android Client',
      TargetPlatform.windows => 'Windows Client',
      TargetPlatform.linux => 'Linux Client',
      _ => 'Flutter Client',
    };
  }

  String _deviceIdentifier() {
    if (kIsWeb) {
      return 'web-client';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android-client',
      TargetPlatform.windows => 'windows-client',
      TargetPlatform.linux => 'linux-client',
      _ => 'flutter-client',
    };
  }
}
