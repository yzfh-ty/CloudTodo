import 'package:flutter/material.dart';

import 'features/app/application/app_controller.dart';
import 'features/app/application/app_scope.dart';
import 'routing/app_router.dart';

class App extends StatefulWidget {
  const App({super.key, required this.controller});

  final AppController controller;

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  late AppRouterDelegate _routerDelegate;
  final AppRouteInformationParser _routeInformationParser =
      const AppRouteInformationParser();

  @override
  void initState() {
    super.initState();
    _routerDelegate = AppRouterDelegate(widget.controller.services);
    widget.controller.addListener(_handleControllerChanged);
  }

  @override
  void didUpdateWidget(covariant App oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_handleControllerChanged);
      widget.controller.addListener(_handleControllerChanged);
      _recreateRouterDelegate();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleControllerChanged);
    _routerDelegate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final services = widget.controller.services;

    return AppScope(
      controller: widget.controller,
      services: services,
      child: MaterialApp.router(
        title: services.config.appName,
        debugShowCheckedModeBanner: false,
        routerDelegate: _routerDelegate,
        routeInformationParser: _routeInformationParser,
        theme: _buildTheme(),
      ),
    );
  }

  void _handleControllerChanged() {
    if (!mounted) {
      return;
    }

    _recreateRouterDelegate();
  }

  void _recreateRouterDelegate() {
    _routerDelegate.dispose();
    _routerDelegate = AppRouterDelegate(widget.controller.services);
    setState(() {});
  }

  ThemeData _buildTheme() {
    const cream = Color(0xFFF5EFE2);
    const paper = Color(0xFFFFFCF5);
    const ink = Color(0xFF2D211D);
    const rust = Color(0xFFA2471E);
    const teal = Color(0xFF1D5C63);

    final scheme = ColorScheme.fromSeed(
      seedColor: rust,
      brightness: Brightness.light,
      primary: rust,
      secondary: teal,
      surface: paper,
    );

    return ThemeData(
      colorScheme: scheme,
      scaffoldBackgroundColor: cream,
      useMaterial3: true,
      fontFamily: 'Georgia',
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 40,
          fontWeight: FontWeight.w700,
          color: ink,
          height: 1.1,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          height: 1.6,
          color: ink,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.5,
          color: ink,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.9),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: rust, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white.withValues(alpha: 0.9),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(
            color: Colors.black.withValues(alpha: 0.06),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ink,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
    );
  }
}
