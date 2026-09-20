import '../../../core/errors/app_exception.dart';
import '../../../core/http/http_client.dart';

class SyncSnapshot {
  const SyncSnapshot({
    required this.cursor,
    required this.raw,
  });

  final String cursor;
  final Map<String, dynamic> raw;

  factory SyncSnapshot.fromJson(Map<String, dynamic> json) {
    final cursor = json['cursor'];
    if (cursor is! String || cursor.isEmpty) {
      throw const AppException(
        message: 'invalid sync response',
        code: 'INVALID_SYNC_RESPONSE',
      );
    }
    return SyncSnapshot(cursor: cursor, raw: json);
  }
}

class SyncRepository {
  SyncRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<SyncSnapshot> bootstrap() {
    return _apiClient.get(
      '/sync/bootstrap',
      parser: (data) => SyncSnapshot.fromJson(
        _validateBootstrap(data),
      ),
    );
  }

  Future<SyncSnapshot> changes({required String cursor}) {
    return _apiClient.get(
      '/sync/changes',
      queryParameters: {'cursor': cursor, 'limit': '100'},
      parser: (data) => SyncSnapshot.fromJson(
        _validateChanges(data),
      ),
    );
  }
}

Map<String, dynamic> _validateBootstrap(Object? data) {
  final raw = _asMap(data);
  if (raw['snapshot_at'] is! String ||
      raw['lists'] is! List ||
      raw['tags'] is! List ||
      raw['todos'] is! List ||
      raw['reminders'] is! List ||
      raw['notification_subscriptions'] is! List) {
    throw _invalidSyncResponse();
  }
  return raw;
}

Map<String, dynamic> _validateChanges(Object? data) {
  final raw = _asMap(data);
  final items = raw['items'];
  if (items is! List || raw['cursor'] is! String) {
    throw _invalidSyncResponse();
  }
  for (final item in items) {
    if (item is! Map<String, dynamic> ||
        item['collection'] is! String ||
        item['operation'] is! String ||
        item['id'] is! String ||
        item['version'] is! int ||
        item['updated_at'] is! String) {
      throw _invalidSyncResponse();
    }
  }
  return raw;
}

Map<String, dynamic> _asMap(Object? data) {
  if (data is Map<String, dynamic>) {
    return data;
  }
  throw _invalidSyncResponse();
}

AppException _invalidSyncResponse() {
  return const AppException(
    message: 'invalid sync response',
    code: 'INVALID_SYNC_RESPONSE',
  );
}
