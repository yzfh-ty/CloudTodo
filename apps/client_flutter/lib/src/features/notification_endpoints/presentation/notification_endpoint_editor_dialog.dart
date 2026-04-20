import 'package:flutter/material.dart';

import '../domain/notification_endpoint_form_data.dart';

class NotificationEndpointEditorDialog extends StatefulWidget {
  const NotificationEndpointEditorDialog({
    super.key,
    required this.initialValue,
    required this.title,
    required this.submitLabel,
    required this.isEditing,
  });

  final NotificationEndpointFormData initialValue;
  final String title;
  final String submitLabel;
  final bool isEditing;

  @override
  State<NotificationEndpointEditorDialog> createState() =>
      _NotificationEndpointEditorDialogState();
}

class _NotificationEndpointEditorDialogState
    extends State<NotificationEndpointEditorDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _targetUrlController;
  late final TextEditingController _secretController;
  late final TextEditingController _payloadTemplateController;
  late String _deliveryKind;
  late bool _isEnabled;
  late bool _clearSecret;

  @override
  void initState() {
    super.initState();
    _deliveryKind = widget.initialValue.deliveryKind;
    _nameController = TextEditingController(text: widget.initialValue.name);
    _targetUrlController = TextEditingController(text: widget.initialValue.targetUrl);
    _secretController = TextEditingController(text: widget.initialValue.secret);
    _payloadTemplateController = TextEditingController(
      text: widget.initialValue.payloadTemplate,
    );
    _isEnabled = widget.initialValue.isEnabled;
    _clearSecret = widget.initialValue.clearSecret;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _targetUrlController.dispose();
    _secretController.dispose();
    _payloadTemplateController.dispose();
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
                  Text(
                    widget.isEditing
                        ? '你可以更新通知方式名称、地址、启用状态，也可以轮换或清空密钥。'
                        : '先选择一种通知方式，再填写地址即可。企业微信机器人和标准 Webhook 都支持。',
                  ),
                  const SizedBox(height: 20),
                  DropdownButtonFormField<String>(
                    value: _deliveryKind,
                    decoration: const InputDecoration(labelText: '通知方式'),
                    items: const [
                      DropdownMenuItem(
                        value: 'wecom_robot',
                        child: Text('企业微信机器人'),
                      ),
                      DropdownMenuItem(
                        value: 'standard_webhook',
                        child: Text('标准 Webhook'),
                      ),
                    ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }

                      setState(() {
                        _deliveryKind = value;
                        if (_nameController.text.trim().isEmpty) {
                          _nameController.text =
                              value == 'wecom_robot' ? '企业微信机器人' : '标准 Webhook';
                        }
                        if (_payloadTemplateController.text.trim().isEmpty) {
                          _payloadTemplateController.text = value == 'wecom_robot'
                              ? '{\n  "msgtype": "text",\n  "text": {\n    "content": "CloudTodo 提醒通知\\n任务：{{todo_title}}\\n状态：{{todo_status}}\\n优先级：{{todo_priority}}\\n提醒时间：{{scheduled_for}}\\n触发时间：{{triggered_at}}\\n补充信息：{{payload_text}}"\n  }\n}'
                              : '{\n  "source": "cloudtodo",\n  "endpoint_id": "{{endpoint_id}}",\n  "endpoint_name": "{{endpoint_name}}",\n  "delivery_id": "{{delivery_id}}",\n  "reminder_event_id": "{{reminder_event_id}}",\n  "channel": "{{channel}}",\n  "scheduled_for": "{{scheduled_for}}",\n  "triggered_at": "{{triggered_at}}",\n  "user": {\n    "id": "{{user_id}}",\n    "timezone": "{{user_timezone}}"\n  },\n  "payload": {{payload_json}}\n}';
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: '名称'),
                    maxLength: 64,
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return '请输入名称';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _targetUrlController,
                    decoration: InputDecoration(
                      labelText: _deliveryKind == 'wecom_robot' ? '机器人地址' : 'Webhook 地址',
                      helperText: _deliveryKind == 'wecom_robot'
                          ? '粘贴企业微信机器人 Webhook 地址'
                          : '粘贴接收提醒的 Webhook 地址',
                    ),
                    validator: (value) {
                      final text = value?.trim() ?? '';
                      final uri = Uri.tryParse(text);
                      if (text.isEmpty ||
                          uri == null ||
                          !uri.hasScheme ||
                          !(uri.scheme == 'http' || uri.scheme == 'https') ||
                          uri.host.isEmpty) {
                        return '请输入合法的地址';
                      }
                      if (_deliveryKind == 'wecom_robot' &&
                          !text.contains('weixin.qq.com/cgi-bin/webhook/send')) {
                        return '请输入企业微信机器人的 Webhook 地址';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _secretController,
                    decoration: InputDecoration(
                      labelText: _deliveryKind == 'wecom_robot'
                          ? (widget.isEditing ? '新签名密钥' : '签名密钥')
                          : (widget.isEditing ? '新密钥' : '密钥'),
                      hintText: _deliveryKind == 'wecom_robot'
                          ? (widget.isEditing ? '留空则保持不变，可选' : '如果企业微信机器人启用了签名，可填这里')
                          : (widget.isEditing ? '留空则保持不变' : '可选'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _payloadTemplateController,
                    minLines: 10,
                    maxLines: 16,
                    decoration: const InputDecoration(
                      labelText: '请求体模板',
                      helperText: '支持占位符，如 {{todo_title}}、{{scheduled_for}}、{{payload_json}}',
                    ),
                    validator: (value) {
                      final text = value?.trim() ?? '';
                      if (text.isEmpty) {
                        return '请输入请求体模板';
                      }
                      return null;
                    },
                  ),
                  if (widget.isEditing) ...[
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      value: _clearSecret,
                      contentPadding: EdgeInsets.zero,
                      title: const Text('清空现有密钥'),
                      onChanged: (value) {
                        setState(() {
                          _clearSecret = value ?? false;
                        });
                      },
                    ),
                  ],
                  const SizedBox(height: 8),
                  SwitchListTile.adaptive(
                    value: _isEnabled,
                    contentPadding: EdgeInsets.zero,
                    title: const Text('启用此方式'),
                    onChanged: (value) {
                      setState(() {
                        _isEnabled = value;
                      });
                    },
                  ),
                  const SizedBox(height: 20),
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

  void _submit() {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    Navigator.of(context).pop(
      NotificationEndpointFormData(
        deliveryKind: _deliveryKind,
        name: _nameController.text.trim(),
        targetUrl: _targetUrlController.text.trim(),
        payloadTemplate: _payloadTemplateController.text.trim(),
        isEnabled: _isEnabled,
        secret: _secretController.text.trim(),
        clearSecret: _clearSecret,
      ),
    );
  }
}
