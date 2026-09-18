import '../../../core/errors/app_exception.dart';
import '../../../core/http/http_client.dart';

const _syncCollectionKeys = <String>[
  'todo_lists',
  'tags',
  'todo_tags',
  'todos',
  'reminders',
  'reminder_events',
  'notification_endpoints',
  'notification_deliveries',
  'devices',
];

const _syncPageSize = 50;
const _maxSyncPages = 1000;
const _maxMergedSyncItems = 50000;

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

  Future<SyncSnapshot> bootstrap() async {
    Map<String, dynamic>? merged;
    String? snapshotAt;
    var mergedItemCount = 0;

    for (var page = 1; page <= _maxSyncPages; page += 1) {
      final query = <String, String?>{
        'page': '$page',
        'page_size': '$_syncPageSize',
        if (snapshotAt != null) 'snapshot_at': snapshotAt,
      };
      final raw = await _apiClient.get<Map<String, dynamic>>(
        '/sync/bootstrap',
        queryParameters: query,
        parser: _parseSyncPage,
      );
      _validateSyncPage(raw, expectedPage: page);
      final cursor = _readIsoCursor(raw);
      mergedItemCount = _checkedMergedItemCount(mergedItemCount, raw);

      if (snapshotAt == null) {
        snapshotAt = cursor;
        merged = _copySyncPage(raw);
      } else {
        if (cursor != snapshotAt) {
          throw _invalidSyncResponse();
        }
        _mergeSyncPage(merged!, raw);
      }

      if (raw['has_more'] == false) {
        final result = merged;
        result
          ..['cursor'] = snapshotAt
          ..['page'] = page
          ..['has_more'] = false;
        return SyncSnapshot.fromJson(result);
      }
    }

    throw const AppException(
      message: 'sync page limit exceeded',
      code: 'SYNC_PAGE_LIMIT_EXCEEDED',
    );
  }

  Future<SyncSnapshot> changes({required String cursor}) async {
    Map<String, dynamic>? merged;
    var requestCursor = cursor;
    var mergedItemCount = 0;
    int? previousPage;

    for (var request = 1; request <= _maxSyncPages; request += 1) {
      final raw = await _apiClient.get<Map<String, dynamic>>(
        '/sync/changes',
        queryParameters: {
          'cursor': requestCursor,
          'page_size': '$_syncPageSize',
        },
        parser: _parseSyncPage,
      );
      final page = _validateSyncPage(
        raw,
        expectedPage: previousPage == null ? null : previousPage + 1,
      );
      final nextCursor = _readCursor(raw);
      mergedItemCount = _checkedMergedItemCount(mergedItemCount, raw);

      if (merged == null) {
        merged = _copySyncPage(raw);
      } else {
        _mergeSyncPage(merged, raw);
      }

      if (raw['has_more'] == false) {
        if (DateTime.tryParse(nextCursor) == null) {
          throw _invalidSyncResponse();
        }
        merged
          ..['cursor'] = nextCursor
          ..['page'] = page
          ..['has_more'] = false;
        return SyncSnapshot.fromJson(merged);
      }
      if (nextCursor == requestCursor) {
        throw _invalidSyncResponse();
      }

      previousPage = page;
      requestCursor = nextCursor;
    }

    throw const AppException(
      message: 'sync page limit exceeded',
      code: 'SYNC_PAGE_LIMIT_EXCEEDED',
    );
  }
}

Map<String, dynamic> _parseSyncPage(Object? data) {
  if (data is! Map<String, dynamic>) {
    throw _invalidSyncResponse();
  }
  return data;
}

String _readCursor(Map<String, dynamic> raw) {
  final cursor = raw['cursor'];
  if (cursor is! String || cursor.isEmpty) {
    throw _invalidSyncResponse();
  }
  return cursor;
}

String _readIsoCursor(Map<String, dynamic> raw) {
  final cursor = _readCursor(raw);
  if (DateTime.tryParse(cursor) == null) {
    throw _invalidSyncResponse();
  }
  return cursor;
}

int _validateSyncPage(
  Map<String, dynamic> raw, {
  int? expectedPage,
}) {
  final page = raw['page'];
  if (page is! int ||
      page < 1 ||
      page > _maxSyncPages ||
      (expectedPage != null && page != expectedPage) ||
      raw['page_size'] != _syncPageSize ||
      raw['has_more'] is! bool) {
    throw _invalidSyncResponse();
  }
  for (final key in _syncCollectionKeys) {
    if (raw[key] is! List) {
      throw _invalidSyncResponse();
    }
  }
  return page;
}

int _checkedMergedItemCount(
  int currentCount,
  Map<String, dynamic> page,
) {
  final nextCount = _syncCollectionKeys.fold<int>(
    currentCount,
    (count, key) => count + (page[key] as List).length,
  );
  if (nextCount > _maxMergedSyncItems) {
    throw const AppException(
      message: 'sync result is too large',
      code: 'SYNC_RESULT_LIMIT_EXCEEDED',
    );
  }
  return nextCount;
}

Map<String, dynamic> _copySyncPage(Map<String, dynamic> raw) {
  final copy = Map<String, dynamic>.from(raw);
  for (final key in _syncCollectionKeys) {
    copy[key] = List<dynamic>.from(raw[key] as List);
  }
  return copy;
}

void _mergeSyncPage(
  Map<String, dynamic> target,
  Map<String, dynamic> page,
) {
  for (final key in _syncCollectionKeys) {
    (target[key] as List<dynamic>).addAll(page[key] as List);
  }
}

AppException _invalidSyncResponse() {
  return const AppException(
    message: 'invalid sync response',
    code: 'INVALID_SYNC_RESPONSE',
  );
}
