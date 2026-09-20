import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/notification_subscription.dart';

class NotificationSubscriptionsRepository {
  NotificationSubscriptionsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<NotificationSubscription>> getSubscriptions() async {
    final result = <NotificationSubscription>[];
    String? cursor;
    while (true) {
      final page = await _apiClient.get(
        '/notification-subscriptions',
        queryParameters: {'cursor': cursor, 'limit': '100'},
        parser: (data) => PagedResponse.fromJson(
          data as Map<String, dynamic>,
          NotificationSubscription.fromJson,
        ),
      );
      result.addAll(page.items);
      final nextCursor = page.nextCursor;
      if (!page.hasMore || nextCursor == null || nextCursor == cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return result;
  }

  Future<NotificationSubscription> upsertSubscription({
    required String channel,
    required String targetValue,
    required bool enabled,
    String? secret,
  }) {
    final body = <String, Object?>{'enabled': enabled};
    switch (channel) {
      case 'email':
        body['email'] = targetValue.trim();
      case 'telegram':
        body['chat_id'] = targetValue.trim();
      default:
        body['target_url'] = targetValue.trim();
        if (secret != null && secret.trim().isNotEmpty)
          body['secret'] = secret.trim();
    }
    return _apiClient.put(
      '/notification-subscriptions/$channel',
      body: body,
      parser: (data) =>
          NotificationSubscription.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<void> deleteSubscription(String id) =>
      _apiClient.delete('/notification-subscriptions/$id', parser: (_) => null);

  Future<Map<String, dynamic>> testSubscription(String id) =>
      _apiClient.post('/notification-subscriptions/$id/test',
          parser: (data) => data as Map<String, dynamic>);
}
