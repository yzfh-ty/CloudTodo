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
                          _nameController.text = defaultNameForKind(value);
                        }
                        if (_payloadTemplateController.text.trim().isEmpty) {
                          _payloadTemplateController.text = defaultPayloadTemplateForKind(value);
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
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      FilledButton.tonal(
                        onPressed: () {
                          setState(() {
                            _payloadTemplateController.text =
                                defaultPayloadTemplateForKind(_deliveryKind);
                            if (_nameController.text.trim().isEmpty) {
                              _nameController.text = defaultNameForKind(_deliveryKind);
                            }
                          });
                        },
                        child: const Text('恢复默认模板'),
                      ),
                      Text(
                        '模板里的占位符会在测试通知和真实提醒投递时自动替换。',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF6F0E6),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          '可用占位符',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        SizedBox(height: 8),
                        Text('{{todo_title}}：任务标题'),
                        Text('{{todo_status}}：任务状态'),
                        Text('{{todo_priority}}：任务优先级'),
                        Text('{{scheduled_for}}：计划提醒时间'),
                        Text('{{triggered_at}}：实际触发时间'),
                        Text('{{endpoint_name}}：通知方式名称'),
                        Text('{{user_timezone}}：用户时区'),
                        Text('{{payload_text}}：提醒内容文本'),
                        Text('{{payload_json}}：提醒内容 JSON 对象'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF5F3),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '示例预览',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        SelectableText(
                          _buildPreview(),
                          style: const TextStyle(
                            fontFamily: 'Consolas',
                            fontSize: 12,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
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

  String _buildPreview() {
    final sample = <String, String>{
      'todo_title': '完成毕业设计开题报告',
      'todo_status': 'pending',
      'todo_priority': 'high',
      'scheduled_for': '2026-04-21T18:00:00Z',
      'triggered_at': '2026-04-21T18:00:05Z',
      'endpoint_name': _nameController.text.trim().isEmpty ? defaultNameForKind(_deliveryKind) : _nameController.text.trim(),
      'user_timezone': 'Asia/Shanghai',
      'payload_text': '请及时处理该任务，避免错过提交时间。',
      'payload_json': '{"todo_id":"demo_todo","channel":"webhook"}',
      'endpoint_id': 'demo_endpoint',
      'delivery_id': 'demo_delivery',
      'reminder_event_id': 'demo_event',
      'channel': 'webhook',
      'user_id': 'demo_user',
    };

    var rendered = _payloadTemplateController.text.trim();
    if (rendered.isEmpty) {
      rendered = defaultPayloadTemplateForKind(_deliveryKind);
    }

    sample.forEach((key, value) {
      rendered = rendered.replaceAll('{{$key}}', value);
    });

    return rendered;
  }
}
