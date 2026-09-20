import '../../../core/http/http_client.dart';
import '../../../core/models/paged_response.dart';
import '../domain/notification_delivery.dart';

class NotificationDeliveriesRepository {
  NotificationDeliveriesRepository(this._apiClient);
  final ApiClient _apiClient;
  Future<List<NotificationDelivery>> getDeliveries({
    String? cursor,
    int limit = 50,
  }) async {
    final result = <NotificationDelivery>[];
    var nextCursor = cursor;
    while (true) {
      final page = await _apiClient.get(
        '/notification-deliveries',
        queryParameters: {
          'cursor': nextCursor,
          'limit': '$limit',
        },
        parser: (data) => PagedResponse.fromJson(
          data as Map<String, dynamic>,
          NotificationDelivery.fromJson,
        ),
      );
      result.addAll(page.items);
      final returnedCursor = page.nextCursor;
      if (!page.hasMore ||
          returnedCursor == null ||
          returnedCursor == nextCursor) {
        break;
      }
      nextCursor = returnedCursor;
    }
    return result;
  }

  Future<NotificationDelivery> getDelivery(String id) =>
      _apiClient.get('/notification-deliveries/$id',
          parser: (data) =>
              NotificationDelivery.fromJson(data as Map<String, dynamic>));
}
