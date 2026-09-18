import 'package:flutter/foundation.dart';

class AppConfig {
  const AppConfig({
    required this.appName,
    required this.appEnv,
    required this.apiBaseUrl,
  });

  final String appName;
  final String appEnv;
  final String apiBaseUrl;

  factory AppConfig.defaults() {
    return AppConfig(
      appName: 'CloudTodo',
      appEnv: 'local',
      apiBaseUrl: _defaultApiBaseUrl(),
    );
  }

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      appName: json['appName'] as String? ?? 'CloudTodo',
      appEnv: json['appEnv'] as String? ?? 'local',
      apiBaseUrl: json['apiBaseUrl'] as String? ?? _defaultApiBaseUrl(),
    );
  }

  AppConfig copyWith({
    String? appName,
    String? appEnv,
    String? apiBaseUrl,
  }) {
    return AppConfig(
      appName: appName ?? this.appName,
      appEnv: appEnv ?? this.appEnv,
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
    );
  }

  AppConfig alignLoopbackHost(Uri appUri) {
    final apiUri = Uri.tryParse(apiBaseUrl);
    if (apiUri == null ||
        !_isLoopbackHost(appUri.host) ||
        !_isLoopbackHost(apiUri.host) ||
        apiUri.host == appUri.host) {
      return this;
    }

    return copyWith(apiBaseUrl: apiUri.replace(host: appUri.host).toString());
  }

  /// Returns a user-facing validation message for the configured API URL.
  ///
  /// Relative URLs are intentionally accepted only for Web, where they keep
  /// the browser on the page's origin (and therefore inherit its HTTPS
  /// policy). Native release builds must receive an explicit HTTPS endpoint.
  String? apiBaseUrlValidationError({
    bool? web,
    bool? release,
    Uri? pageUri,
  }) {
    final value = apiBaseUrl.trim();
    final isWeb = web ?? kIsWeb;
    final effectivePageUri = pageUri ?? (isWeb ? Uri.base : null);
    final requiresSecureTransport =
        (release ?? !kDebugMode) || appEnv.trim().toLowerCase() == 'production';

    if (value.isEmpty) {
      return '必须配置后端地址';
    }

    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.userInfo.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        uri.query.isNotEmpty) {
      return '请输入合法的 http/https 后端地址';
    }

    final isRelative =
        !uri.hasScheme && !uri.hasAuthority && uri.path.startsWith('/');
    if (isRelative) {
      if (!isWeb) {
        return '原生端必须使用完整的 HTTPS 后端地址';
      }
      if (requiresSecureTransport &&
          effectivePageUri != null &&
          effectivePageUri.scheme != 'https') {
        return 'Release Web 构建必须通过 HTTPS 页面访问';
      }
      return null;
    }

    if (!uri.hasScheme || uri.host.isEmpty) {
      return '请输入合法的 http/https 后端地址';
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      return '后端地址必须使用 http 或 https';
    }
    if (requiresSecureTransport && uri.scheme != 'https') {
      return '生产或 Release 构建必须使用 HTTPS 后端地址';
    }
    if (isWeb &&
        effectivePageUri != null &&
        effectivePageUri.scheme.isNotEmpty &&
        effectivePageUri.host.isNotEmpty &&
        requiresSecureTransport &&
        !_sameOrigin(uri, effectivePageUri)) {
      return 'Release Web 构建必须使用同源 /api 地址';
    }

    return null;
  }

  void validateApiBaseUrl({bool? web, bool? release, Uri? pageUri}) {
    final error = apiBaseUrlValidationError(
      web: web,
      release: release,
      pageUri: pageUri,
    );
    if (error != null) {
      throw FormatException(error);
    }
  }

  static String _defaultApiBaseUrl() {
    const configured = String.fromEnvironment('CLOUDTODO_API_BASE_URL');
    if (configured.trim().isNotEmpty) {
      return configured.trim();
    }

    if (kIsWeb) {
      return '/api';
    }

    if (!kDebugMode) {
      // An empty value is deliberate: validation must fail loudly instead of
      // silently sending a release build's credentials over local HTTP.
      return '';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:3000/api';
      case TargetPlatform.windows:
        return 'http://127.0.0.1:3000/api';
      default:
        return 'http://127.0.0.1:3000/api';
    }
  }

  static bool _isLoopbackHost(String host) {
    return host == 'localhost' || host == '127.0.0.1' || host == '::1';
  }

  static bool _sameOrigin(Uri left, Uri right) {
    final leftPort = left.hasPort ? left.port : _defaultPort(left.scheme);
    final rightPort = right.hasPort ? right.port : _defaultPort(right.scheme);
    return left.scheme == right.scheme &&
        left.host == right.host &&
        leftPort == rightPort;
  }

  static int? _defaultPort(String scheme) {
    return switch (scheme) {
      'http' => 80,
      'https' => 443,
      _ => null,
    };
  }
}
