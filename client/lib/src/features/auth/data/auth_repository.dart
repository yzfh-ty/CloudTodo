import '../../../core/errors/app_exception.dart';
import '../../../core/http/http_client.dart';
import '../../devices/data/device_repository.dart';
import '../domain/session_user.dart';

class AuthRepository {
  AuthRepository(this._apiClient);

  final ApiClient _apiClient;

  bool get hasSessionHint => _apiClient.hasSessionHint;

  Future<SessionUser> login({
    required String account,
    required String password,
  }) {
    return _apiClient.post(
      '/auth/login',
      body: {
        'account': account.trim(),
        'password': password,
        'device': currentDevicePayload(),
      },
      parser: _parseAuthenticatedUser,
      allowRefresh: false,
    );
  }

  Future<SessionUser> register({
    required String email,
    required String username,
    required String password,
    required String nickname,
  }) {
    return _apiClient.post(
      '/auth/register',
      body: {
        'email': email.trim(),
        'username': username.trim(),
        'password': password,
        'nickname': nickname.trim().isEmpty ? null : nickname.trim(),
        'device': currentDevicePayload(),
      },
      parser: _parseAuthenticatedUser,
      allowRefresh: false,
    );
  }

  Future<SessionUser> refresh() async {
    final refreshToken = _apiClient.refreshToken;
    if ((refreshToken == null || refreshToken.isEmpty) &&
        !_apiClient.hasSessionHint) {
      throw const AppException(
        message: 'refresh token is missing',
        code: 'SESSION_EXPIRED',
      );
    }

    final session = await _apiClient.post<Map<String, dynamic>>(
      '/auth/refresh',
      body: refreshToken == null || refreshToken.isEmpty
          ? const <String, dynamic>{}
          : {'refresh_token': refreshToken},
      parser: (data) => _asMap(data, 'session'),
      allowRefresh: false,
    );
    _storeSession(session);

    return _apiClient.get(
      '/me',
      parser: (data) => SessionUser.fromJson(_asMap(data, 'user')),
      allowRefresh: false,
    );
  }

  Future<void> logout() {
    final refreshToken = _apiClient.refreshToken;
    return _apiClient.post(
      '/auth/logout',
      body: {'refresh_token': refreshToken},
      parser: (_) => null,
      allowRefresh: false,
    );
  }

  Future<void> logoutAll() {
    return _apiClient.post(
      '/auth/logout-all',
      parser: (_) => null,
      allowRefresh: false,
    );
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) {
    return _apiClient.post(
      '/me/change-password',
      body: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
      parser: (_) => null,
    );
  }

  SessionUser _parseAuthenticatedUser(Object? data) {
    final payload = _asMap(data, 'authentication response');
    _storeSession(_asMap(payload['session'], 'session'));
    return SessionUser.fromJson(_asMap(payload['user'], 'user'));
  }

  void _storeSession(Map<String, dynamic> session) {
    final accessToken = session['access_token'];
    final refreshToken = session['refresh_token'];
    if (accessToken is! String ||
        accessToken.isEmpty ||
        refreshToken is! String ||
        refreshToken.isEmpty) {
      throw const AppException(
        message: 'invalid session response',
        code: 'INVALID_SESSION_RESPONSE',
      );
    }
    _apiClient.setSessionTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
  }

  Map<String, dynamic> _asMap(Object? value, String field) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    throw AppException(
      message: 'invalid $field response',
      code: 'INVALID_API_RESPONSE',
    );
  }
}
