import 'package:flutter/material.dart';

import 'app.dart';
import 'core/config/config_loader.dart';
import 'features/app/application/app_controller.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    final config = await loadAppConfig();
    final controller = AppController(initialConfig: config);
    await controller.restoreThemeMode();
    controller.restoreSession();
    runApp(App(controller: controller));
  } catch (error) {
    runApp(_BootstrapFailureApp(error: error.toString()));
  }
}

class _BootstrapFailureApp extends StatelessWidget {
  const _BootstrapFailureApp({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.black,
          dynamicSchemeVariant: DynamicSchemeVariant.monochrome,
        ),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.black,
          brightness: Brightness.dark,
          dynamicSchemeVariant: DynamicSchemeVariant.monochrome,
        ),
      ),
      themeMode: ThemeMode.system,
      home: Scaffold(
        body: Center(
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 640),
              padding: const EdgeInsets.all(24),
              child: Text(
                'CloudTodo Web 启动失败。\n$error',
                style: const TextStyle(
                  fontSize: 16,
                  height: 1.6,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
