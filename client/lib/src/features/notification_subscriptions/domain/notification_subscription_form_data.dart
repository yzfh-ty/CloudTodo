class NotificationSubscriptionFormData {
  const NotificationSubscriptionFormData({required this.channel, required this.targetValue, required this.enabled, required this.secret, required this.clearSecret});
  final String channel;
  final String targetValue;
  final bool enabled;
  final String secret;
  final bool clearSecret;

  factory NotificationSubscriptionFormData.createDraft() => const NotificationSubscriptionFormData(channel: 'webhook', targetValue: '', enabled: true, secret: '', clearSecret: false);
}