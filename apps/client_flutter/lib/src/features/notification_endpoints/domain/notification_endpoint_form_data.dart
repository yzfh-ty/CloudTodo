class NotificationEndpointFormData {
  const NotificationEndpointFormData({
    required this.deliveryKind,
    required this.name,
    required this.targetUrl,
    required this.payloadTemplate,
    required this.isEnabled,
    required this.secret,
    required this.clearSecret,
  });

  final String deliveryKind;
  final String name;
  final String targetUrl;
  final String payloadTemplate;
  final bool isEnabled;
  final String secret;
  final bool clearSecret;

  factory NotificationEndpointFormData.createDraft() {
    return NotificationEndpointFormData(
      deliveryKind: 'standard_webhook',
      name: '',
      targetUrl: '',
      payloadTemplate: defaultPayloadTemplateForKind('standard_webhook'),
      isEnabled: true,
      secret: '',
      clearSecret: false,
    );
  }

  NotificationEndpointFormData copyWith({
    String? deliveryKind,
    String? name,
    String? targetUrl,
    String? payloadTemplate,
    bool? isEnabled,
    String? secret,
    bool? clearSecret,
  }) {
    return NotificationEndpointFormData(
      deliveryKind: deliveryKind ?? this.deliveryKind,
      name: name ?? this.name,
      targetUrl: targetUrl ?? this.targetUrl,
      payloadTemplate: payloadTemplate ?? this.payloadTemplate,
      isEnabled: isEnabled ?? this.isEnabled,
      secret: secret ?? this.secret,
      clearSecret: clearSecret ?? this.clearSecret,
    );
  }
}

String defaultPayloadTemplateForKind(String deliveryKind) {
  switch (deliveryKind) {
    case 'wecom_robot':
      return '{\n'
          '  "msgtype": "text",\n'
          '  "text": {\n'
          '    "content": "CloudTodo 提醒通知\\n任务：{{todo_title}}\\n状态：{{todo_status}}\\n优先级：{{todo_priority}}\\n提醒时间：{{scheduled_for}}\\n触发时间：{{triggered_at}}\\n补充信息：{{payload_text}}"\n'
          '  }\n'
          '}';
    case 'standard_webhook':
    default:
      return '{\n'
          '  "source": "cloudtodo",\n'
          '  "endpoint_id": "{{endpoint_id}}",\n'
          '  "endpoint_name": "{{endpoint_name}}",\n'
          '  "delivery_id": "{{delivery_id}}",\n'
          '  "reminder_event_id": "{{reminder_event_id}}",\n'
          '  "channel": "{{channel}}",\n'
          '  "scheduled_for": "{{scheduled_for}}",\n'
          '  "triggered_at": "{{triggered_at}}",\n'
          '  "user": {\n'
          '    "id": "{{user_id}}",\n'
          '    "timezone": "{{user_timezone}}"\n'
          '  },\n'
          '  "payload": {{payload_json}}\n'
          '}';
  }
}

String defaultNameForKind(String deliveryKind) {
  switch (deliveryKind) {
    case 'wecom_robot':
      return '企业微信机器人';
    case 'standard_webhook':
    default:
      return '标准 Webhook';
  }
}
