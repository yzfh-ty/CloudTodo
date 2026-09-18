import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../../../core/utils/app_timezone.dart';
import '../../../core/widgets/form_dialog_frame.dart';
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
  late final TextEditingController _intervalController;
  late String _channel;
  late String _repeatType;
  late String _customUnit;
  late DateTime _remindAt;

  @override
  void initState() {
    super.initState();
    _channel = switch (widget.initialValue.channel) {
      'android_local' || 'windows_local' => _localChannel,
      _ => widget.initialValue.channel,
    };
    _repeatType = widget.initialValue.repeatType;
    _customUnit = _inferCustomUnit(widget.initialValue.repeatRule);
    _remindAt = dateTimeInAppTimezone(widget.initialValue.remindAt);
    _intervalController = TextEditingController(
      text: _initialIntervalText(widget.initialValue.repeatRule),
    );
  }

  @override
  void dispose() {
    _intervalController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FormDialogFrame(
      formKey: _formKey,
      title: widget.title,
      description: '选择提醒时间、发送方式和重复规则。',
      maxWidth: 560,
      body: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _channel,
            decoration: const InputDecoration(labelText: '提醒通道'),
            items: [
              DropdownMenuItem(
                  value: 'webhook',
                  child: Text(reminderChannelText('webhook'))),
              DropdownMenuItem(
                value: _localChannel,
                child: Text(reminderChannelText(_localChannel)),
              ),
              const DropdownMenuItem(
                value: 'both',
                child: Text('Webhook + 本地通知'),
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
            initialValue: _repeatType,
            decoration: const InputDecoration(labelText: '重复规则'),
            items: [
              DropdownMenuItem(
                  value: 'none', child: Text(reminderRepeatTypeText('none'))),
              DropdownMenuItem(
                  value: 'daily', child: Text(reminderRepeatTypeText('daily'))),
              DropdownMenuItem(
                  value: 'weekly',
                  child: Text(reminderRepeatTypeText('weekly'))),
              DropdownMenuItem(
                value: 'workday',
                child: Text(reminderRepeatTypeText('workday')),
              ),
              DropdownMenuItem(
                  value: 'custom',
                  child: Text(reminderRepeatTypeText('custom'))),
            ],
            onChanged: (value) {
              if (value == null) {
                return;
              }
              setState(() {
                _repeatType = value;
                if (_repeatType != 'custom') {
                  _intervalController.clear();
                } else if (_intervalController.text.trim().isEmpty) {
                  _intervalController.text = '1';
                }
              });
            },
          ),
          if (_repeatType == 'custom') ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _intervalController,
                    decoration: const InputDecoration(labelText: '自定义间隔'),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (_repeatType != 'custom') {
                        return null;
                      }
                      final parsed = int.tryParse(value?.trim() ?? '');
                      if (parsed == null || parsed <= 0) {
                        return '请输入大于 0 的整数';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 160,
                  child: DropdownButtonFormField<String>(
                    initialValue: _customUnit,
                    decoration: const InputDecoration(labelText: '单位'),
                    items: const [
                      DropdownMenuItem(value: 'minutes', child: Text('分钟')),
                      DropdownMenuItem(value: 'hours', child: Text('小时')),
                      DropdownMenuItem(value: 'days', child: Text('天')),
                      DropdownMenuItem(value: 'weeks', child: Text('周')),
                    ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }
                      setState(() {
                        _customUnit = value;
                      });
                    },
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
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
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(widget.submitLabel),
        ),
      ],
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
      _remindAt = appTimezoneWallClock(
        year: pickedDate.year,
        month: pickedDate.month,
        day: pickedDate.day,
        hour: pickedTime.hour,
        minute: pickedTime.minute,
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
        repeatRule: _buildRepeatRule(),
        remindAt: _remindAt.toUtc(),
      ),
    );
  }

  Map<String, dynamic>? _buildRepeatRule() {
    if (_repeatType != 'custom') {
      return null;
    }

    final interval = int.tryParse(_intervalController.text.trim());
    if (interval == null || interval <= 0) {
      return null;
    }

    return switch (_customUnit) {
      'hours' => {'interval_hours': interval},
      'days' => {'interval_days': interval},
      'weeks' => {'interval_weeks': interval},
      _ => {'interval_minutes': interval},
    };
  }

  String get _localChannel => defaultTargetPlatform == TargetPlatform.android
      ? 'android_local'
      : 'windows_local';

  String _inferCustomUnit(Map<String, dynamic>? rule) {
    if (rule == null) {
      return 'minutes';
    }

    if (rule['interval_hours'] != null) return 'hours';
    if (rule['interval_days'] != null) return 'days';
    if (rule['interval_weeks'] != null) return 'weeks';
    return 'minutes';
  }

  String _initialIntervalText(Map<String, dynamic>? rule) {
    if (rule == null) {
      return '1';
    }

    final value = rule['interval_minutes'] ??
        rule['interval_hours'] ??
        rule['interval_days'] ??
        rule['interval_weeks'];
    return value?.toString() ?? '1';
  }
}
