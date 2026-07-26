import 'package:flutter/material.dart';

import '../../../core/errors/app_exception.dart';
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
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: sessionController.isBusy
                        ? null
                        : _openPasswordResetDialog,
                    child: const Text('使用重置令牌设置新密码'),
                  ),
                ),
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

  Future<void> _openPasswordResetDialog() async {
    final tokenController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    String? errorMessage;
    bool isSubmitting = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('设置新密码'),
              content: SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: tokenController,
                      decoration: const InputDecoration(labelText: '重置令牌'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: newPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '新密码'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: confirmPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '确认新密码'),
                    ),
                    if (errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        errorMessage!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed:
                      isSubmitting ? null : () => Navigator.of(context).pop(),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final token = tokenController.text.trim();
                          final newPassword = newPasswordController.text;
                          final confirmPassword =
                              confirmPasswordController.text;
                          if (token.isEmpty ||
                              newPassword.length < 8 ||
                              newPassword != confirmPassword) {
                            setDialogState(() {
                              errorMessage = '请检查令牌、新密码长度和确认密码是否一致';
                            });
                            return;
                          }

                          setDialogState(() {
                            isSubmitting = true;
                            errorMessage = null;
                          });

                          try {
                            await AppScope.of(context)
                                .services
                                .authRepository
                                .confirmPasswordReset(
                                  token: token,
                                  newPassword: newPassword,
                                  confirmPassword: confirmPassword,
                                );
                            if (!dialogContext.mounted) {
                              return;
                            }
                            Navigator.of(dialogContext).pop();
                            if (!mounted) {
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('新密码已设置，请登录')),
                            );
                          } catch (error) {
                            setDialogState(() {
                              errorMessage = AppException.describe(error);
                              isSubmitting = false;
                            });
                          }
                        },
                  child: Text(isSubmitting ? '提交中...' : '确认'),
                ),
              ],
            );
          },
        );
      },
    );

    tokenController.dispose();
    newPasswordController.dispose();
    confirmPasswordController.dispose();
  }
}
