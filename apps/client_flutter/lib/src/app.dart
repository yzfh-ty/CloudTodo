import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/utils/app_timezone.dart';
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
    _applySessionTimezone();
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
      _applySessionTimezone();
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
        locale: const Locale('zh', 'CN'),
        supportedLocales: const [
          Locale('zh', 'CN'),
          Locale('en'),
        ],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
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
      _applySessionTimezone();
      setState(() {});
      return;
    }

    _listenedSessionController.removeListener(_handleSessionChanged);
    _listenedSessionController = nextSessionController;
    _listenedSessionController.addListener(_handleSessionChanged);
    _applySessionTimezone();
    _recreateRouterDelegate();
  }

  void _handleSessionChanged() {
    _applySessionTimezone();
    if (mounted) {
      setState(() {});
    }
    if (widget.controller.services.sessionController.isAuthenticated) {
      _pollReminderEvents();
    }
  }

  void _applySessionTimezone() {
    setAppTimezone(
      widget.controller.services.sessionController.currentUser?.timezone ??
          defaultAppTimezone,
    );
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
      await services.remindersRepository.getUpcomingReminders();
      final events = await services.remindersRepository.getPendingLocalEvents();
      for (final event in events) {
        if (!mounted) {
          return;
        }
        if (await services.localNotificationService.shouldShowEvent(event)) {
          await services.localNotificationService.showEvent(event);
        }
        await services.remindersRepository.ackReminderEvent(event.id);
      }
    } catch (_) {
      // 提醒轮询失败不打断主流程。
    }
  }

  ThemeData _buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF0F766E),
      brightness: brightness,
      dynamicSchemeVariant: DynamicSchemeVariant.tonalSpot,
    ).copyWith(
      primary: isDark ? const Color(0xFF5EEAD4) : const Color(0xFF0F766E),
      onPrimary: isDark ? const Color(0xFF042F2E) : Colors.white,
      secondary: isDark ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
      onSecondary: isDark ? const Color(0xFF422006) : Colors.white,
      surface: isDark ? const Color(0xFF101315) : const Color(0xFFF7F8FA),
      onSurface: isDark ? const Color(0xFFF3F4F6) : const Color(0xFF17202A),
    );
    final fieldColor =
        isDark ? const Color(0xFF1B2024) : const Color(0xFFF1F3F5);
    final cardColor =
        isDark ? const Color(0xFF161A1D) : const Color(0xFFFFFFFF);
    final borderColor =
        isDark ? const Color(0xFF30363B) : const Color(0xFFDDE2E6);

    return ThemeData(
      colorScheme: scheme,
      brightness: brightness,
      scaffoldBackgroundColor: scheme.surface,
      useMaterial3: true,
      fontFamily: 'DejaVuSans',
      fontFamilyFallback: const ['DroidSansFallback'],
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
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        color: cardColor,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: borderColor),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(44, 44),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size.square(44),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: borderColor,
        thickness: 1,
        space: 1,
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        useIndicator: true,
        indicatorColor: scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer),
        selectedLabelTextStyle: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w700,
          fontFamily: 'DejaVuSans',
          fontFamilyFallback: const ['DroidSansFallback'],
        ),
        unselectedLabelTextStyle: TextStyle(
          color: scheme.onSurfaceVariant,
          fontFamily: 'DejaVuSans',
          fontFamilyFallback: const ['DroidSansFallback'],
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
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }
}
