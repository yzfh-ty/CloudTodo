class ServerCapabilities {
  const ServerCapabilities({required this.channels, required this.features, required this.limits});
  final Map<String, bool> channels; final Map<String, bool> features; final Map<String, int> limits;
  bool channelEnabled(String channel) => channels[channel] ?? false;
  factory ServerCapabilities.fromJson(Map<String, dynamic> json) => ServerCapabilities(channels: (json['channels'] as Map<String, dynamic>? ?? const {}).map((key,value) => MapEntry(key, value == true)), features: (json['features'] as Map<String, dynamic>? ?? const {}).map((key,value) => MapEntry(key, value == true)), limits: (json['limits'] as Map<String, dynamic>? ?? const {}).map((key,value) => MapEntry(key, (value as num).toInt())));
}