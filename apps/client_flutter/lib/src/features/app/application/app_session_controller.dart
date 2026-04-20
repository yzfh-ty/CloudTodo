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

class AppSessionController extends ChangeNotifier {
  AppSessionController({required AuthRepository authRepository})
      : _authRepository = authRepository;

  final AuthRepository _authRepository;

  AppSessionStatus _status = AppSessionStatus.initializing;
  SessionUser? _currentUser;
  String? _lastError;
  Future<bool>? _refreshFuture;

  AppSessionStatus get status => _status;
  SessionUser? get currentUser => _currentUser;
  String? get lastError => _lastError;

  bool get isAuthenticated => _status == AppSessionStatus.authenticated;
  bool get isBusy =>
      _status == AppSessionStatus.initializing ||
      _status == AppSessionStatus.submitting;

  Future<void> restoreSession() async {
    _status = AppSessionStatus.initializing;
    _lastError = null;
    notifyListeners();
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
    required String timezone,
  }) {
    return _submit(() {
      return _authRepository.register(
        email: email,
        username: username,
        password: password,
        nickname: nickname,
        timezone: timezone,
      );
    });
  }

  Future<void> logout() async {
    _status = AppSessionStatus.submitting;
    notifyListeners();

    try {
      await _authRepository.logout();
    } catch (_) {
      // 登出失败时本地仍强制清状态，避免页面被锁死。
    }

    forceLogout();
  }

  void absorbUser(SessionUser user) {
    _currentUser = user;
    _status = AppSessionStatus.authenticated;
    _lastError = null;
    notifyListeners();
  }

  void forceLogout() {
    _currentUser = null;
    _status = AppSessionStatus.unauthenticated;
    _lastError = null;
    notifyListeners();
  }

  Future<bool> refreshSessionSilently() async {
    if (_refreshFuture != null) {
      return _refreshFuture!;
    }

    final future = _runRefresh();
    _refreshFuture = future;

    try {
      return await future;
    } finally {
      _refreshFuture = null;
    }
  }

  Future<bool> _runRefresh() async {
    try {
      final user = await _authRepository.refresh();
      _currentUser = user;
      _status = AppSessionStatus.authenticated;
      _lastError = null;
      notifyListeners();
      return true;
    } catch (_) {
      _currentUser = null;
      _status = AppSessionStatus.unauthenticated;
      notifyListeners();
      return false;
    }
  }

  Future<bool> _submit(Future<SessionUser> Function() action) async {
    _status = AppSessionStatus.submitting;
    _lastError = null;
    notifyListeners();

    try {
      _currentUser = await action();
      _status = AppSessionStatus.authenticated;
      notifyListeners();
      return true;
    } catch (error) {
      _currentUser = null;
      _status = AppSessionStatus.unauthenticated;
      _lastError = AppException.describe(error);
      notifyListeners();
      return false;
    }
  }
}
