class AppException implements Exception {
  const AppException({
    required this.message,
    this.code,
    this.statusCode,
    this.details,
  });

  final String message;
  final String? code;
  final int? statusCode;
  final Object? details;

  factory AppException.fromPayload({
    required int statusCode,
    Object? payload,
  }) {
    if (payload is Map<String, dynamic>) {
      return AppException(
        message: payload['message'] as String? ?? 'request failed',
        code: payload['code'] as String?,
        statusCode: statusCode,
        details: payload['details'],
      );
    }

    return AppException(
      message: 'request failed',
      statusCode: statusCode,
      details: payload,
    );
  }

  static String describe(Object error) {
    if (error is AppException) {
      return error.message;
    }

    return error.toString();
  }

  @override
  String toString() => message;
}
