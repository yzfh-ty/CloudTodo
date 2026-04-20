import 'package:flutter/material.dart';

import 'app.dart';
import 'core/config/config_loader.dart';
import 'features/app/application/app_controller.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    final config = await loadAppConfig();
    final controller = AppController(initialConfig: config);
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
      home: Scaffold(
        backgroundColor: const Color(0xFFF5EFE2),
        body: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 640),
            padding: const EdgeInsets.all(24),
            margin: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 24,
                  offset: Offset(0, 16),
                ),
              ],
            ),
            child: Text(
              'CloudTodo Web 启动失败。\n$error',
              style: const TextStyle(
                fontSize: 16,
                height: 1.6,
                color: Color(0xFF2F241F),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
