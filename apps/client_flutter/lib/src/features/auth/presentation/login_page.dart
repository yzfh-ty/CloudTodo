import 'package:flutter/material.dart';

import '../../app/application/app_scope.dart';
import '../../app/presentation/app_shell.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.onGoRegister,
  });

  final VoidCallback onGoRegister;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _accountController = TextEditingController();
  final _passwordController = TextEditingController();
  final _backendUrlController = TextEditingController();
  bool _backendInitialized = false;
  bool _showAdvanced = false;

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
    _accountController.dispose();
    _passwordController.dispose();
    _backendUrlController.dispose();
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
          title: 'CloudTodo 客户端',
          subtitle: '当前先把登录、会话恢复、任务列表和用户自助资料页打通，后续继续扩展三端共用能力。',
          footer: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('还没有账号？'),
              TextButton(
                onPressed: sessionController.isBusy ? null : widget.onGoRegister,
                child: const Text('去注册'),
              ),
            ],
          ),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '登录',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF6F0E6),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '高级连接设置',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _showAdvanced = !_showAdvanced;
                              });
                            },
                            child: Text(_showAdvanced ? '收起' : '展开'),
                          ),
                        ],
                      ),
                      Text(
                        '当前后端：${_backendUrlController.text}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      if (_showAdvanced) ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _backendUrlController,
                          decoration: const InputDecoration(
                            labelText: '后端地址',
                            helperText: '输入 http://localhost:3000 或完整的 /api 地址',
                          ),
                          validator: (value) => appController.validateApiBaseUrl(value ?? ''),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _accountController,
                  decoration: const InputDecoration(
                    labelText: '邮箱或用户名',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '请输入邮箱或用户名';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '密码',
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return '请输入密码';
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
                    child: Text(sessionController.isBusy ? '登录中...' : '进入我的任务'),
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
    await sessionController.login(
      account: _accountController.text,
      password: _passwordController.text,
    );
  }
}
