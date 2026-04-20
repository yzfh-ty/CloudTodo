import '../../auth/domain/session_user.dart';

class ProfileUser {
  const ProfileUser({
    required this.id,
    required this.email,
    required this.username,
    required this.nickname,
    required this.role,
    required this.status,
    required this.timezone,
    required this.createdAt,
    required this.updatedAt,
    this.lastLoginAt,
  });

  final String id;
  final String email;
  final String username;
  final String nickname;
  final String role;
  final String status;
  final String timezone;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? lastLoginAt;

  factory ProfileUser.fromJson(Map<String, dynamic> json) {
    return ProfileUser(
      id: json['id'] as String,
      email: json['email'] as String,
      username: json['username'] as String,
      nickname: json['nickname'] as String? ?? '',
      role: json['role'] as String? ?? 'user',
      status: json['status'] as String? ?? 'active',
      timezone: json['timezone'] as String? ?? 'Asia/Shanghai',
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      lastLoginAt: json['lastLoginAt'] == null
          ? null
          : DateTime.parse(json['lastLoginAt'] as String),
    );
  }

  SessionUser toSessionUser() {
    return SessionUser(
      id: id,
      email: email,
      username: username,
      nickname: nickname,
      role: role,
      status: status,
      timezone: timezone,
      lastLoginAt: lastLoginAt,
    );
  }
}
