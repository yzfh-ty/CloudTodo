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
      platform: json['platform'] as String? ?? 'web',
      deviceName: json['deviceName'] as String? ?? '',
      appVersion: json['appVersion'] as String?,
      isOnline: json['isOnline'] as bool? ?? false,
      lastActiveAt: json['lastActiveAt'] == null
          ? null
          : DateTime.parse(json['lastActiveAt'] as String),
    );
  }
}
