import '../../../core/http/http_client.dart';
import '../domain/notification_endpoint.dart';

class NotificationEndpointsRepository {
  NotificationEndpointsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<NotificationEndpoint>> getEndpoints() {
    return _apiClient.get(
      '/notification-endpoints',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(NotificationEndpoint.fromJson)
            .toList(growable: false);
      },
    );
  }

  Future<NotificationEndpoint> createEndpoint({
    required String name,
    required String targetUrl,
    required String payloadTemplate,
    required bool isEnabled,
    String? secret,
  }) {
    return _apiClient.post(
      '/notification-endpoints',
      body: {
        'name': name,
        'target_url': targetUrl,
        'payload_template': payloadTemplate.trim().isEmpty ? null : payloadTemplate,
        'secret': secret?.isEmpty ?? true ? null : secret,
        'is_enabled': isEnabled,
      },
      parser: (data) => NotificationEndpoint.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<NotificationEndpoint> updateEndpoint({
    required String id,
    required String name,
    required String targetUrl,
    required String payloadTemplate,
    required bool isEnabled,
    String? secret,
    bool clearSecret = false,
  }) {
    final body = <String, Object?>{
      'name': name,
      'target_url': targetUrl,
      'payload_template': payloadTemplate.trim().isEmpty ? null : payloadTemplate,
      'is_enabled': isEnabled,
    };

    if (clearSecret) {
      body['secret'] = null;
    } else if (secret != null && secret.trim().isNotEmpty) {
      body['secret'] = secret.trim();
    }

    return _apiClient.patch(
      '/notification-endpoints/$id',
      body: body,
      parser: (data) => NotificationEndpoint.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<NotificationEndpoint> deleteEndpoint(String id) {
    return _apiClient.delete(
      '/notification-endpoints/$id',
      parser: (data) => NotificationEndpoint.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<Map<String, dynamic>> testEndpoint(String id) {
    return _apiClient.post(
      '/notification-endpoints/$id/test',
      parser: (data) => data as Map<String, dynamic>,
    );
  }
}
