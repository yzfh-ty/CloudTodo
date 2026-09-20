import 'package:flutter/foundation.dart';

import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/device_item.dart';

Map<String, dynamic> currentDevicePayload() {
  return {
    'identifier': _deviceIdentifier(),
    'platform': _platformType(),
    'name': _deviceName(),
    'app_version': '0.1.0',
    'push_token': null,
  };
}

class DeviceRepository {
  DeviceRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<void> registerCurrentDevice() {
    return _apiClient.put(
      '/devices/current',
      body: currentDevicePayload(),
      parser: (_) => null,
    );
  }

  Future<List<DeviceItem>> getDevices() async {
    final result = <DeviceItem>[];
    String? cursor;
    while (true) {
      final page = await _apiClient.get(
        '/devices',
        queryParameters: {'cursor': cursor, 'limit': '100'},
        parser: (data) => PagedResponse.fromJson(
          data as Map<String, dynamic>,
          DeviceItem.fromJson,
        ),
      );
      result.addAll(page.items);
      final nextCursor = page.nextCursor;
      if (!page.hasMore || nextCursor == null || nextCursor == cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return result;
  }

  Future<void> deleteDevice(String id) {
    return _apiClient.delete(
      '/devices/$id',
      parser: (_) => null,
    );
  }
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
