import 'dart:async';

import 'package:flutter/material.dart';

import 'features/app/application/app_controller.dart';
import 'features/app/application/app_scope.dart';
import 'features/app/application/app_session_controller.dart';
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
  late AppSessionController _listenedSessionController;
  Timer? _reminderPoller;

  @override
  void initState() {
    super.initState();
    _routerDelegate = AppRouterDelegate(widget.controller.services);
    _listenedSessionController = widget.controller.services.sessionController;
    widget.controller.addListener(_handleControllerChanged);
    _listenedSessionController.addListener(_handleSessionChanged);
    _reminderPoller = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _pollReminderEvents(),
    );
  }

  @override
  void didUpdateWidget(covariant App oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_handleControllerChanged);
      _listenedSessionController.removeListener(_handleSessionChanged);
      widget.controller.addListener(_handleControllerChanged);
      _listenedSessionController = widget.controller.services.sessionController;
      _listenedSessionController.addListener(_handleSessionChanged);
      _recreateRouterDelegate();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleControllerChanged);
    _listenedSessionController.removeListener(_handleSessionChanged);
    _reminderPoller?.cancel();
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
        theme: _buildTheme(Brightness.light),
        darkTheme: _buildTheme(Brightness.dark),
        themeMode: widget.controller.themeMode,
      ),
    );
  }

  void _handleControllerChanged() {
    if (!mounted) {
      return;
    }

    final nextSessionController = widget.controller.services.sessionController;
    if (identical(_listenedSessionController, nextSessionController)) {
      setState(() {});
      return;
    }

    _listenedSessionController.removeListener(_handleSessionChanged);
    _listenedSessionController = nextSessionController;
    _listenedSessionController.addListener(_handleSessionChanged);
    _recreateRouterDelegate();
  }

  void _handleSessionChanged() {
    if (widget.controller.services.sessionController.isAuthenticated) {
      _pollReminderEvents();
    }
  }

  void _recreateRouterDelegate() {
    _routerDelegate.dispose();
    _routerDelegate = AppRouterDelegate(widget.controller.services);
    setState(() {});
  }

  Future<void> _pollReminderEvents() async {
    final services = widget.controller.services;
    if (!services.sessionController.isAuthenticated || !mounted) {
      return;
    }

    try {
      final events = await services.remindersRepository.getPendingLocalEvents();
      for (final event in events) {
        if (!mounted) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('提醒触发：${event.todoId}')),
        );
        await services.remindersRepository.ackReminderEvent(event.id);
      }
    } catch (_) {
      // 提醒轮询失败不打断主流程。
    }
  }

  ThemeData _buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: Colors.black,
      brightness: brightness,
      dynamicSchemeVariant: DynamicSchemeVariant.monochrome,
    ).copyWith(
      primary: isDark ? const Color(0xFFF5F5F5) : const Color(0xFF111111),
      onPrimary: isDark ? const Color(0xFF111111) : Colors.white,
      secondary: isDark ? const Color(0xFFC7C7C7) : const Color(0xFF555555),
      onSecondary: isDark ? const Color(0xFF111111) : Colors.white,
      surface: isDark ? Colors.black : Colors.white,
      onSurface: isDark ? const Color(0xFFF5F5F5) : const Color(0xFF171717),
    );
    final fieldColor =
        isDark ? const Color(0xFF161616) : const Color(0xFFF5F5F5);
    final cardColor =
        isDark ? const Color(0xFF101010) : const Color(0xFFFFFFFF);
    final borderColor =
        isDark ? const Color(0xFF303030) : const Color(0xFFE5E5E5);

    return ThemeData(
      colorScheme: scheme,
      brightness: brightness,
      scaffoldBackgroundColor: scheme.surface,
      useMaterial3: true,
      textTheme: TextTheme(
        headlineLarge: TextStyle(
          fontSize: 40,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
          height: 1.1,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          height: 1.6,
          color: scheme.onSurface,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.5,
          color: scheme.onSurface,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: fieldColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        color: cardColor,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: borderColor),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor:
            isDark ? const Color(0xFFF5F5F5) : const Color(0xFF171717),
        contentTextStyle: TextStyle(
          color: isDark ? const Color(0xFF171717) : Colors.white,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
    );
  }
}
