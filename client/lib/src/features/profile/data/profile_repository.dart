import '../../../core/http/http_client.dart';
import '../domain/profile_user.dart';

class ProfileRepository {
  ProfileRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<ProfileUser> getMe() {
    return _apiClient.get(
      '/me',
      parser: (data) => ProfileUser.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<ProfileUser> updateMe({
    required String nickname,
    required String email,
    required String timezone,
  }) {
    return _apiClient.patch(
      '/me',
      body: {
        'nickname': nickname.trim(),
        'timezone': timezone.trim(),
      },
      parser: (data) => ProfileUser.fromJson(data as Map<String, dynamic>),
    );
  }
}
