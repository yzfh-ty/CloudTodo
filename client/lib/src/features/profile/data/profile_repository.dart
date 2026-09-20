import '../../../core/http/http_client.dart';
import '../domain/profile_user.dart';

class ProfileRepository {
  ProfileRepository(this._apiClient);
  final ApiClient _apiClient;

  Future<ProfileUser> getMe() => _apiClient.get('/me', parser: (data) => ProfileUser.fromJson(data as Map<String, dynamic>));
  Future<ProfileUser> updateMe({required String nickname, required String email, required String timezone}) => _apiClient.patch('/me', body: {'nickname': nickname.trim(), 'timezone': timezone.trim()}, parser: (data) => ProfileUser.fromJson(data as Map<String, dynamic>));
  Future<Map<String, dynamic>> exportMe() => _apiClient.get('/me/export', parser: (data) => data as Map<String, dynamic>);
  Future<void> deleteMe({required String password, required String confirmation}) => _apiClient.delete('/me', body: {'password': password, 'confirmation': confirmation}, parser: (_) => null);
}