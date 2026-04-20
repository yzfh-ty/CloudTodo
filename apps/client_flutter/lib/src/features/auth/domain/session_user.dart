class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.username,
    required this.nickname,
    required this.role,
    required this.status,
    required this.timezone,
    this.lastLoginAt,
  });

  final String id;
  final String email;
  final String username;
  final String nickname;
  final String role;
  final String status;
  final String timezone;
  final DateTime? lastLoginAt;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      email: json['email'] as String,
      username: json['username'] as String,
      nickname: json['nickname'] as String? ?? '',
      role: json['role'] as String? ?? 'user',
      status: json['status'] as String? ?? 'active',
      timezone: json['timezone'] as String? ?? 'Asia/Shanghai',
      lastLoginAt: json['lastLoginAt'] == null
          ? null
          : DateTime.parse(json['lastLoginAt'] as String),
    );
  }
}
