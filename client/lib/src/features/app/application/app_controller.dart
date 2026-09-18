import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/config/app_config.dart';
import '../../../core/notifications/local_notification_service.dart';
import 'app_services.dart';

class AppController extends ChangeNotifier {
  AppController({required AppConfig initialConfig})
      : _config = initialConfig,
        _localNotificationService = LocalNotificationService() {
    _services = AppServices.create(
      initialConfig,
      localNotificationService: _localNotificationService,
    );
  }

  AppConfig _config;
  late AppServices _services;
  final LocalNotificationService _localNotificationService;
  ThemeMode _themeMode = ThemeMode.system;

  static const _themeModePreferenceKey = 'theme_mode';

  AppConfig get config => _config;
  AppServices get services => _services;
  LocalNotificationService get localNotificationService =>
      _localNotificationService;
  String get currentApiBaseUrl => _config.apiBaseUrl;
  ThemeMode get themeMode => _themeMode;

  Future<void> restoreThemeMode() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      _themeMode = switch (preferences.getString(_themeModePreferenceKey)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } catch (_) {
      _themeMode = ThemeMode.system;
    }
  }

  void setThemeMode(ThemeMode value) {
    if (_themeMode == value) {
      return;
    }

    _themeMode = value;
    notifyListeners();
    unawaited(_saveThemeMode());
  }

  void toggleTheme(Brightness currentBrightness) {
    setThemeMode(
      currentBrightness == Brightness.dark ? ThemeMode.light : ThemeMode.dark,
    );
  }

  Future<void> restoreSession() {
    return _services.sessionController.restoreSession();
  }

  Future<AppServices> updateApiBaseUrl(String rawInput) async {
    final normalized = normalizeApiBaseUrl(rawInput);
    if (normalized == _config.apiBaseUrl) {
      return _services;
    }

    final nextConfig = _config.copyWith(apiBaseUrl: normalized);
    final nextServices = AppServices.create(
      nextConfig,
      localNotificationService: _localNotificationService,
    );
    final oldServices = _services;
    oldServices.sessionController.forceLogout();
    oldServices.dispose();

    _config = nextConfig;
    _services = nextServices;
    nextServices.sessionController.forceLogout();
    notifyListeners();
    return _services;
  }

  String normalizeApiBaseUrl(String rawInput) {
    final input = rawInput.trim();
    if (input.isEmpty) {
      throw const FormatException('请输入后端地址');
    }

    final uri = Uri.tryParse(input);
    if (uri != null &&
        !uri.hasScheme &&
        !uri.hasAuthority &&
        uri.path.startsWith('/') &&
        uri.query.isEmpty &&
        uri.fragment.isEmpty) {
      final normalizedPath = uri.path.endsWith('/api') || uri.path == '/api'
          ? uri.path
          : '${uri.path.endsWith('/') ? uri.path.substring(0, uri.path.length - 1) : uri.path}/api';
      final candidate = _config.copyWith(apiBaseUrl: normalizedPath);
      candidate.validateApiBaseUrl();
      return normalizedPath;
    }

    if (uri == null ||
        !uri.hasScheme ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty ||
        uri.fragment.isNotEmpty) {
      throw const FormatException('请输入合法的 http/https 后端地址');
    }

    if (uri.scheme != 'http' && uri.scheme != 'https') {
      throw const FormatException('后端地址必须使用 http 或 https');
    }

    final normalizedPath = uri.path.endsWith('/api') || uri.path == '/api'
        ? uri.path
        : '${uri.path.endsWith('/') ? uri.path.substring(0, uri.path.length - 1) : uri.path}/api';

    final normalized = uri
        .replace(
          path: normalizedPath,
          query: null,
          fragment: null,
        )
        .toString();
    final candidate = _config.copyWith(apiBaseUrl: normalized);
    candidate.validateApiBaseUrl();
    return normalized;
  }

  String? validateApiBaseUrl(String rawInput) {
    try {
      normalizeApiBaseUrl(rawInput);
      return null;
    } on FormatException catch (error) {
      return error.message;
    }
  }

  @override
  void dispose() {
    _services.dispose();
    _localNotificationService.dispose();
    super.dispose();
  }

  Future<void> _saveThemeMode() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_themeModePreferenceKey, _themeMode.name);
    } catch (_) {
      // Theme switching remains available when persistence is unavailable.
    }
  }
}
