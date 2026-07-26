import 'dart:convert';

import 'package:client_flutter/src/core/errors/app_exception.dart';
import 'package:client_flutter/src/core/http/http_client.dart';
import 'package:client_flutter/src/features/sync/data/sync_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('bootstrap downloads and merges every page from one snapshot', () async {
    final transport = _SyncTransport([
      _page(
        cursor: '2026-07-23T10:00:00.000Z',
        page: 1,
        hasMore: true,
        todos: const [
          {'id': 'todo-1'},
        ],
      ),
      _page(
        cursor: '2026-07-23T10:00:00.000Z',
        page: 2,
        hasMore: false,
        todos: const [
          {'id': 'todo-2'},
        ],
      ),
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    final snapshot = await repository.bootstrap();

    expect(snapshot.cursor, '2026-07-23T10:00:00.000Z');
    expect(
      (snapshot.raw['todos'] as List)
          .map((item) => (item as Map<String, dynamic>)['id']),
      ['todo-1', 'todo-2'],
    );
    expect(snapshot.raw['page'], 2);
    expect(snapshot.raw['has_more'], isFalse);
    expect(transport.queries, [
      {
        'page': '1',
        'page_size': '50',
      },
      {
        'page': '2',
        'page_size': '50',
        'snapshot_at': '2026-07-23T10:00:00.000Z',
      },
    ]);
  });

  test('bootstrap rejects a page from a different snapshot', () async {
    final transport = _SyncTransport([
      _page(
        cursor: '2026-07-23T10:00:00.000Z',
        page: 1,
        hasMore: true,
      ),
      _page(
        cursor: '2026-07-23T10:01:00.000Z',
        page: 2,
        hasMore: false,
      ),
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    await expectLater(
      repository.bootstrap(),
      throwsA(
        isA<AppException>().having(
          (error) => error.code,
          'code',
          'INVALID_SYNC_RESPONSE',
        ),
      ),
    );
  });

  test('changes drains every page before advancing the saved cursor', () async {
    final transport = _SyncTransport([
      _page(
        cursor: 'opaque-next-page-cursor',
        page: 1,
        hasMore: true,
        todos: const [
          {'id': 'todo-1'},
        ],
      ),
      _page(
        cursor: '2026-07-23T10:05:00.000Z',
        page: 2,
        hasMore: false,
        todos: const [
          {'id': 'todo-2'},
        ],
      ),
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    final snapshot = await repository.changes(
      cursor: '2026-07-23T10:00:00.000Z',
    );

    expect(snapshot.cursor, '2026-07-23T10:05:00.000Z');
    expect(
      (snapshot.raw['todos'] as List)
          .map((item) => (item as Map<String, dynamic>)['id']),
      ['todo-1', 'todo-2'],
    );
    expect(
      transport.requests.map((request) => request.path),
      ['/sync/changes', '/sync/changes'],
    );
    expect(transport.queries, [
      {
        'cursor': '2026-07-23T10:00:00.000Z',
        'page_size': '50',
      },
      {
        'cursor': 'opaque-next-page-cursor',
        'page_size': '50',
      },
    ]);
  });

  test('changes rejects a pagination cursor that does not advance', () async {
    final transport = _SyncTransport([
      _page(
        cursor: 'same-cursor',
        page: 1,
        hasMore: true,
      ),
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    await expectLater(
      repository.changes(cursor: 'same-cursor'),
      throwsA(
        isA<AppException>().having(
          (error) => error.code,
          'code',
          'INVALID_SYNC_RESPONSE',
        ),
      ),
    );
  });
}

Map<String, dynamic> _page({
  required String cursor,
  required int page,
  required bool hasMore,
  List<Map<String, dynamic>> todos = const [],
}) {
  return {
    'cursor': cursor,
    'page': page,
    'page_size': 50,
    'has_more': hasMore,
    'user': const {'id': 'user-1'},
    'todo_lists': const [],
    'tags': const [],
    'todo_tags': const [],
    'todos': todos,
    'reminders': const [],
    'reminder_events': const [],
    'notification_endpoints': const [],
    'notification_deliveries': const [],
    'devices': const [],
  };
}

class _SyncTransport implements PlatformHttpClient {
  _SyncTransport(this._pages);

  final List<Map<String, dynamic>> _pages;
  final List<({String path, Map<String, String?> query})> requests = [];

  List<Map<String, String?>> get queries =>
      requests.map((request) => request.query).toList(growable: false);

  @override
  bool get hasSessionHint => false;

  @override
  Future<RawHttpResponse> request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String?>? queryParameters,
    Object? body,
  }) async {
    expect(method, 'GET');
    requests.add((
      path: path,
      query: Map<String, String?>.from(queryParameters ?? const {}),
    ));
    if (_pages.isEmpty) {
      throw StateError('unexpected sync request');
    }
    return RawHttpResponse(
      statusCode: 200,
      body: jsonEncode({
        'code': 'OK',
        'message': 'success',
        'data': _pages.removeAt(0),
      }),
      headers: const {},
    );
  }
}
