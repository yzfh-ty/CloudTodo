import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import 'http_client.dart';
import 'native_session_store.dart';

PlatformHttpClient createPlatformHttpClient(
  String baseUrl, {
  HttpClientPolicy policy = const HttpClientPolicy(),
}) {
  return IoPlatformHttpClient(baseUrl, policy: policy);
}

class IoPlatformHttpClient
    implements PlatformHttpClient, ManagedPlatformHttpClient {
  IoPlatformHttpClient(
    this.baseUrl, {
    this.policy = const HttpClientPolicy(),
    NativeSessionStore? sessionStore,
  }) : _sessionStore = sessionStore ?? SecureNativeSessionStore() {
    policy.validate();
    _client = _newClient();
    _sessionStorageKey = _storageKey(baseUrl);
    _restoreFuture = _restoreCookies();
  }

  final String baseUrl;
  final HttpClientPolicy policy;
  final NativeSessionStore _sessionStore;
  late HttpClient _client;
  late final String _sessionStorageKey;
  late final Future<void> _restoreFuture;
  Future<void> _storageWrites = Future<void>.value();
  final Map<String, _StoredCookie> _cookies = <String, _StoredCookie>{};
  final Set<_IoRequestState> _pendingRequests = <_IoRequestState>{};
  bool _disposed = false;
  bool _cookiesLoaded = false;

  static const _sessionCookieNames = <String>{
    'cloudtodo_user_session',
    'cloudtodo_user_refresh_token',
    'cloudtodo_user_csrf_token',
    'cloudtodo_admin_session',
    'cloudtodo_admin_csrf_token',
  };

  @override
  bool get hasSessionHint {
    if (!_cookiesLoaded) return true;
    _purgeExpiredCookies();
    return _cookies.containsKey('cloudtodo_user_csrf_token') ||
        _cookies.containsKey('cloudtodo_admin_csrf_token');
  }

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) {
    if (_disposed) {
      return Future<RawHttpResponse>.error(
        StateError('HTTP client is disposed.'),
      );
    }

    final state = _IoRequestState();
    _pendingRequests.add(state);
    return _requestInternal(
      state: state,
      method: method,
      path: path,
      headers: headers,
      queryParameters: queryParameters,
      body: body,
    ).timeout(
      policy.requestTimeout,
      onTimeout: () {
        state.abort();
        throw TimeoutException('request timed out');
      },
    ).whenComplete(() {
      _pendingRequests.remove(state);
    });
  }

  Future<RawHttpResponse> _requestInternal({
    required _IoRequestState state,
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    if (_disposed) {
      throw StateError('HTTP client is disposed.');
    }
    await _restoreFuture;
    await _storageWrites;
    if (_disposed) {
      throw StateError('HTTP client is disposed.');
    }

    final uri = _buildUri(path, queryParameters);
    final requestClient = _client;
    HttpClientRequest? request;

    try {
      request = await requestClient
          .openUrl(method.toUpperCase(), uri)
          .timeout(policy.connectTimeout);
      state.request = request;
      if (state.cancelled) {
        request.abort();
        throw TimeoutException('request cancelled');
      }

      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      _purgeExpiredCookies();
      if (_cookies.isNotEmpty) {
        request.headers.set(
          HttpHeaders.cookieHeader,
          _cookies.entries
              .map((entry) => '${entry.key}=${entry.value.value}')
              .join('; '),
        );
      }

      final csrfToken = _csrfTokenForRequest(method);
      if (csrfToken != null) {
        request.headers.set('X-CSRF-Token', csrfToken);
      }

      for (final entry in (headers ?? const <String, String>{}).entries) {
        // Callers must not be able to replace the cookie jar or spoof the
        // framing headers used by the transport.
        if (_isTransportManagedHeader(entry.key)) {
          continue;
        }
        request.headers.set(entry.key, entry.value);
      }

      if (body != null) {
        final encodedBody = utf8.encode(jsonEncode(body));
        request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
        request.contentLength = encodedBody.length;
        request.add(encodedBody);
        await request.flush().timeout(policy.sendTimeout);
      }

      final response = await request.close().timeout(policy.receiveTimeout);
      final responseBody = await _readResponseBody(response);
      var cookiesChanged = false;
      for (final cookie in response.cookies) {
        cookiesChanged = _storeCookie(cookie, uri) || cookiesChanged;
      }
      if (cookiesChanged) {
        await _persistCookies();
      }

      final responseHeaders = <String, String>{};
      response.headers.forEach((name, values) {
        responseHeaders[name] = values.join(', ');
      });

      return RawHttpResponse(
        statusCode: response.statusCode,
        body: responseBody,
        headers: responseHeaders,
      );
    } on TimeoutException {
      request?.abort();
      rethrow;
    } finally {
      // A timed-out openUrl may not have yielded a request object. Closing the
      // connection pool in that case prevents a stuck socket from surviving
      // into a later session.
      if (request == null && !_disposed) {
        _replaceClient(force: true);
      }
    }
  }

  @override
  void cancelPendingRequests() {
    if (_disposed) {
      return;
    }
    for (final state in _pendingRequests.toList()) {
      state.abort();
    }
    _replaceClient(force: true);
  }

  @override
  Future<void> clearSession() async {
    await _restoreFuture;
    _cookies.clear();
    await _persistCookies(reportFailure: true);
  }

  @override
  void dispose() {
    if (_disposed) {
      return;
    }
    _disposed = true;
    _cookies.clear();
    _client.close(force: true);
  }

  Future<String> _readResponseBody(HttpClientResponse response) async {
    if (response.contentLength > policy.maxResponseBytes) {
      throw ResponseTooLargeException(policy.maxResponseBytes);
    }

    final bytes = BytesBuilder(copy: false);
    var total = 0;
    await for (final chunk in response.timeout(policy.receiveTimeout)) {
      total += chunk.length;
      if (total > policy.maxResponseBytes) {
        throw ResponseTooLargeException(policy.maxResponseBytes);
      }
      bytes.add(chunk);
    }

    return utf8.decode(bytes.takeBytes());
  }

  HttpClient _newClient() {
    final client = HttpClient()..connectionTimeout = policy.connectTimeout;
    client.autoUncompress = true;
    return client;
  }

  void _replaceClient({required bool force}) {
    final oldClient = _client;
    _client = _newClient();
    oldClient.close(force: force);
  }

  Uri _buildUri(String path, Map<String, String?>? queryParameters) {
    if (baseUrl.trim().isEmpty) {
      throw const FormatException(
          'Native platform requires an absolute apiBaseUrl.');
    }

    final normalizedBase = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final baseUri = Uri.tryParse(normalizedBase);
    if (baseUri == null ||
        !baseUri.hasScheme ||
        baseUri.host.isEmpty ||
        (baseUri.scheme != 'http' && baseUri.scheme != 'https') ||
        baseUri.userInfo.isNotEmpty ||
        baseUri.fragment.isNotEmpty ||
        baseUri.query.isNotEmpty) {
      throw const FormatException('apiBaseUrl must be a valid HTTP(S) URL.');
    }
    if (!kDebugMode && baseUri.scheme != 'https') {
      throw const FormatException(
          'Release builds require an HTTPS apiBaseUrl.');
    }

    final mergedPath = '${baseUri.path}$normalizedPath';
    final cleanedQuery = <String, String>{
      for (final entry
          in (queryParameters ?? const <String, String?>{}).entries)
        if (entry.value != null && entry.value!.trim().isNotEmpty)
          entry.key: entry.value!,
    };

    return baseUri.replace(
      path: mergedPath,
      queryParameters: cleanedQuery.isEmpty ? null : cleanedQuery,
    );
  }

  bool _storeCookie(Cookie cookie, Uri requestUri) {
    if (!_sessionCookieNames.contains(cookie.name)) {
      return false;
    }

    if (cookie.secure && requestUri.scheme != 'https') {
      return false;
    }

    final expiredByAge = cookie.maxAge != null && cookie.maxAge! <= 0;
    final expiredByDate =
        cookie.expires != null && !cookie.expires!.isAfter(DateTime.now());
    if (expiredByAge || expiredByDate || cookie.value.isEmpty) {
      return _cookies.remove(cookie.name) != null;
    }

    DateTime? expiresAt = cookie.expires;
    if (cookie.maxAge != null) {
      expiresAt = DateTime.now().add(Duration(seconds: cookie.maxAge!));
    }
    _cookies[cookie.name] = _StoredCookie(
      value: cookie.value,
      expiresAt: expiresAt,
    );
    return true;
  }

  void _purgeExpiredCookies() {
    final now = DateTime.now();
    _cookies.removeWhere(
      (_, cookie) =>
          cookie.expiresAt != null && !cookie.expiresAt!.isAfter(now),
    );
  }

  Future<void> _restoreCookies() async {
    try {
      final encoded = await _sessionStore.read(_sessionStorageKey);
      if (encoded == null || encoded.isEmpty || _disposed) return;
      final payload = jsonDecode(encoded);
      if (payload is! Map<String, dynamic> || payload['version'] != 1) {
        await _sessionStore.delete(_sessionStorageKey);
        return;
      }
      final storedCookies = payload['cookies'];
      if (storedCookies is! Map<String, dynamic>) return;
      final now = DateTime.now();
      for (final entry in storedCookies.entries) {
        final cookie = entry.value;
        if (!_sessionCookieNames.contains(entry.key) ||
            cookie is! Map<String, dynamic> ||
            cookie['value'] is! String ||
            cookie['expires_at'] is! int) {
          continue;
        }
        final expiresAt =
            DateTime.fromMillisecondsSinceEpoch(cookie['expires_at'] as int);
        if (expiresAt.isAfter(now)) {
          _cookies[entry.key] = _StoredCookie(
            value: cookie['value'] as String,
            expiresAt: expiresAt,
          );
        }
      }
    } catch (_) {
      try {
        await _sessionStore.delete(_sessionStorageKey);
      } catch (_) {}
    } finally {
      _cookiesLoaded = true;
    }
  }

  Future<void> _persistCookies({bool reportFailure = false}) {
    final persistentCookies = <String, Object>{
      for (final entry in _cookies.entries)
        if (entry.value.expiresAt != null)
          entry.key: <String, Object>{
            'value': entry.value.value,
            'expires_at': entry.value.expiresAt!.millisecondsSinceEpoch,
          },
    };
    final encoded = jsonEncode(<String, Object>{
      'version': 1,
      'cookies': persistentCookies,
    });
    final operation = _storageWrites.then((_) async {
      if (persistentCookies.isEmpty) {
        await _sessionStore.delete(_sessionStorageKey);
      } else {
        await _sessionStore.write(_sessionStorageKey, encoded);
      }
    });
    // Ordinary response persistence is best effort. Keep the queue usable
    // after an OS-storage failure, while clearSession returns the unsuppressed
    // operation so logout cannot appear successful when deletion failed.
    _storageWrites = operation.catchError((Object _) {});
    return reportFailure ? operation : _storageWrites;
  }

  static String _storageKey(String baseUrl) {
    final uri = Uri.parse(baseUrl.trim());
    final path = uri.path.replaceFirst(RegExp(r'/+$'), '');
    final normalized = uri
        .replace(
          scheme: uri.scheme.toLowerCase(),
          host: uri.host.toLowerCase(),
          path: path,
        )
        .toString();
    return 'cloudtodo_native_session_${base64Url.encode(utf8.encode(normalized))}';
  }

  String? _csrfTokenForRequest(String method) {
    if (_isSafeMethod(method)) {
      return null;
    }

    return _cookies['cloudtodo_user_csrf_token']?.value ??
        _cookies['cloudtodo_admin_csrf_token']?.value;
  }

  bool _isSafeMethod(String method) {
    return const {'GET', 'HEAD', 'OPTIONS'}.contains(method.toUpperCase());
  }

  bool _isTransportManagedHeader(String name) {
    final normalized = name.toLowerCase();
    return normalized == 'cookie' ||
        normalized == 'content-length' ||
        normalized == 'host';
  }
}

class _StoredCookie {
  const _StoredCookie({required this.value, required this.expiresAt});

  final String value;
  final DateTime? expiresAt;
}

class _IoRequestState {
  HttpClientRequest? request;
  bool cancelled = false;

  void abort() {
    cancelled = true;
    request?.abort();
  }
}
