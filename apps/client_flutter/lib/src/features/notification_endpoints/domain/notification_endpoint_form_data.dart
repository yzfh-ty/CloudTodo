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
    return const NotificationEndpointFormData(
      deliveryKind: 'standard_webhook',
      name: '',
      targetUrl: '',
      payloadTemplate: '',
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
