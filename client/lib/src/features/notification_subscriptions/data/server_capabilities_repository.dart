import '../../../core/http/http_client.dart';
import '../domain/server_capabilities.dart';
class ServerCapabilitiesRepository { ServerCapabilitiesRepository(this._apiClient); final ApiClient _apiClient; Future<ServerCapabilities> getCapabilities() => _apiClient.get('/capabilities', parser: (data) => ServerCapabilities.fromJson(data as Map<String, dynamic>)); }