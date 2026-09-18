import 'package:flutter/material.dart';

import '../features/app/application/app_session_controller.dart';
import '../features/app/application/app_services.dart';
import '../features/app/presentation/app_shell.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/auth/presentation/register_page.dart';
import 'app_route_path.dart';

class AppRouteInformationParser extends RouteInformationParser<AppRoutePath> {
  const AppRouteInformationParser();

  @override
  Future<AppRoutePath> parseRouteInformation(
    RouteInformation routeInformation,
  ) async {
    final uri = routeInformation.uri;
    final segments = uri.pathSegments;

    if (segments.isEmpty) {
      return const AppRoutePath.app();
    }

    if (segments.first == 'login') {
      return const AppRoutePath.login();
    }

    if (segments.first == 'register') {
      return const AppRoutePath.register();
    }

    if (segments.first == 'app') {
      if (segments.length == 1) {
        return const AppRoutePath.app();
      }

      final sectionName = segments[1];
      if (sectionName == 'profile' || sectionName == 'endpoints') {
        return const AppRoutePath.app(AppSection.settings);
      }

      final section = AppSection.values.where((value) => value.name == sectionName).firstOrNull;
      return AppRoutePath.app(section ?? AppSection.todos);
    }

    return const AppRoutePath.app();
  }

  @override
  RouteInformation? restoreRouteInformation(AppRoutePath configuration) {
    return RouteInformation(uri: configuration.toUri());
  }
}

class AppRouterDelegate extends RouterDelegate<AppRoutePath>
    with ChangeNotifier, PopNavigatorRouterDelegateMixin<AppRoutePath> {
  AppRouterDelegate(this.services) {
    services.sessionController.addListener(_handleSessionChanged);
  }

  final AppServices services;
  @override
  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  AppRoutePath _path = const AppRoutePath.app();

  @override
  AppRoutePath get currentConfiguration {
    final session = services.sessionController;

    if (session.status == AppSessionStatus.initializing) {
      return _path;
    }

    if (!session.isAuthenticated && _path.requiresAuth) {
      return const AppRoutePath.login();
    }

    if (session.isAuthenticated &&
        (_path.location == AppLocation.login || _path.location == AppLocation.register)) {
      return const AppRoutePath.app();
    }

    return _path;
  }

  @override
  Widget build(BuildContext context) {
    final session = services.sessionController;

    if (session.status == AppSessionStatus.initializing) {
      return const SplashPage();
    }

    if (!session.isAuthenticated) {
      final authPage = _path.location == AppLocation.register
          ? RegisterPage(
              onGoLogin: () => _setPath(const AppRoutePath.login()),
            )
          : LoginPage(
              onGoRegister: () => _setPath(const AppRoutePath.register()),
            );

      return Navigator(
        key: navigatorKey,
        pages: [
          MaterialPage<void>(child: authPage),
        ],
        onDidRemovePage: (_) {},
      );
    }

    return Navigator(
      key: navigatorKey,
      pages: [
        MaterialPage<void>(
          child: AppShell(
            section: currentConfiguration.section,
            onNavigate: (section) => _setPath(AppRoutePath.app(section)),
            onLogout: () => services.sessionController.logout(),
          ),
        ),
      ],
      onDidRemovePage: (_) {},
    );
  }

  @override
  Future<void> setNewRoutePath(AppRoutePath configuration) async {
    _path = configuration;
  }

  @override
  void dispose() {
    services.sessionController.removeListener(_handleSessionChanged);
    super.dispose();
  }

  void _setPath(AppRoutePath nextPath) {
    _path = nextPath;
    notifyListeners();
  }

  void _handleSessionChanged() {
    notifyListeners();
  }
}
