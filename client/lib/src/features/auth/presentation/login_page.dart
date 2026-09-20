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
  bool _obscurePassword = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_backendInitialized) {
      return;
    }

    _backendUrlController.text =
        AppScope.of(context).controller.currentApiBaseUrl;
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
          title: 'CloudTodo',
          subtitle: '继续处理你的任务与提醒。',
          footer: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text('还没有账号？'),
              TextButton(
                onPressed:
                    sessionController.isBusy ? null : widget.onGoRegister,
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
                const SizedBox(height: 16),
                TextFormField(
                  controller: _accountController,
                  autofocus: true,
                  autofillHints: const [
                    AutofillHints.username,
                    AutofillHints.email,
                  ],
                  textInputAction: TextInputAction.next,
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
                  obscureText: _obscurePassword,
                  autofillHints: const [AutofillHints.password],
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: '密码',
                    suffixIcon: IconButton(
                      tooltip: _obscurePassword ? '显示密码' : '隐藏密码',
                      onPressed: () => setState(
                        () => _obscurePassword = !_obscurePassword,
                      ),
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return '请输入密码';
                    }
                    return null;
                  },
                ),
                Material(
                  color: Theme.of(context).colorScheme.surfaceContainerLow,
                  clipBehavior: Clip.antiAlias,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
                  child: ExpansionTile(
                    initiallyExpanded: _showAdvanced,
                    onExpansionChanged: (value) {
                      setState(() => _showAdvanced = value);
                    },
                    tilePadding: const EdgeInsets.symmetric(horizontal: 12),
                    childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    title: const Text('连接设置'),
                    subtitle: Text(
                      _backendUrlController.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    children: [
                      TextFormField(
                        controller: _backendUrlController,
                        decoration: const InputDecoration(
                          labelText: '后端地址',
                          helperText:
                              '生产环境使用 HTTPS，例如 https://api.example.com/api',
                        ),
                        validator: (value) =>
                            appController.validateApiBaseUrl(value ?? ''),
                      ),
                    ],
                  ),
                ),
                if (sessionController.lastError != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    sessionController.lastError!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: sessionController.isBusy ? null : _submit,
                  child: Text(sessionController.isBusy ? '登录中...' : '登录'),
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
    final services =
        await appScope.controller.updateApiBaseUrl(_backendUrlController.text);
    final sessionController = services.sessionController;
    await sessionController.login(
      account: _accountController.text,
      password: _passwordController.text,
    );
  }
}
