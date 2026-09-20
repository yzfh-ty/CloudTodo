import '../../../core/http/http_client.dart';
import '../domain/notification_subscription.dart';

class NotificationSubscriptionsRepository {
  NotificationSubscriptionsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<NotificationSubscription>> getSubscriptions() {
    return _apiClient.get(
      '/notification-subscriptions',
      parser: (data) {
        final payload = data as Map<String, dynamic>;
        final items = payload['items'] as List<dynamic>? ?? const [];
        return items
            .whereType<Map<String, dynamic>>()
            .map(NotificationSubscription.fromJson)
            .toList(growable: false);
      },
    );
  }

  Future<NotificationSubscription> createSubscription({
    required String name,
    required String targetUrl,
    required String payloadTemplate,
    required bool isEnabled,
    String? secret,
  }) {
    return _apiClient.put(
      '/notification-subscriptions/webhook',
      body: {
        'enabled': isEnabled,
        'name': name.trim(),
        'target_url': targetUrl.trim(),
        'secret': secret?.trim().isEmpty ?? true ? null : secret?.trim(),
      },
      parser: (data) => NotificationSubscription.fromJson(
        data as Map<String, dynamic>,
      ),
    );
  }

  Future<NotificationSubscription> updateSubscription({
    required String id,
    required String name,
    required String targetUrl,
    required String payloadTemplate,
    required bool isEnabled,
    String? secret,
    bool clearSecret = false,
    int version = 1,
  }) {
    final body = <String, Object?>{
      'enabled': isEnabled,
      'name': name.trim(),
      'target_url': targetUrl.trim(),
      'version': version,
    };
    if (clearSecret) {
      body['secret'] = null;
    } else if (secret != null && secret.trim().isNotEmpty) {
      body['secret'] = secret.trim();
    }

    return _apiClient.put(
      '/notification-subscriptions/webhook',
      body: body,
      parser: (data) => NotificationSubscription.fromJson(
        data as Map<String, dynamic>,
      ),
    );
  }

  Future<void> deleteSubscription(String id) {
    return _apiClient.delete(
      '/notification-subscriptions/$id',
      parser: (_) => null,
    );
  }

  Future<Map<String, dynamic>> testSubscription(String id) {
    return _apiClient.post(
      '/notification-subscriptions/$id/test',
      parser: (data) => data as Map<String, dynamic>,
    );
  }
}
