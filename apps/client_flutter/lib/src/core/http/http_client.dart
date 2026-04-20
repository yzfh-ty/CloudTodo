import 'dart:async';
import 'dart:convert';

import '../errors/app_exception.dart';
import '../models/api_response.dart';
import 'platform_http_client_stub.dart'
    if (dart.library.io) 'platform_http_client_io.dart'
    if (dart.library.html) 'platform_http_client_web.dart';

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
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  });
}

PlatformHttpClient createHttpClient(String baseUrl) {
  return createPlatformHttpClient(baseUrl);
}

class ApiClient {
  ApiClient(this._httpClient);

  final PlatformHttpClient _httpClient;
  Future<bool> Function()? _refreshSession;
  void Function()? _clearSession;
  Future<bool>? _refreshFuture;

  void registerSessionHooks({
    required Future<bool> Function() refreshSession,
    required void Function() clearSession,
  }) {
    _refreshSession = refreshSession;
    _clearSession = clearSession;
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
  }) async {
    try {
      final response = await _httpClient.request(
        method: method,
        path: path,
        queryParameters: queryParameters,
        body: body,
      );

      if (response.statusCode == 401 &&
          allowRefresh &&
          _shouldAttemptRefresh(path)) {
        final refreshed = await _refresh();
        if (refreshed) {
          return _request(
            method: method,
            path: path,
            queryParameters: queryParameters,
            body: body,
            parser: parser,
            allowRefresh: false,
          );
        }

        _clearSession?.call();
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
        return parser(apiResponse.data);
      }

      return parser(payload);
    } catch (error) {
      if (error is AppException) {
        rethrow;
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

  Future<bool> _refresh() async {
    if (_refreshSession == null) {
      return false;
    }

    if (_refreshFuture != null) {
      return _refreshFuture!;
    }

    final completer = Completer<bool>();
    _refreshFuture = completer.future;

    try {
      completer.complete(await _refreshSession!.call());
      return completer.future;
    } finally {
      _refreshFuture = null;
    }
  }
}
