import '../../../core/http/http_client.dart';
import '../domain/session_user.dart';

class AuthRepository {
  AuthRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<SessionUser> login({
    required String account,
    required String password,
  }) {
    return _apiClient.post(
      '/auth/login',
      body: {
        'account': account.trim(),
        'password': password,
      },
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        return SessionUser.fromJson(payload['user'] as Map<String, dynamic>);
      },
      allowRefresh: false,
    );
  }

  Future<SessionUser> register({
    required String email,
    required String username,
    required String password,
    required String nickname,
    required String timezone,
  }) {
    return _apiClient.post(
      '/auth/register',
      body: {
        'email': email.trim(),
        'username': username.trim(),
        'password': password,
        'nickname': nickname.trim().isEmpty ? null : nickname.trim(),
        'timezone': timezone.trim(),
      },
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        return SessionUser.fromJson(payload['user'] as Map<String, dynamic>);
      },
      allowRefresh: false,
    );
  }

  Future<SessionUser> refresh() {
    return _apiClient.post(
      '/auth/refresh',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        return SessionUser.fromJson(payload['user'] as Map<String, dynamic>);
      },
      allowRefresh: false,
    );
  }

  Future<void> logout() {
    return _apiClient.post(
      '/auth/logout',
      parser: (_) => null,
      allowRefresh: false,
    );
  }
}
