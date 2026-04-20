import 'package:flutter/foundation.dart';

import '../../../core/config/app_config.dart';
import 'app_services.dart';

class AppController extends ChangeNotifier {
  AppController({required AppConfig initialConfig})
      : _config = initialConfig,
        _services = AppServices.create(initialConfig);

  AppConfig _config;
  AppServices _services;

  AppConfig get config => _config;
  AppServices get services => _services;
  String get currentApiBaseUrl => _config.apiBaseUrl;

  Future<void> restoreSession() {
    return _services.sessionController.restoreSession();
  }

  Future<AppServices> updateApiBaseUrl(String rawInput) async {
    final normalized = normalizeApiBaseUrl(rawInput);
    if (normalized == _config.apiBaseUrl) {
      return _services;
    }

    _config = _config.copyWith(apiBaseUrl: normalized);
    _services = AppServices.create(_config);
    _services.sessionController.forceLogout();
    notifyListeners();
    return _services;
  }

  String normalizeApiBaseUrl(String rawInput) {
    final input = rawInput.trim();
    if (input.isEmpty) {
      throw const FormatException('请输入后端地址');
    }

    final uri = Uri.tryParse(input);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw const FormatException('请输入合法的 http/https 后端地址');
    }

    if (uri.scheme != 'http' && uri.scheme != 'https') {
      throw const FormatException('后端地址必须使用 http 或 https');
    }

    final normalizedPath = uri.path.endsWith('/api') || uri.path == '/api'
        ? uri.path
        : '${uri.path.endsWith('/') ? uri.path.substring(0, uri.path.length - 1) : uri.path}/api';

    return uri.replace(
      path: normalizedPath,
      query: null,
      fragment: null,
    ).toString();
  }

  String? validateApiBaseUrl(String rawInput) {
    try {
      normalizeApiBaseUrl(rawInput);
      return null;
    } on FormatException catch (error) {
      return error.message;
    }
  }
}
