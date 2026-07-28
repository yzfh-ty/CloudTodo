import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:client_flutter/src/core/http/http_client.dart';
import 'package:client_flutter/src/features/devices/data/device_repository.dart';
import 'package:client_flutter/src/features/devices/data/installation_id_store.dart';

void main() {
  test('installation id is stable per install and unique across installs', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final first = await SharedPreferencesInstallationIdStore().getOrCreate();
    final afterRestart = await SharedPreferencesInstallationIdStore().getOrCreate();

    expect(afterRestart, first);
    expect(first, matches(RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    )));

    SharedPreferences.setMockInitialValues(<String, Object>{});
    final anotherInstall = await SharedPreferencesInstallationIdStore().getOrCreate();
    expect(anotherInstall, isNot(first));
  });

  test('device registration sends the persisted installation id', () async {
    const installationId = '123e4567-e89b-42d3-a456-426614174000';
    final transport = _CaptureTransport();
    final api = ApiClient(transport);
    addTearDown(api.dispose);
    final repository = DeviceRepository(
      api,
      installationIdStore: _FixedInstallationIdStore(installationId),
    );

    await repository.registerCurrentDevice();

    expect(transport.body?['device_identifier'], installationId);
    expect(transport.body?['device_identifier'], isNot(contains('client')));
  });
}

class _FixedInstallationIdStore implements InstallationIdStore {
  const _FixedInstallationIdStore(this.value);
  final String value;

  @override
  Future<String> getOrCreate() async => value;
}

class _CaptureTransport implements PlatformHttpClient {
  Map<String, dynamic>? body;

  @override
  bool get hasSessionHint => false;

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    this.body = Map<String, dynamic>.from(body! as Map);
    return RawHttpResponse(
      statusCode: 200,
      body: jsonEncode({'code': 'OK', 'message': 'success', 'data': null}),
      headers: const {},
    );
  }
}
