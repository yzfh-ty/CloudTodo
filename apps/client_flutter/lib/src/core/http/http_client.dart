import 'dart:async';
import 'dart:convert';

import '../errors/app_exception.dart';
import '../models/api_response.dart';
import 'platform_http_client_stub.dart'
    if (dart.library.io) 'platform_http_client_io.dart'
    if (dart.library.html) 'platform_http_client_web.dart';

/// Bounds applied by every platform transport.
///
/// A single policy keeps native and browser clients from silently diverging
/// on connection lifetime or the amount of data they will buffer.
class HttpClientPolicy {
  const HttpClientPolicy({
    this.connectTimeout = const Duration(seconds: 10),
    this.sendTimeout = const Duration(seconds: 10),
    this.receiveTimeout = const Duration(seconds: 20),
    this.requestTimeout = const Duration(seconds: 30),
    this.maxResponseBytes = 2 * 1024 * 1024,
  });

  final Duration connectTimeout;
  final Duration sendTimeout;
  final Duration receiveTimeout;
  final Duration requestTimeout;
  final int maxResponseBytes;

  void validate() {
    if (connectTimeout <= Duration.zero ||
        sendTimeout <= Duration.zero ||
        receiveTimeout <= Duration.zero ||
        requestTimeout <= Duration.zero ||
        maxResponseBytes <= 0) {
      throw ArgumentError('HTTP client limits must be positive.');
    }
  }
}

class ResponseTooLargeException implements Exception {
  const ResponseTooLargeException(this.maxBytes);

  final int maxBytes;

  @override
  String toString() => 'HTTP response exceeds the configured size limit';
}

/// Raised when a response belongs to a session that has already been
/// invalidated (logout, account switch, or a completed refresh from another
/// session). Callers should silently discard this request.
class SessionChangedException extends AppException {
  const SessionChangedException()
      : super(
          message: 'session changed',
          code: 'SESSION_CHANGED',
        );
}

class RawHttpResponse {
  const RawHttpResponse({
    required this.statusCode,
    required this.body,
    required this.headers,
  });

  final int statusCode;
  final String body;
  final Map<String, String> headers;
}

abstract class PlatformHttpClient {
  bool get hasSessionHint;

  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  });
}

/// Optional lifecycle controls implemented by transports that can cancel and
/// dispose their underlying sockets/XHRs. Keeping this separate preserves the
/// small PlatformHttpClient contract for test doubles and future adapters.
abstract class ManagedPlatformHttpClient {
  void cancelPendingRequests() {}

  /// Removes locally held session material. Browser transports cannot remove
  /// HttpOnly cookies and intentionally only clear script-visible state.
  void clearSession() {}

  void dispose() {}
}

PlatformHttpClient createHttpClient(
  String baseUrl, {
  HttpClientPolicy policy = const HttpClientPolicy(),
}) {
  return createPlatformHttpClient(baseUrl, policy: policy);
}

class ApiClient {
  ApiClient(this._httpClient);

  final PlatformHttpClient _httpClient;
  Future<bool> Function()? _refreshSession;
  void Function()? _clearSession;
  int Function()? _sessionGeneration;
  String? Function()? _sessionUserId;
  _RefreshOperation? _refreshOperation;
  bool _disposed = false;

  bool get hasSessionHint => _httpClient.hasSessionHint;

  void registerSessionHooks({
    required Future<bool> Function() refreshSession,
    required void Function() clearSession,
    int Function()? sessionGeneration,
    String? Function()? sessionUserId,
  }) {
    _refreshSession = refreshSession;
    _clearSession = clearSession;
    _sessionGeneration = sessionGeneration;
    _sessionUserId = sessionUserId;
  }

  /// Invalidates transport work before a session transition. Keeping this
  /// operation on the API client makes logout, account switching, and a
  /// failed refresh use exactly the same cancellation path.
  void invalidateSession({bool clearCookies = true}) {
    final managed = _managedClient;
    managed?.cancelPendingRequests();
    if (clearCookies) {
      managed?.clearSession();
    }
  }

  void dispose() {
    if (_disposed) {
      return;
    }
    _disposed = true;
    _refreshOperation = null;
    _managedClient?.dispose();
  }

  Future<T> get<T>(
    String path, {
    Map<String, String?>? queryParameters,
    required T Function(Object? data) parser,
    bool allowRefresh = true,
  }) {
    return _request(
      method: 'GET',
      path: path,
      queryParameters: queryParameters,
      parser: parser,
      allowRefresh: allowRefresh,
    );
  }

  Future<T> post<T>(
    String path, {
    Object? body,
    required T Function(Object? data) parser,
    bool allowRefresh = true,
  }) {
    return _request(
      method: 'POST',
      path: path,
      body: body,
      parser: parser,
      allowRefresh: allowRefresh,
    );
  }

  Future<T> patch<T>(
    String path, {
    Object? body,
    required T Function(Object? data) parser,
    bool allowRefresh = true,
  }) {
    return _request(
      method: 'PATCH',
      path: path,
      body: body,
      parser: parser,
      allowRefresh: allowRefresh,
    );
  }

  Future<T> delete<T>(
    String path, {
    required T Function(Object? data) parser,
    bool allowRefresh = true,
  }) {
    return _request(
      method: 'DELETE',
      path: path,
      parser: parser,
      allowRefresh: allowRefresh,
    );
  }

  Future<T> _request<T>({
    required String method,
    required String path,
    Map<String, String?>? queryParameters,
    Object? body,
    required T Function(Object? data) parser,
    required bool allowRefresh,
  }) {
    final generation = _readGeneration();
    final userId = _readUserId();
    return _requestForGeneration(
      method: method,
      path: path,
      queryParameters: queryParameters,
      body: body,
      parser: parser,
      allowRefresh: allowRefresh,
      generation: generation,
      userId: userId,
    );
  }

  Future<T> _requestForGeneration<T>({
    required String method,
    required String path,
    Map<String, String?>? queryParameters,
    Object? body,
    required T Function(Object? data) parser,
    required bool allowRefresh,
    required int generation,
    required String? userId,
  }) async {
    if (_disposed) {
      throw const AppException(
        message: 'request failed',
        code: 'CLIENT_DISPOSED',
      );
    }

    try {
      _ensureGeneration(generation, userId);
      final response = await _httpClient.request(
        method: method,
        path: path,
        queryParameters: queryParameters,
        body: body,
      );
      _ensureGeneration(generation, userId);

      if (response.statusCode == 401 &&
          allowRefresh &&
          _shouldAttemptRefresh(path)) {
        final refreshed = await _refresh(generation, userId);
        if (refreshed) {
          _ensureGeneration(generation, userId);
          return _requestForGeneration(
            method: method,
            path: path,
            queryParameters: queryParameters,
            body: body,
            parser: parser,
            allowRefresh: false,
            generation: generation,
            userId: userId,
          );
        }

        // A refresh operation may have invalidated the session itself. Do
        // not let a stale request clear a newer account's state.
        if (_isGenerationCurrent(generation, userId)) {
          _clearSession?.call();
        }
        _ensureGeneration(generation, userId);
      }

      final payload = response.body.isEmpty ? null : jsonDecode(response.body);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw AppException.fromPayload(
          statusCode: response.statusCode,
          payload: payload,
        );
      }

      if (payload is Map<String, dynamic>) {
        final apiResponse = ApiResponse.fromJson(payload);
        if (apiResponse.code != 'OK') {
          throw AppException(
            message: apiResponse.message,
            code: apiResponse.code,
            statusCode: response.statusCode,
          );
        }
        _ensureGeneration(generation, userId);
        return parser(apiResponse.data);
      }

      _ensureGeneration(generation, userId);
      return parser(payload);
    } catch (error) {
      if (error is SessionChangedException || error is AppException) {
        rethrow;
      }

      if (!_isGenerationCurrent(generation, userId)) {
        throw const SessionChangedException();
      }

      if (error is ResponseTooLargeException) {
        throw const AppException(
          message: 'response is too large',
          code: 'RESPONSE_TOO_LARGE',
        );
      }

      if (error is TimeoutException) {
        throw const AppException(
          message: 'request timed out',
          code: 'REQUEST_TIMEOUT',
        );
      }

      throw AppException(message: 'network request failed', details: error);
    }
  }

  bool _shouldAttemptRefresh(String path) {
    return _refreshSession != null &&
        path != '/auth/login' &&
        path != '/auth/register' &&
        path != '/auth/refresh';
  }

  Future<bool> _refresh(int generation, String? userId) async {
    final refreshSession = _refreshSession;
    if (refreshSession == null || !_isGenerationCurrent(generation, userId)) {
      return false;
    }

    final current = _refreshOperation;
    if (current != null) {
      if (current.generation != generation) {
        return false;
      }
      return current.future;
    }

    final future = _runRefresh(refreshSession, generation, userId);
    final operation = _RefreshOperation(generation: generation, future: future);
    _refreshOperation = operation;

    try {
      return await future;
    } finally {
      if (identical(_refreshOperation, operation)) {
        _refreshOperation = null;
      }
    }
  }

  Future<bool> _runRefresh(
    Future<bool> Function() refreshSession,
    int generation,
    String? userId,
  ) async {
    if (!_isGenerationCurrent(generation, userId)) {
      return false;
    }

    try {
      final refreshed = await refreshSession();
      return refreshed && _isGenerationCurrent(generation, userId);
    } catch (_) {
      return false;
    }
  }

  int _readGeneration() => _sessionGeneration?.call() ?? 0;

  String? _readUserId() => _sessionUserId?.call();

  ManagedPlatformHttpClient? get _managedClient =>
      _httpClient is ManagedPlatformHttpClient
          ? _httpClient as ManagedPlatformHttpClient
          : null;

  bool _isGenerationCurrent(int generation, String? userId) =>
      !_disposed &&
      _readGeneration() == generation &&
      (_sessionUserId == null || _readUserId() == userId);

  void _ensureGeneration(int generation, String? userId) {
    if (!_isGenerationCurrent(generation, userId)) {
      throw const SessionChangedException();
    }
  }
}

class _RefreshOperation {
  const _RefreshOperation({required this.generation, required this.future});

  final int generation;
  final Future<bool> future;
}
