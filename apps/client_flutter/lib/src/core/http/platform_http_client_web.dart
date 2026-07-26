// ignore_for_file: deprecated_member_use

import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;

import 'package:flutter/foundation.dart';

import 'http_client.dart';

PlatformHttpClient createPlatformHttpClient(
  String baseUrl, {
  HttpClientPolicy policy = const HttpClientPolicy(),
}) {
  return WebPlatformHttpClient(baseUrl, policy: policy);
}

class WebPlatformHttpClient
    implements PlatformHttpClient, ManagedPlatformHttpClient {
  WebPlatformHttpClient(
    this.baseUrl, {
    this.policy = const HttpClientPolicy(),
  }) {
    policy.validate();
  }

  final String baseUrl;
  final HttpClientPolicy policy;
  final Set<html.HttpRequest> _pendingRequests = <html.HttpRequest>{};

  // A browser cannot inspect an HttpOnly refresh cookie. Start with a
  // conservative hint so a fresh app can ask the server whether a session
  // exists, and only clear the local hint on an explicit local logout.
  bool _sessionHint = true;
  bool _disposed = false;

  @override
  bool get hasSessionHint =>
      _sessionHint ||
      _readCookie('cloudtodo_user_csrf_token') != null ||
      _readCookie('cloudtodo_admin_csrf_token') != null;

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

    final url = _buildUrl(path, queryParameters);
    final xhr = html.HttpRequest();
    final completer = Completer<RawHttpResponse>();
    _pendingRequests.add(xhr);

    var completed = false;
    final subscriptions = <StreamSubscription<dynamic>>[];

    void finish([RawHttpResponse? response, Object? error, StackTrace? trace]) {
      if (completed) {
        return;
      }
      completed = true;
      _pendingRequests.remove(xhr);
      for (final subscription in subscriptions) {
        unawaited(subscription.cancel());
      }
      if (response != null) {
        completer.complete(response);
      } else {
        completer.completeError(error ?? StateError('request failed'), trace);
      }
    }

    void fail(Object error, [StackTrace? trace]) {
      finish(null, error, trace);
    }

    try {
      xhr.open(method.toUpperCase(), url, async: true);
      xhr.withCredentials = true;
      xhr.responseType = 'text';
      xhr.timeout = policy.requestTimeout.inMilliseconds;

      final requestHeaders = <String, String>{
        'Accept': 'application/json',
        ...?headers,
      };
      final csrfToken = _csrfTokenForRequest(method);
      if (csrfToken != null) {
        requestHeaders['X-CSRF-Token'] = csrfToken;
      }
      if (body != null) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      for (final entry in requestHeaders.entries) {
        if (_isTransportManagedHeader(entry.key)) {
          continue;
        }
        xhr.setRequestHeader(entry.key, entry.value);
      }

      subscriptions.addAll(<StreamSubscription<dynamic>>[
        xhr.onLoad.listen((_) {
          try {
            final statusCode = xhr.status ?? 0;
            final responseText = xhr.responseText ?? '';
            if (utf8.encode(responseText).length > policy.maxResponseBytes) {
              fail(ResponseTooLargeException(policy.maxResponseBytes));
              xhr.abort();
              return;
            }

            if (path == '/auth/login' ||
                path == '/auth/register' ||
                path == '/auth/refresh') {
              _sessionHint = statusCode >= 200 && statusCode < 300;
            } else if (path == '/auth/logout' &&
                statusCode >= 200 &&
                statusCode < 300) {
              _sessionHint = false;
            }

            Map<String, String> responseHeaders;
            try {
              responseHeaders = xhr.responseHeaders;
            } catch (_) {
              responseHeaders = const <String, String>{};
            }
            finish(
              RawHttpResponse(
                statusCode: statusCode,
                body: responseText,
                headers: responseHeaders,
              ),
            );
          } catch (error, trace) {
            fail(error, trace);
          }
        }),
        xhr.onError
            .listen((event) => fail(StateError('network request failed'))),
        xhr.onAbort.listen((event) => fail(StateError('request cancelled'))),
        xhr.onTimeout
            .listen((event) => fail(TimeoutException('request timed out'))),
        xhr.onProgress.listen((event) {
          if ((event.loaded ?? 0) > policy.maxResponseBytes) {
            fail(ResponseTooLargeException(policy.maxResponseBytes));
            xhr.abort();
          }
        }),
      ]);

      final encodedBody = body == null ? null : jsonEncode(body);
      xhr.send(encodedBody);
    } catch (error, trace) {
      fail(error, trace);
    }

    return completer.future;
  }

  @override
  void cancelPendingRequests() {
    for (final request in _pendingRequests.toList()) {
      request.abort();
    }
    _pendingRequests.clear();
  }

  @override
  void clearSession() {
    _sessionHint = false;
    // The refresh/session cookies are HttpOnly and intentionally cannot be
    // accessed here. Only remove the script-visible CSRF hints.
    for (final name in const [
      'cloudtodo_user_csrf_token',
      'cloudtodo_admin_csrf_token',
    ]) {
      html.document.cookie = '$name=; Max-Age=0; Path=/';
    }
  }

  @override
  void dispose() {
    if (_disposed) {
      return;
    }
    _disposed = true;
    cancelPendingRequests();
    clearSession();
  }

  String _buildUrl(String path, Map<String, String?>? queryParameters) {
    final normalizedBase = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final raw = '$normalizedBase$normalizedPath';
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        uri.userInfo.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        (uri.hasScheme && uri.scheme != 'http' && uri.scheme != 'https')) {
      throw const FormatException('apiBaseUrl must be a valid HTTP(S) URL.');
    }

    final pageScheme = Uri.base.scheme;
    if (pageScheme == 'https' && uri.scheme == 'http') {
      throw const FormatException(
          'HTTPS pages cannot send credentials to an HTTP API.');
    }
    if (!kDebugMode &&
        uri.hasScheme &&
        Uri.base.scheme.isNotEmpty &&
        Uri.base.host.isNotEmpty &&
        !_sameOrigin(uri, Uri.base)) {
      throw const FormatException(
          'Release Web builds require a same-origin HTTPS API.');
    }

    if (queryParameters == null || queryParameters.isEmpty) {
      return uri.toString();
    }

    final cleanedQuery = <String, String>{
      for (final entry in queryParameters.entries)
        if (entry.value != null && entry.value!.trim().isNotEmpty)
          entry.key: entry.value!,
    };

    return uri
        .replace(queryParameters: cleanedQuery.isEmpty ? null : cleanedQuery)
        .toString();
  }

  String? _csrfTokenForRequest(String method) {
    if (_isSafeMethod(method)) {
      return null;
    }

    return _readCookie('cloudtodo_user_csrf_token') ??
        _readCookie('cloudtodo_admin_csrf_token');
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

  bool _sameOrigin(Uri left, Uri right) {
    final leftPort = left.hasPort ? left.port : _defaultPort(left.scheme);
    final rightPort = right.hasPort ? right.port : _defaultPort(right.scheme);
    return left.scheme == right.scheme &&
        left.host == right.host &&
        leftPort == rightPort;
  }

  int? _defaultPort(String scheme) {
    return switch (scheme) {
      'http' => 80,
      'https' => 443,
      _ => null,
    };
  }

  String? _readCookie(String name) {
    final prefix = '$name=';
    for (final part in html.document.cookie?.split(';') ?? const <String>[]) {
      final trimmed = part.trim();
      if (!trimmed.startsWith(prefix)) {
        continue;
      }
      try {
        return Uri.decodeComponent(trimmed.substring(prefix.length));
      } on FormatException {
        return null;
      }
    }
    return null;
  }
}
