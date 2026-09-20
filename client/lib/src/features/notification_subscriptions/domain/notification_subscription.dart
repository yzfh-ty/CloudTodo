class NotificationSubscription {
  const NotificationSubscription({
    required this.id,
    required this.type,
    required this.provider,
    required this.name,
    required this.targetUrl,
    required this.payloadTemplate,
    required this.isEnabled,
    required this.secretExists,
    required this.createdAt,
    this.version = 1,
    this.lastResponseCode,
    this.lastResponseSummary,
    this.lastSuccessAt,
    this.lastFailureAt,
  });

  final String id;
  final String type;
  final String provider;
  final String name;
  final String targetUrl;
  final String? payloadTemplate;
  final bool isEnabled;
  final bool secretExists;
  final DateTime createdAt;
  final int version;
  final int? lastResponseCode;
  final String? lastResponseSummary;
  final DateTime? lastSuccessAt;
  final DateTime? lastFailureAt;

  factory NotificationSubscription.fromJson(Map<String, dynamic> json) {
    final channel = json['channel'] as String? ?? 'webhook';
    return NotificationSubscription(
      id: json['id'] as String,
      type: channel,
      provider: channel,
      name: json['name'] as String? ?? channel,
      targetUrl: json['target_url'] as String? ?? '',
      payloadTemplate: null,
      isEnabled: json['enabled'] as bool? ?? false,
      secretExists: json['secret_configured'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
      version: json['version'] as int? ?? 1,
    );
  }
}
