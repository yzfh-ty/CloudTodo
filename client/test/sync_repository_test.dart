import 'dart:convert';

import 'package:client_flutter/src/core/errors/app_exception.dart';
import 'package:client_flutter/src/core/http/http_client.dart';
import 'package:client_flutter/src/features/sync/data/sync_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('bootstrap reads the documented snapshot shape', () async {
    final transport = _SyncTransport([
      {
        'snapshot_at': '2026-07-23T10:00:00.000Z',
        'cursor': 'cursor-1',
        'lists': const [],
        'tags': const [],
        'todos': const [
          {'id': 'todo-1'},
          {'id': 'todo-2'},
        ],
        'reminders': const [],
        'notification_subscriptions': const [],
      },
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    final snapshot = await repository.bootstrap();

    expect(snapshot.cursor, 'cursor-1');
    expect((snapshot.raw['todos'] as List).length, 2);
    expect(transport.requests.single.path, '/sync/bootstrap');
    expect(transport.requests.single.query, isEmpty);
  });

  test('bootstrap rejects a response missing documented collections', () async {
    final transport = _SyncTransport([
      {
        'snapshot_at': '2026-07-23T10:00:00.000Z',
        'cursor': 'cursor-1',
        'lists': const [],
      },
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    await expectLater(
      repository.bootstrap(),
      throwsA(isA<AppException>().having(
        (error) => error.code,
        'code',
        'INVALID_SYNC_RESPONSE',
      )),
    );
  });

  test('changes sends an opaque cursor and documented limit', () async {
    final transport = _SyncTransport([
      {
        'cursor': 'cursor-2',
        'items': const [
          {
            'collection': 'todos',
            'operation': 'upsert',
            'id': 'todo-1',
            'version': 2,
            'updated_at': '2026-07-23T10:05:00.000Z',
          },
        ],
      },
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    final snapshot = await repository.changes(cursor: 'cursor-1');

    expect(snapshot.cursor, 'cursor-2');
    expect(transport.requests.single.path, '/sync/changes');
    expect(transport.requests.single.query, {
      'cursor': 'cursor-1',
      'limit': '100',
    });
  });

  test('changes rejects an invalid event item', () async {
    final transport = _SyncTransport([
      {
        'cursor': 'cursor-2',
        'items': const [
          {'collection': 'todos'},
        ],
      },
    ]);
    final apiClient = ApiClient(transport);
    final repository = SyncRepository(apiClient);
    addTearDown(apiClient.dispose);

    await expectLater(
      repository.changes(cursor: 'cursor-1'),
      throwsA(isA<AppException>().having(
        (error) => error.code,
        'code',
        'INVALID_SYNC_RESPONSE',
      )),
    );
  });
}

class _SyncTransport implements PlatformHttpClient {
  _SyncTransport(this._responses);

  final List<Map<String, dynamic>> _responses;
  final List<({String path, Map<String, String?> query})> requests = [];

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
    if (_responses.isEmpty) {
      throw StateError('unexpected sync request');
    }
    return RawHttpResponse(
      statusCode: 200,
      body: jsonEncode({
        'code': 'OK',
        'message': 'success',
        'data': _responses.removeAt(0),
      }),
      headers: const {},
    );
  }
}
