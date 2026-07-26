import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/session_user.dart';

enum AppSessionStatus {
  initializing,
  authenticated,
  unauthenticated,
  submitting,
}

typedef SessionInvalidationCallback = FutureOr<void> Function(
    {bool clearCookies});

class AppSessionController extends ChangeNotifier {
  AppSessionController({
    required AuthRepository authRepository,
    Future<void> Function(SessionUser user)? onAuthenticated,
    SessionInvalidationCallback? onSessionInvalidated,
  })  : _authRepository = authRepository,
        _onAuthenticated = onAuthenticated,
        _onSessionInvalidated = onSessionInvalidated;

  final AuthRepository _authRepository;
  final Future<void> Function(SessionUser user)? _onAuthenticated;
  final SessionInvalidationCallback? _onSessionInvalidated;

  AppSessionStatus _status = AppSessionStatus.initializing;
  SessionUser? _currentUser;
  String? _lastError;
  _SessionRefreshOperation? _refreshOperation;
  int _sessionGeneration = 0;
  Future<void> _invalidationBarrier = Future<void>.value();

  AppSessionStatus get status => _status;
  SessionUser? get currentUser => _currentUser;
  String? get lastError => _lastError;
  int get sessionGeneration => _sessionGeneration;

  bool get isAuthenticated => _status == AppSessionStatus.authenticated;
  bool get isBusy =>
      _status == AppSessionStatus.initializing ||
      _status == AppSessionStatus.submitting;

  Future<void> restoreSession() async {
    _status = AppSessionStatus.initializing;
    _lastError = null;
    notifyListeners();
    if (!_authRepository.hasSessionHint) {
      forceLogout();
      return;
    }
    await refreshSessionSilently();
  }

  Future<bool> login({
    required String account,
    required String password,
  }) {
    return _submit(() {
      return _authRepository.login(account: account, password: password);
    });
  }

  Future<bool> register({
    required String email,
    required String username,
    required String password,
    required String nickname,
  }) {
    return _submit(() {
      return _authRepository.register(
        email: email,
        username: username,
        password: password,
        nickname: nickname,
      );
    });
  }

  Future<void> logout() async {
    // Invalidate old responses immediately, but retain cookies until the
    // logout request has reached the server.
    final logoutGeneration = _advanceGeneration(clearCookies: false);
    _status = AppSessionStatus.submitting;
    _lastError = null;
    notifyListeners();

    try {
      await _authRepository.logout();
    } catch (_) {
      // Local state is still cleared if the server cannot be reached.
    }

    // Another login may have started while logout was in flight. The stale
    // logout completion must never clear that newer session.
    if (_sessionGeneration == logoutGeneration) {
      forceLogout();
    }
  }

  void absorbUser(SessionUser user) {
    _currentUser = user;
    _status = AppSessionStatus.authenticated;
    _lastError = null;
    notifyListeners();
  }

  void forceLogout({bool clearCookies = true}) {
    _advanceGeneration(clearCookies: clearCookies);
    _currentUser = null;
    _status = AppSessionStatus.unauthenticated;
    _lastError = null;
    notifyListeners();
  }

  Future<bool> refreshSessionSilently() {
    final generation = _sessionGeneration;
    final expectedUserId = _currentUser?.id;
    final current = _refreshOperation;
    if (current != null && current.generation == generation) {
      return current.future;
    }

    final future = _runRefresh(generation, expectedUserId);
    final operation = _SessionRefreshOperation(
      generation: generation,
      future: future,
    );
    _refreshOperation = operation;

    return future.whenComplete(() {
      if (identical(_refreshOperation, operation)) {
        _refreshOperation = null;
      }
    });
  }

  Future<bool> _runRefresh(int generation, String? expectedUserId) async {
    if (_sessionGeneration != generation) {
      return false;
    }

    try {
      final user = await _authRepository.refresh();
      if (_sessionGeneration != generation) {
        return false;
      }

      // A refresh must not silently bind the current generation to another
      // account. This can happen when a stale browser cookie wins a refresh
      // race; force a fresh login instead of accepting the returned identity.
      if (expectedUserId != null && user.id != expectedUserId) {
        _advanceGeneration(clearCookies: true);
        _currentUser = null;
        _status = AppSessionStatus.unauthenticated;
        _lastError = null;
        notifyListeners();
        return false;
      }

      _currentUser = user;
      _status = AppSessionStatus.authenticated;
      _lastError = null;
      notifyListeners();
      await _notifyAuthenticated(user);
      return _sessionGeneration == generation;
    } catch (_) {
      if (_sessionGeneration != generation) {
        return false;
      }

      _advanceGeneration(clearCookies: true);
      _currentUser = null;
      _status = AppSessionStatus.unauthenticated;
      _lastError = null;
      notifyListeners();
      return false;
    }
  }

  Future<bool> _submit(Future<SessionUser> Function() action) async {
    // Login/register always starts a fresh generation and clears credentials
    // left by a previous account before the request is sent.
    final submissionGeneration = _advanceGeneration(clearCookies: true);
    _currentUser = null;
    _status = AppSessionStatus.submitting;
    _lastError = null;
    notifyListeners();

    await _awaitInvalidation(submissionGeneration);
    if (_sessionGeneration != submissionGeneration) {
      return false;
    }

    try {
      final user = await action();
      if (_sessionGeneration != submissionGeneration) {
        return false;
      }

      // The authenticated session receives its own generation distinct from
      // the anonymous submission that created it.
      _sessionGeneration += 1;
      _currentUser = user;
      _status = AppSessionStatus.authenticated;
      notifyListeners();
      await _notifyAuthenticated(user);
      return true;
    } catch (error) {
      if (_sessionGeneration != submissionGeneration) {
        return false;
      }

      _advanceGeneration(clearCookies: true);
      _currentUser = null;
      _status = AppSessionStatus.unauthenticated;
      _lastError = AppException.describe(error);
      notifyListeners();
      return false;
    }
  }

  int _advanceGeneration({required bool clearCookies}) {
    _sessionGeneration += 1;
    Future<void> currentInvalidation;
    try {
      currentInvalidation = Future<void>.sync(
        () => _onSessionInvalidated?.call(clearCookies: clearCookies),
      );
    } catch (_) {
      currentInvalidation = Future<void>.value();
    }

    // Transport cancellation happens immediately in the callback, while the
    // returned future covers account-scoped cleanup such as local schedules.
    // New login work waits for this barrier so old account state cannot be
    // written after the new session starts.
    final previous = _invalidationBarrier;
    _invalidationBarrier = Future.wait<void>([
      previous.catchError((_) {}),
      currentInvalidation.catchError((_) {}),
    ]).then<void>((_) {});
    return _sessionGeneration;
  }

  Future<void> _awaitInvalidation(int generation) async {
    await _invalidationBarrier;
    if (_sessionGeneration != generation) {
      return;
    }
  }

  Future<void> _notifyAuthenticated(SessionUser user) async {
    try {
      await _onAuthenticated?.call(user);
    } catch (_) {
      // Device registration and other auxiliary actions do not own auth state.
    }
  }
}

class _SessionRefreshOperation {
  const _SessionRefreshOperation({
    required this.generation,
    required this.future,
  });

  final int generation;
  final Future<bool> future;
}
