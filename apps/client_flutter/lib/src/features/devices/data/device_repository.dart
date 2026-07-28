import 'package:flutter/foundation.dart';

import '../../../core/http/http_client.dart';
import '../domain/device_item.dart';
import 'installation_id_store.dart';

class DeviceRepository {
  DeviceRepository(
    this._apiClient, {
    InstallationIdStore? installationIdStore,
  }) : _installationIdStore =
            installationIdStore ?? SharedPreferencesInstallationIdStore();

  final ApiClient _apiClient;
  final InstallationIdStore _installationIdStore;

  Future<void> registerCurrentDevice() async {
    final installationId = await _installationIdStore.getOrCreate();
    return _apiClient.post(
      '/devices/register',
      body: {
        'platform': _platformType(),
        'device_name': _deviceName(),
        'device_identifier': installationId,
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

}
