import '../../../core/http/http_client.dart';

class SyncSnapshot {
  const SyncSnapshot({
    required this.cursor,
    required this.raw,
  });

  final String cursor;
  final Map<String, dynamic> raw;

  factory SyncSnapshot.fromJson(Map<String, dynamic> json) {
    return SyncSnapshot(
      cursor: json['cursor'] as String? ?? '',
      raw: json,
    );
  }
}

class SyncRepository {
  SyncRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<SyncSnapshot> bootstrap() {
    return _apiClient.get(
      '/sync/bootstrap',
      parser: (data) => SyncSnapshot.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<SyncSnapshot> changes({required String cursor}) {
    return _apiClient.get(
      '/sync/changes',
      queryParameters: {'cursor': cursor},
      parser: (data) => SyncSnapshot.fromJson(data as Map<String, dynamic>),
    );
  }
}
