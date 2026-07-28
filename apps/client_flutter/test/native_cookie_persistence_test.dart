import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:client_flutter/src/core/http/native_session_store.dart';
import 'package:client_flutter/src/core/http/platform_http_client_io.dart';

void main() {
  test('native cookies survive a client restart through secure storage', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <HttpRequest>[];
    final serving = server.listen((request) async {
      requests.add(request);
      if (request.uri.path == '/auth/login') {
        request.response.headers.add(
          HttpHeaders.setCookieHeader,
          'cloudtodo_user_refresh_token=refresh-secret; Max-Age=3600; HttpOnly; Path=/',
        );
        request.response.headers.add(
          HttpHeaders.setCookieHeader,
          'cloudtodo_user_csrf_token=csrf-secret; Max-Age=3600; Path=/',
        );
      }
      request.response
        ..statusCode = HttpStatus.ok
        ..write('{}');
      await request.response.close();
    });
    addTearDown(() async {
      await server.close(force: true);
      await serving.cancel();
    });

    final store = _MemorySessionStore();
    final baseUrl = 'http://${server.address.address}:${server.port}';
    final firstClient = IoPlatformHttpClient(baseUrl, sessionStore: store);
    await firstClient.request(method: 'POST', path: '/auth/login');
    firstClient.dispose();

    expect(store.value, isNotNull);

    final restartedClient = IoPlatformHttpClient(baseUrl, sessionStore: store);
    addTearDown(restartedClient.dispose);
    expect(restartedClient.hasSessionHint, isTrue);
    await restartedClient.request(method: 'POST', path: '/auth/refresh');

    final restoredCookie = requests.last.headers.value(HttpHeaders.cookieHeader);
    expect(restoredCookie, contains('cloudtodo_user_refresh_token=refresh-secret'));
    expect(restoredCookie, contains('cloudtodo_user_csrf_token=csrf-secret'));
  });

  test('clearSession reports secure-storage deletion failures', () async {
    final store = _FailingDeleteSessionStore();
    final client = IoPlatformHttpClient(
      'http://127.0.0.1:3000',
      sessionStore: store,
    );
    addTearDown(client.dispose);

    await expectLater(
      client.clearSession(),
      throwsA(isA<StateError>().having(
        (error) => error.message,
        'message',
        contains('secure storage delete failed'),
      )),
    );
  });

  test('storage keys preserve case-sensitive URL paths', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    String? cookieSeenOnLowercasePath;
    final serving = server.listen((request) async {
      if (request.uri.path == '/API/auth/login') {
        request.response.headers.add(
          HttpHeaders.setCookieHeader,
          'cloudtodo_user_refresh_token=upper-path-secret; Max-Age=3600; HttpOnly; Path=/',
        );
        request.response.headers.add(
          HttpHeaders.setCookieHeader,
          'cloudtodo_user_csrf_token=upper-path-csrf; Max-Age=3600; Path=/',
        );
      }
      if (request.uri.path == '/api/auth/refresh') {
        cookieSeenOnLowercasePath =
            request.headers.value(HttpHeaders.cookieHeader);
      }
      request.response
        ..statusCode = HttpStatus.ok
        ..write('{}');
      await request.response.close();
    });
    addTearDown(() async {
      await server.close(force: true);
      await serving.cancel();
    });

    final store = _MemorySessionStore();
    final origin = 'http://${server.address.address}:${server.port}';
    final upperClient = IoPlatformHttpClient('$origin/API', sessionStore: store);
    await upperClient.request(method: 'POST', path: '/auth/login');
    upperClient.dispose();

    final lowerClient = IoPlatformHttpClient('$origin/api', sessionStore: store);
    addTearDown(lowerClient.dispose);
    await lowerClient.request(method: 'POST', path: '/auth/refresh');

    expect(cookieSeenOnLowercasePath, isNull);
  });
}

class _MemorySessionStore implements NativeSessionStore {
  String? value;
  String? storedKey;

  @override
  Future<void> delete(String key) async {
    if (storedKey == key) {
      storedKey = null;
      value = null;
    }
  }

  @override
  Future<String?> read(String key) async => storedKey == key ? value : null;

  @override
  Future<void> write(String key, String value) async {
    storedKey = key;
    this.value = value;
  }
}

class _FailingDeleteSessionStore implements NativeSessionStore {
  @override
  Future<void> delete(String key) async {
    throw StateError('secure storage delete failed');
  }

  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}
}
