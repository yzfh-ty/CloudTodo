class NotificationSubscription {
  const NotificationSubscription({
    required this.id,
    required this.channel,
    required this.enabled,
    required this.email,
    required this.targetUrl,
    required this.chatId,
    required this.secretConfigured,
    required this.lastDeliveryAt,
    required this.lastErrorCode,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String channel;
  final bool enabled;
  final String? email;
  final String? targetUrl;
  final String? chatId;
  final bool secretConfigured;
  final DateTime? lastDeliveryAt;
  final String? lastErrorCode;
  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory NotificationSubscription.fromJson(Map<String, dynamic> json) {
    DateTime? date(Object? value) => value is String && value.isNotEmpty ? DateTime.tryParse(value) : null;
    return NotificationSubscription(
      id: json['id'] as String,
      channel: json['channel'] as String? ?? 'webhook',
      enabled: json['enabled'] as bool? ?? false,
      email: json['email'] as String?,
      targetUrl: json['target_url'] as String?,
      chatId: json['chat_id'] as String?,
      secretConfigured: json['secret_configured'] as bool? ?? false,
      lastDeliveryAt: date(json['last_delivery_at']),
      lastErrorCode: json['last_error_code'] as String?,
      version: (json['version'] as num?)?.toInt() ?? 1,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }
}