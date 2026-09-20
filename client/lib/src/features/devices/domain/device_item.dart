class DeviceItem {
  const DeviceItem({
    required this.id,
    required this.platform,
    required this.deviceName,
    required this.isOnline,
    this.appVersion,
    this.lastActiveAt,
  });

  final String id;
  final String platform;
  final String deviceName;
  final String? appVersion;
  final bool isOnline;
  final DateTime? lastActiveAt;

  factory DeviceItem.fromJson(Map<String, dynamic> json) {
    return DeviceItem(
      id: json['id'] as String,
      platform: json['platform'] as String? ?? 'unknown',
      deviceName: json['name'] as String? ?? '',
      appVersion: json['app_version'] as String?,
      isOnline: json['is_online'] as bool? ?? false,
      lastActiveAt: json['last_active_at'] == null
          ? null
          : DateTime.parse(json['last_active_at'] as String),
    );
  }
}
