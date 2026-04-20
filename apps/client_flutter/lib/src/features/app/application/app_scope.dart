import 'package:flutter/widgets.dart';

import 'app_controller.dart';
import 'app_services.dart';

class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.controller,
    required this.services,
    required super.child,
  });

  final AppController controller;
  final AppServices services;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is not available in the current context.');
    return scope!;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      oldWidget.services != services || oldWidget.controller != controller;
}
