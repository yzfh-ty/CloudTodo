import 'dart:convert';
import 'dart:io';

import 'http_client.dart';

PlatformHttpClient createPlatformHttpClient(String baseUrl) {
  return IoPlatformHttpClient(baseUrl);
}

class IoPlatformHttpClient implements PlatformHttpClient {
  IoPlatformHttpClient(this.baseUrl);

  final String baseUrl;
  final HttpClient _client = HttpClient();
  final Map<String, String> _cookies = <String, String>{};

  @override
  bool get hasSessionHint =>
      _cookies.containsKey('cloudtodo_user_csrf_token') ||
      _cookies.containsKey('cloudtodo_admin_csrf_token');

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    final uri = _buildUri(path, queryParameters);
    final request = await _client.openUrl(method, uri);

    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (_cookies.isNotEmpty) {
      request.headers.set(
        HttpHeaders.cookieHeader,
        _cookies.entries
            .map((entry) => '${entry.key}=${entry.value}')
            .join('; '),
      );
    }

    final csrfToken = _csrfTokenForRequest(method);
    if (csrfToken != null) {
      request.headers.set('X-CSRF-Token', csrfToken);
    }

    for (final entry in (headers ?? const <String, String>{}).entries) {
      request.headers.set(entry.key, entry.value);
    }

    if (body != null) {
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      request.write(jsonEncode(body));
    }

    final response = await request.close();
    final responseBody = await utf8.decoder.bind(response).join();
    for (final cookie in response.cookies) {
      _cookies[cookie.name] = cookie.value;
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
    final baseUri = Uri.parse(normalizedBase);
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

  String? _csrfTokenForRequest(String method) {
    if (_isSafeMethod(method)) {
      return null;
    }

    return _cookies['cloudtodo_user_csrf_token'] ??
        _cookies['cloudtodo_admin_csrf_token'];
  }

  bool _isSafeMethod(String method) {
    return const {'GET', 'HEAD', 'OPTIONS'}.contains(method.toUpperCase());
  }
}
