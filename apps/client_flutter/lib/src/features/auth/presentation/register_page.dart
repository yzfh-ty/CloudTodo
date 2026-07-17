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
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _backendInitialized = false;
  bool _showAdvanced = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

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
    _backendUrlController.dispose();
    _emailController.dispose();
    _usernameController.dispose();
    _nicknameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
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
          subtitle: '创建账户，开始安排今天。',
          footer: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
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
                  controller: _emailController,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: '邮箱'),
                  validator: (value) {
                    if (value == null ||
                        value.trim().isEmpty ||
                        !value.contains('@')) {
                      return '请输入合法邮箱';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _usernameController,
                  autofillHints: const [AutofillHints.newUsername],
                  textInputAction: TextInputAction.next,
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
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: '昵称'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  autofillHints: const [AutofillHints.newPassword],
                  textInputAction: TextInputAction.next,
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
                    if (value == null || value.length < 8) {
                      return '密码至少 8 位';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _confirmPasswordController,
                  obscureText: _obscureConfirmPassword,
                  autofillHints: const [AutofillHints.newPassword],
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: '确认密码',
                    suffixIcon: IconButton(
                      tooltip: _obscureConfirmPassword ? '显示密码' : '隐藏密码',
                      onPressed: () => setState(
                        () =>
                            _obscureConfirmPassword = !_obscureConfirmPassword,
                      ),
                      icon: Icon(
                        _obscureConfirmPassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                  validator: (value) {
                    if (value != _passwordController.text) {
                      return '两次输入的密码不一致';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
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
                          helperText: '例如 http://localhost:3000/api',
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
                  child: Text(sessionController.isBusy ? '注册中...' : '创建账户'),
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
    await sessionController.register(
      email: _emailController.text,
      username: _usernameController.text,
      password: _passwordController.text,
      nickname: _nicknameController.text,
    );
  }
}
