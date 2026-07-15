// ignore_for_file: deprecated_member_use

import 'dart:convert';
import 'dart:html' as html;

import 'http_client.dart';

PlatformHttpClient createPlatformHttpClient(String baseUrl) {
  return WebPlatformHttpClient(baseUrl);
}

class WebPlatformHttpClient implements PlatformHttpClient {
  WebPlatformHttpClient(this.baseUrl);

  final String baseUrl;

  @override
  bool get hasSessionHint =>
      _readCookie('cloudtodo_user_csrf_token') != null ||
      _readCookie('cloudtodo_admin_csrf_token') != null;

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    final url = _buildUrl(path, queryParameters);
    final requestHeaders = <String, String>{
      'Accept': 'application/json',
      ...?headers,
    };
    final csrfToken = _csrfTokenForRequest(method);
    if (csrfToken != null) {
      requestHeaders['X-CSRF-Token'] = csrfToken;
    }

    String? sendData;
    if (body != null) {
      requestHeaders['Content-Type'] = 'application/json';
      sendData = jsonEncode(body);
    }

    final response = await html.HttpRequest.request(
      url,
      method: method,
      requestHeaders: requestHeaders,
      sendData: sendData,
      withCredentials: true,
    );

    return RawHttpResponse(
      statusCode: response.status ?? 200,
      body: response.responseText ?? '',
      headers: response.responseHeaders,
    );
  }

  String _buildUrl(String path, Map<String, String?>? queryParameters) {
    final normalizedBase = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final raw = '$normalizedBase$normalizedPath';
    final uri = Uri.parse(raw);

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

  String? _readCookie(String name) {
    final prefix = '$name=';
    for (final part in html.document.cookie?.split(';') ?? const <String>[]) {
      final trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        return Uri.decodeComponent(trimmed.substring(prefix.length));
      }
    }
    return null;
  }
}
