import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../domain/reminder_form_data.dart';

class ReminderEditorDialog extends StatefulWidget {
  const ReminderEditorDialog({
    super.key,
    required this.initialValue,
    required this.title,
    required this.submitLabel,
  });

  final ReminderFormData initialValue;
  final String title;
  final String submitLabel;

  @override
  State<ReminderEditorDialog> createState() => _ReminderEditorDialogState();
}

class _ReminderEditorDialogState extends State<ReminderEditorDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _timezoneController;
  late String _channel;
  late String _repeatType;
  late DateTime _remindAt;

  @override
  void initState() {
    super.initState();
    _channel = widget.initialValue.channel;
    _repeatType = widget.initialValue.repeatType;
    _remindAt = widget.initialValue.remindAt;
    _timezoneController = TextEditingController(text: widget.initialValue.timezone);
  }

  @override
  void dispose() {
    _timezoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '提醒配置仍走统一业务模型，后续 Android 和 Windows 的本地提醒能力都可以继续挂在这层领域对象上。',
                  ),
                  const SizedBox(height: 20),
                  DropdownButtonFormField<String>(
                    value: _channel,
                    decoration: const InputDecoration(labelText: '提醒通道'),
                  items: [
                    DropdownMenuItem(value: 'webhook', child: Text(reminderChannelText('webhook'))),
                    DropdownMenuItem(
                      value: 'android_local',
                      child: Text(reminderChannelText('android_local')),
                    ),
                    DropdownMenuItem(
                      value: 'windows_local',
                      child: Text(reminderChannelText('windows_local')),
                    ),
                  ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }
                      setState(() {
                        _channel = value;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _repeatType,
                    decoration: const InputDecoration(labelText: '重复规则'),
                  items: [
                    DropdownMenuItem(value: 'none', child: Text(reminderRepeatTypeText('none'))),
                    DropdownMenuItem(value: 'daily', child: Text(reminderRepeatTypeText('daily'))),
                    DropdownMenuItem(value: 'weekly', child: Text(reminderRepeatTypeText('weekly'))),
                    DropdownMenuItem(
                      value: 'workday',
                      child: Text(reminderRepeatTypeText('workday')),
                    ),
                    DropdownMenuItem(value: 'custom', child: Text(reminderRepeatTypeText('custom'))),
                  ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }
                      setState(() {
                        _repeatType = value;
                      });
                    },
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
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF6F0E6),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('提醒时间：${formatDateTime(_remindAt)}'),
                        const SizedBox(height: 12),
                        FilledButton.tonal(
                          onPressed: _pickDateTime,
                          child: const Text('选择时间'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('取消'),
                      ),
                      const SizedBox(width: 12),
                      FilledButton(
                        onPressed: _submit,
                        child: Text(widget.submitLabel),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDateTime() async {
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _remindAt,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );

    if (!mounted || pickedDate == null) {
      return;
    }

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_remindAt),
    );

    if (!mounted || pickedTime == null) {
      return;
    }

    setState(() {
      _remindAt = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    Navigator.of(context).pop(
      ReminderFormData(
        channel: _channel,
        repeatType: _repeatType,
        remindAt: _remindAt,
        timezone: _timezoneController.text.trim().isEmpty
            ? 'Asia/Shanghai'
            : _timezoneController.text.trim(),
      ),
    );
  }
}
