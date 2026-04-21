class NotificationEndpoint {
  const NotificationEndpoint({
    required this.id,
    required this.type,
    required this.name,
    required this.targetUrl,
    required this.payloadTemplate,
    required this.isEnabled,
    required this.createdAt,
    this.lastResponseCode,
    this.lastResponseSummary,
    this.lastSuccessAt,
    this.lastFailureAt,
  });

  final String id;
  final String type;
  final String name;
  final String targetUrl;
  final String? payloadTemplate;
  final bool isEnabled;
  final DateTime createdAt;
  final int? lastResponseCode;
  final String? lastResponseSummary;
  final DateTime? lastSuccessAt;
  final DateTime? lastFailureAt;

  factory NotificationEndpoint.fromJson(Map<String, dynamic> json) {
    return NotificationEndpoint(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'webhook',
      name: json['name'] as String? ?? '',
      targetUrl: json['targetUrl'] as String? ?? '',
      payloadTemplate: json['payloadTemplate'] as String?,
      isEnabled: json['isEnabled'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastResponseCode: json['lastResponseCode'] as int?,
      lastResponseSummary: json['lastResponseSummary'] as String?,
      lastSuccessAt: json['lastSuccessAt'] == null
          ? null
          : DateTime.parse(json['lastSuccessAt'] as String),
      lastFailureAt: json['lastFailureAt'] == null
          ? null
          : DateTime.parse(json['lastFailureAt'] as String),
    );
  }
}
