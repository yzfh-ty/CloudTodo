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
    required this.forcePasswordChange,
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
  final bool forcePasswordChange;
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
      timezone: json['timezone'] as String? ?? 'UTC',
      forcePasswordChange: json['force_password_change'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      lastLoginAt: json['last_login_at'] == null
          ? null
          : DateTime.parse(json['last_login_at'] as String),
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
      forcePasswordChange: forcePasswordChange,
      lastLoginAt: lastLoginAt,
    );
  }
}
