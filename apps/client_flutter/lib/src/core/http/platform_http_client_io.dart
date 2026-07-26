import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import 'http_client.dart';

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
  }) {
    policy.validate();
    _client = _newClient();
  }

  final String baseUrl;
  final HttpClientPolicy policy;
  late HttpClient _client;
  final Map<String, _StoredCookie> _cookies = <String, _StoredCookie>{};
  final Set<_IoRequestState> _pendingRequests = <_IoRequestState>{};
  bool _disposed = false;

  static const _sessionCookieNames = <String>{
    'cloudtodo_user_session',
    'cloudtodo_user_refresh_token',
    'cloudtodo_user_csrf_token',
    'cloudtodo_admin_session',
    'cloudtodo_admin_csrf_token',
  };

  @override
  bool get hasSessionHint {
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
      for (final cookie in response.cookies) {
        _storeCookie(cookie, uri);
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
  void clearSession() {
    _cookies.clear();
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

  void _storeCookie(Cookie cookie, Uri requestUri) {
    if (!_sessionCookieNames.contains(cookie.name)) {
      return;
    }

    if (cookie.secure && requestUri.scheme != 'https') {
      return;
    }

    final expiredByAge = cookie.maxAge != null && cookie.maxAge! <= 0;
    final expiredByDate =
        cookie.expires != null && !cookie.expires!.isAfter(DateTime.now());
    if (expiredByAge || expiredByDate || cookie.value.isEmpty) {
      _cookies.remove(cookie.name);
      return;
    }

    DateTime? expiresAt = cookie.expires;
    if (cookie.maxAge != null) {
      expiresAt = DateTime.now().add(Duration(seconds: cookie.maxAge!));
    }
    _cookies[cookie.name] = _StoredCookie(
      value: cookie.value,
      expiresAt: expiresAt,
    );
  }

  void _purgeExpiredCookies() {
    final now = DateTime.now();
    _cookies.removeWhere(
      (_, cookie) =>
          cookie.expiresAt != null && !cookie.expiresAt!.isAfter(now),
    );
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
