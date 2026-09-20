import '../../../core/errors/app_exception.dart';
import '../../../core/http/http_client.dart';
import '../domain/profile_user.dart';

class ProfileRepository {
  ProfileRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<ProfileUser> getMe() =>
      _apiClient.get('/me', parser: _parseProfileUser);

  Future<ProfileUser> updateMe({
    required String nickname,
    required String timezone,
  }) =>
      _apiClient.patch(
        '/me',
        body: {
          'nickname': nickname.trim(),
          'timezone': timezone.trim(),
        },
        parser: _parseProfileUser,
      );

  Future<Map<String, dynamic>> exportMe() => _apiClient.get('/me/export',
      parser: (data) => data as Map<String, dynamic>);

  Future<void> deleteMe({
    required String password,
    required String confirmation,
  }) =>
      _apiClient.delete(
        '/me',
        body: {
          'password': password,
          'confirmation': confirmation,
        },
        parser: (_) => null,
      );

  ProfileUser _parseProfileUser(Object? data) {
    final payload = data as Map<String, dynamic>;
    final user = payload['user'];
    if (user is! Map<String, dynamic>) {
      throw const AppException(
        message: 'invalid profile response',
        code: 'INVALID_PROFILE_RESPONSE',
      );
    }
    return ProfileUser.fromJson(user);
  }
}
