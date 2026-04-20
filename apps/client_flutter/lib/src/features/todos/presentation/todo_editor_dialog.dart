import 'package:flutter/material.dart';

import '../../../core/utils/date_time_formatter.dart';
import '../../../core/utils/display_texts.dart';
import '../domain/todo_form_data.dart';

class TodoEditorDialog extends StatefulWidget {
  const TodoEditorDialog({
    super.key,
    required this.initialValue,
    required this.title,
    required this.submitLabel,
  });

  final TodoFormData initialValue;
  final String title;
  final String submitLabel;

  @override
  State<TodoEditorDialog> createState() => _TodoEditorDialogState();
}

class _TodoEditorDialogState extends State<TodoEditorDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late String _priority;
  late bool _isAllDay;
  DateTime? _dueAt;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialValue.title);
    _descriptionController = TextEditingController(text: widget.initialValue.description);
    _priority = widget.initialValue.priority;
    _isAllDay = widget.initialValue.isAllDay;
    _dueAt = widget.initialValue.dueAt;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: theme.textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                  '三端共用同一份任务表单数据结构，Web、Android、Windows 后续都从这里继续扩表单规则。',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _titleController,
                    decoration: const InputDecoration(labelText: '标题'),
                    maxLength: 200,
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return '请输入标题';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _descriptionController,
                    decoration: const InputDecoration(labelText: '描述'),
                    minLines: 3,
                    maxLines: 5,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _priority,
                    decoration: const InputDecoration(labelText: '优先级'),
                  items: [
                    DropdownMenuItem(value: 'low', child: Text(todoPriorityText('low'))),
                    DropdownMenuItem(value: 'medium', child: Text(todoPriorityText('medium'))),
                    DropdownMenuItem(value: 'high', child: Text(todoPriorityText('high'))),
                  ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _priority = value;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile.adaptive(
                    value: _isAllDay,
                    contentPadding: EdgeInsets.zero,
                    title: const Text('全天事项'),
                    subtitle: const Text('开启后只选日期，不再追加具体时间'),
                    onChanged: (value) {
                      setState(() {
                        _isAllDay = value;
                        if (_dueAt != null && value) {
                          _dueAt = DateTime(_dueAt!.year, _dueAt!.month, _dueAt!.day);
                        }
                      });
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
                        Text(
                          '截止时间：${formatDateTime(_dueAt)}',
                          style: theme.textTheme.bodyLarge,
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            FilledButton.tonal(
                              onPressed: _pickDueAt,
                              child: Text(_dueAt == null ? '选择时间' : '修改时间'),
                            ),
                            TextButton(
                              onPressed: _dueAt == null
                                  ? null
                                  : () {
                                      setState(() {
                                        _dueAt = null;
                                      });
                                    },
                              child: const Text('清空'),
                            ),
                          ],
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

  Future<void> _pickDueAt() async {
    final now = DateTime.now();
    final initialDate = _dueAt ?? now;
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 10),
    );

    if (!mounted || pickedDate == null) {
      return;
    }

    if (_isAllDay) {
      setState(() {
        _dueAt = DateTime(pickedDate.year, pickedDate.month, pickedDate.day);
      });
      return;
    }

    final initialTime = TimeOfDay.fromDateTime(_dueAt ?? now);
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: initialTime,
    );

    if (!mounted) {
      return;
    }

    if (pickedTime == null) {
      setState(() {
        _dueAt = DateTime(
          pickedDate.year,
          pickedDate.month,
          pickedDate.day,
          initialTime.hour,
          initialTime.minute,
        );
      });
      return;
    }

    setState(() {
      _dueAt = DateTime(
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
      TodoFormData(
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim(),
        priority: _priority,
        dueAt: _dueAt,
        isAllDay: _isAllDay,
      ),
    );
  }
}
