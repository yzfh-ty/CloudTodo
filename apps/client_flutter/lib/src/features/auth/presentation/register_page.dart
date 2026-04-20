import 'package:flutter/material.dart';

import '../../app/application/app_scope.dart';
import '../../app/presentation/app_shell.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({
    super.key,
    required this.onGoLogin,
  });

  final VoidCallback onGoLogin;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _backendUrlController = TextEditingController();
  final _emailController = TextEditingController();
  final _usernameController = TextEditingController();
  final _nicknameController = TextEditingController();
  final _timezoneController = TextEditingController(text: 'Asia/Shanghai');
  final _passwordController = TextEditingController();
  bool _backendInitialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_backendInitialized) {
      return;
    }

    _backendUrlController.text = AppScope.of(context).controller.currentApiBaseUrl;
    _backendInitialized = true;
  }

  @override
  void dispose() {
    _backendUrlController.dispose();
    _emailController.dispose();
    _usernameController.dispose();
    _nicknameController.dispose();
    _timezoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appScope = AppScope.of(context);
    final sessionController = appScope.services.sessionController;
    final appController = appScope.controller;

    return AnimatedBuilder(
      animation: sessionController,
      builder: (context, _) {
        return AuthPageFrame(
          title: '先把账户打通',
          subtitle: '服务端已经具备注册、登录、刷新、登出能力，客户端现在直接复用这套用户接口与 Cookie 会话。',
          footer: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('已经有账号？'),
              TextButton(
                onPressed: sessionController.isBusy ? null : widget.onGoLogin,
                child: const Text('去登录'),
              ),
            ],
          ),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '注册',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _backendUrlController,
                  decoration: const InputDecoration(
                    labelText: '后端地址',
                    helperText: '输入 http://localhost:3000 或完整的 /api 地址',
                  ),
                  validator: (value) => appController.validateApiBaseUrl(value ?? ''),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(labelText: '邮箱'),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty || !value.contains('@')) {
                      return '请输入合法邮箱';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _usernameController,
                  decoration: const InputDecoration(labelText: '用户名'),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '请输入用户名';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _nicknameController,
                  decoration: const InputDecoration(labelText: '昵称'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _timezoneController,
                  decoration: const InputDecoration(labelText: '时区'),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '请输入时区';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: '密码'),
                  validator: (value) {
                    if (value == null || value.length < 8) {
                      return '密码至少 8 位';
                    }
                    return null;
                  },
                ),
                if (sessionController.lastError != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    sessionController.lastError!,
                    style: const TextStyle(color: Color(0xFFA12E2E)),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: sessionController.isBusy ? null : _submit,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: Text(sessionController.isBusy ? '注册中...' : '创建账户'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final appScope = AppScope.of(context);
    final services = await appScope.controller.updateApiBaseUrl(_backendUrlController.text);
    final sessionController = services.sessionController;
    await sessionController.register(
      email: _emailController.text,
      username: _usernameController.text,
      password: _passwordController.text,
      nickname: _nicknameController.text,
      timezone: _timezoneController.text,
    );
  }
}
