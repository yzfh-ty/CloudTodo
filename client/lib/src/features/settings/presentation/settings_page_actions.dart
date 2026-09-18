part of 'settings_page.dart';

extension _SettingsPageActions on _SettingsPageState {
  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final updated = await _profileController.save(
      nickname: _nicknameController.text,
      email: _emailController.text,
      timezone: _timezoneController.text,
    );
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            updated ? '资料已更新' : (_profileController.errorMessage ?? '资料更新失败')),
      ),
    );
  }

  Future<void> _setLocalNotificationsEnabled(bool enabled) async {
    _updateState(() => _isUpdatingLocalNotifications = true);
    final service = AppScope.of(context).services.localNotificationService;
    var nextValue = enabled;
    if (enabled && service.supportsPermissionRequest) {
      nextValue = await service.requestPermission();
    }
    await service.setLocalNotificationsEnabled(nextValue);
    if (!mounted) {
      return;
    }
    _updateState(() => _isUpdatingLocalNotifications = false);
    if (enabled && !nextValue) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Android 通知未允许')),
      );
    }
  }

  Future<void> _setShowTaskTitle(bool enabled) async {
    _updateState(() => _isUpdatingNotificationPrivacy = true);
    try {
      await AppScope.of(context)
          .services
          .localNotificationService
          .setShowTaskTitle(enabled);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppException.describe(error))),
        );
      }
    } finally {
      if (mounted) {
        _updateState(() => _isUpdatingNotificationPrivacy = false);
      }
    }
  }

  Future<void> _changePassword() async {
    final currentPassword = _currentPasswordController.text;
    final newPassword = _newPasswordController.text;
    final confirmPassword = _confirmPasswordController.text;
    if (currentPassword.isEmpty ||
        newPassword.length < 8 ||
        newPassword != confirmPassword) {
      _updateState(() {
        _passwordError = '请检查当前密码、新密码长度和确认密码是否一致';
      });
      return;
    }
    _updateState(() {
      _isChangingPassword = true;
      _passwordError = null;
    });
    try {
      await AppScope.of(context).services.authRepository.changePassword(
            currentPassword: currentPassword,
            newPassword: newPassword,
            confirmPassword: confirmPassword,
          );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('密码已修改，请重新登录')),
      );
      await widget.onLogout();
    } catch (error) {
      if (!mounted) {
        return;
      }
      _updateState(() {
        _passwordError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        _updateState(() {
          _isChangingPassword = false;
        });
      }
    }
  }

  Future<void> _loadDevices() async {
    if (!mounted) {
      return;
    }
    _updateState(() {
      _isLoadingDevices = true;
      _deviceError = null;
    });
    try {
      final devices =
          await AppScope.of(context).services.deviceRepository.getDevices();
      if (!mounted) {
        return;
      }
      _updateState(() {
        _devices = devices;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      _updateState(() {
        _deviceError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        _updateState(() {
          _isLoadingDevices = false;
        });
      }
    }
  }

  Future<void> _deleteDevice(DeviceItem device) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('删除设备'),
              content: Text('确认删除设备“${device.deviceName}”？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error,
                    foregroundColor: Theme.of(context).colorScheme.onError,
                  ),
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('删除'),
                ),
              ],
            );
          },
        ) ??
        false;
    if (!mounted || !confirmed) {
      return;
    }
    _updateState(() {
      _isDeletingDevice = true;
      _deviceError = null;
    });
    try {
      await AppScope.of(context)
          .services
          .deviceRepository
          .deleteDevice(device.id);
      await _loadDevices();
    } catch (error) {
      if (!mounted) {
        return;
      }
      _updateState(() {
        _deviceError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        _updateState(() {
          _isDeletingDevice = false;
        });
      }
    }
  }

  Future<void> _syncBootstrap() {
    return _runSync(
        () => AppScope.of(context).services.syncRepository.bootstrap());
  }

  Future<void> _syncChanges() {
    final cursor = _syncCursor;
    if (cursor == null) {
      return Future.value();
    }
    return _runSync(() =>
        AppScope.of(context).services.syncRepository.changes(cursor: cursor));
  }

  Future<void> _runSync(Future<SyncSnapshot> Function() action) async {
    _updateState(() {
      _isSyncing = true;
      _syncError = null;
    });
    try {
      final snapshot = await action();
      if (!mounted) {
        return;
      }
      _updateState(() {
        _syncCursor = snapshot.cursor;
        _syncSummary = _buildSyncSummary(snapshot.raw);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      _updateState(() {
        _syncError = AppException.describe(error);
      });
    } finally {
      if (mounted) {
        _updateState(() {
          _isSyncing = false;
        });
      }
    }
  }

  String _buildSyncSummary(Map<String, dynamic> raw) {
    final names = {
      'todo_lists': '清单',
      'tags': '标签',
      'todo_tags': '任务标签关系',
      'todos': '任务',
      'reminders': '提醒',
      'reminder_events': '提醒事件',
      'notification_endpoints': '通知方式',
      'notification_deliveries': '通知投递',
      'devices': '设备',
    };

    return names.entries.map((entry) {
      final value = raw[entry.key];
      final count = value is List ? value.length : 0;
      return '${entry.value}: $count';
    }).join('  ');
  }

  Future<void> _applyBackendUrl(AppScope appScope) async {
    final validation =
        appScope.controller.validateApiBaseUrl(_backendUrlController.text);
    if (validation != null) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validation)),
      );
      return;
    }

    final nextUrl =
        appScope.controller.normalizeApiBaseUrl(_backendUrlController.text);
    if (nextUrl == appScope.controller.currentApiBaseUrl) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('当前已经在使用这个后端地址')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('切换后端地址'),
              content: Text(
                '将后端地址切换为：\n${_backendUrlController.text.trim()}\n\n切换后会退出当前登录，并重新回到登录页。是否继续？',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('继续'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!mounted || !confirmed) {
      return;
    }

    await appScope.controller.updateApiBaseUrl(nextUrl);
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('后端地址已更新，请重新登录')),
    );
  }

  void _bindProfile(ProfileUser profile) {
    _nicknameController.text = profile.nickname;
    _emailController.text = profile.email;
    _timezoneController.text = profile.timezone;
  }
}
