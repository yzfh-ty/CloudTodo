import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:client_flutter/src/core/config/app_config.dart';
import 'package:client_flutter/src/core/errors/app_exception.dart';
import 'package:client_flutter/src/core/http/http_client.dart';
import 'package:client_flutter/src/core/notifications/local_notification_service.dart';
import 'package:client_flutter/src/features/app/application/app_session_controller.dart';
import 'package:client_flutter/src/features/auth/data/auth_repository.dart';
import 'package:client_flutter/src/features/auth/domain/session_user.dart';

void main() {
  test('does not replay a stale request after an account switch', () async {
    final transport = _FakePlatformHttpClient();
    final firstResponse = Completer<RawHttpResponse>();
    final refreshStarted = Completer<void>();
    final refreshResult = Completer<bool>();
    var generation = 7;
    String? userId = 'old-user';

    transport.enqueue(() => firstResponse.future);
    final api = ApiClient(transport);
    api.registerSessionHooks(
      refreshSession: () {
        if (!refreshStarted.isCompleted) {
          refreshStarted.complete();
        }
        return refreshResult.future;
      },
      clearSession: () {},
      sessionGeneration: () => generation,
      sessionUserId: () => userId,
    );
    addTearDown(api.dispose);

    final request = api.get<void>(
      '/todos',
      parser: (_) {},
    );
    firstResponse.complete(
      const RawHttpResponse(
        statusCode: 401,
        body: '{"code":"UNAUTHORIZED","message":"expired"}',
        headers: <String, String>{},
      ),
    );
    await refreshStarted.future;

    generation += 1;
    userId = 'new-user';
    api.invalidateSession();
    refreshResult.complete(true);

    await expectLater(request, throwsA(isA<SessionChangedException>()));
    expect(transport.requestCount, 1);
    expect(transport.cancelCount, 1);
  });

  test('discards a successful response that completes after a switch',
      () async {
    final transport = _FakePlatformHttpClient();
    final pendingResponse = Completer<RawHttpResponse>();
    final requestStarted = Completer<void>();
    var generation = 3;

    transport.enqueue(() {
      requestStarted.complete();
      return pendingResponse.future;
    });
    final api = ApiClient(transport);
    api.registerSessionHooks(
      refreshSession: () async => false,
      clearSession: () {},
      sessionGeneration: () => generation,
    );
    addTearDown(api.dispose);

    final request = api.get<void>('/profile', parser: (_) {});
    await requestStarted.future;
    generation += 1;
    api.invalidateSession();
    pendingResponse.complete(
      const RawHttpResponse(
        statusCode: 200,
        body: '{"code":"OK","message":"success","data":null}',
        headers: <String, String>{},
      ),
    );

    await expectLater(request, throwsA(isA<SessionChangedException>()));
  });

  test('replays once when refresh completes in the same session', () async {
    final transport = _FakePlatformHttpClient();
    var generation = 1;
    transport
      ..enqueue(
        () async => const RawHttpResponse(
          statusCode: 401,
          body: '{"code":"UNAUTHORIZED","message":"expired"}',
          headers: <String, String>{},
        ),
      )
      ..enqueue(
        () async => const RawHttpResponse(
          statusCode: 200,
          body: '{"code":"OK","message":"success","data":null}',
          headers: <String, String>{},
        ),
      );
    final api = ApiClient(transport);
    api.registerSessionHooks(
      refreshSession: () async => true,
      clearSession: () {},
      sessionGeneration: () => generation,
    );
    addTearDown(api.dispose);

    await api.get<void>('/todos', parser: (_) {});
    expect(transport.requestCount, 2);
    expect(generation, 1);
  });

  test('session controller ignores an older concurrent login', () async {
    final transport = _FakePlatformHttpClient();
    final api = ApiClient(transport);
    final auth = _FakeAuthRepository(api);
    final firstLogin = Completer<SessionUser>();
    final secondLogin = Completer<SessionUser>();
    auth.loginResults.add(firstLogin.future);
    auth.loginResults.add(secondLogin.future);
    final controller = AppSessionController(
      authRepository: auth,
      onSessionInvalidated: ({clearCookies = true}) {},
    );
    addTearDown(controller.dispose);
    addTearDown(api.dispose);

    final first = controller.login(account: 'old', password: 'password');
    await Future<void>.delayed(Duration.zero);
    expect(auth.loginCallCount, 1);
    final second = controller.login(account: 'new', password: 'password');
    firstLogin.complete(_testUser('old-user'));
    secondLogin.complete(_testUser('new-user'));

    expect(await first, isFalse);
    expect(await second, isTrue);
    expect(controller.currentUser?.id, 'new-user');
    expect(controller.status, AppSessionStatus.authenticated);
  });

  test('rejects a refresh that changes the authenticated account', () async {
    final transport = _FakePlatformHttpClient();
    final api = ApiClient(transport);
    final auth = _FakeAuthRepository(api);
    auth.refreshResults.add(Future.value(_testUser('new-user')));
    var invalidations = 0;
    final controller = AppSessionController(
      authRepository: auth,
      onSessionInvalidated: ({clearCookies = true}) {
        invalidations += 1;
      },
    );
    controller.absorbUser(_testUser('old-user'));
    addTearDown(controller.dispose);
    addTearDown(api.dispose);

    expect(await controller.refreshSessionSilently(), isFalse);
    expect(controller.currentUser, isNull);
    expect(controller.status, AppSessionStatus.unauthenticated);
    expect(invalidations, 1);
  });

  test('waits for account cleanup before starting a new login', () async {
    final transport = _FakePlatformHttpClient();
    final api = ApiClient(transport);
    final auth = _FakeAuthRepository(api);
    auth.loginResults.add(Future.value(_testUser('new-user')));
    final cleanup = Completer<void>();
    final controller = AppSessionController(
      authRepository: auth,
      onSessionInvalidated: ({clearCookies = true}) => cleanup.future,
    );
    addTearDown(controller.dispose);
    addTearDown(api.dispose);

    final login = controller.login(account: 'new', password: 'password');
    await Future<void>.delayed(Duration.zero);
    expect(auth.loginCallCount, 0);

    cleanup.complete();
    expect(await login, isTrue);
    expect(auth.loginCallCount, 1);
  });

  test('production and release configurations reject HTTP endpoints', () {
    const production = AppConfig(
      appName: 'CloudTodo',
      appEnv: 'production',
      apiBaseUrl: 'http://api.example.test/api',
    );
    expect(
      production.apiBaseUrlValidationError(web: false),
      contains('HTTPS'),
    );

    const debugEnvironment = AppConfig(
      appName: 'CloudTodo',
      appEnv: 'local',
      apiBaseUrl: 'http://127.0.0.1:3000/api',
    );
    expect(
      debugEnvironment.apiBaseUrlValidationError(
        web: false,
        release: true,
      ),
      contains('HTTPS'),
    );

    const sameOrigin = AppConfig(
      appName: 'CloudTodo',
      appEnv: 'production',
      apiBaseUrl: '/api',
    );
    expect(
      sameOrigin.apiBaseUrlValidationError(
        web: true,
        release: true,
        pageUri: Uri.parse('https://app.example.test/'),
      ),
      isNull,
    );
    expect(
      sameOrigin.apiBaseUrlValidationError(
        web: true,
        release: true,
        pageUri: Uri.parse('http://app.example.test/'),
      ),
      contains('HTTPS'),
    );

    const crossOrigin = AppConfig(
      appName: 'CloudTodo',
      appEnv: 'production',
      apiBaseUrl: 'https://api.example.test/api',
    );
    expect(
      crossOrigin.apiBaseUrlValidationError(
        web: true,
        release: true,
        pageUri: Uri.parse('https://app.example.test/'),
      ),
      contains('同源'),
    );
  });

  test('network limits and UI errors do not expose internals', () {
    const policy = HttpClientPolicy(
      connectTimeout: Duration(seconds: 2),
      sendTimeout: Duration(seconds: 3),
      receiveTimeout: Duration(seconds: 4),
      requestTimeout: Duration(seconds: 5),
      maxResponseBytes: 1024,
    );
    expect(() => policy.validate(), returnsNormally);
    expect(
      () => const HttpClientPolicy(maxResponseBytes: 0).validate(),
      throwsArgumentError,
    );
    expect(AppException.describe(StateError('secret response body')),
        'request failed');
  });

  test('notification task titles are private by default and persisted',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final service = LocalNotificationService();
    addTearDown(service.dispose);

    expect(service.showTaskTitle, isFalse);
    expect(service.notificationBodyForTask('sensitive task'), '你有一条待办提醒');

    await service.setShowTaskTitle(true);
    expect(service.showTaskTitle, isTrue);
    expect(service.notificationBodyForTask('sensitive task'), 'sensitive task');

    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getBool('local_notifications_show_task_title'),
      isTrue,
    );
  });
}

class _FakePlatformHttpClient
    implements PlatformHttpClient, ManagedPlatformHttpClient {
  final List<FutureOr<RawHttpResponse> Function()> _responses =
      <FutureOr<RawHttpResponse> Function()>[];
  int requestCount = 0;
  int cancelCount = 0;

  @override
  bool hasSessionHint = true;

  void enqueue(FutureOr<RawHttpResponse> Function() response) {
    _responses.add(response);
  }

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    requestCount += 1;
    if (_responses.isEmpty) {
      throw StateError('unexpected request: $method $path');
    }
    return _responses.removeAt(0)();
  }

  @override
  void cancelPendingRequests() {
    cancelCount += 1;
  }

  @override
  void clearSession() {}

  @override
  void dispose() {}
}

class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(super.apiClient);

  final List<Future<SessionUser>> loginResults = <Future<SessionUser>>[];
  final List<Future<SessionUser>> refreshResults = <Future<SessionUser>>[];
  int loginCallCount = 0;

  @override
  bool get hasSessionHint => true;

  @override
  Future<SessionUser> login({
    required String account,
    required String password,
  }) {
    loginCallCount += 1;
    return loginResults.removeAt(0);
  }

  @override
  Future<SessionUser> refresh() {
    return refreshResults.removeAt(0);
  }
}

SessionUser _testUser(String id) {
  return SessionUser(
    id: id,
    email: '$id@example.test',
    username: id,
    nickname: id,
    role: 'user',
    status: 'active',
    timezone: 'Asia/Shanghai',
    forcePasswordChange: false,
  );
}
