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
      if (error.code == 'SESSION_CHANGED') {
        return '';
      }
      return error.message;
    }

    // Never surface exception details such as URLs, response bodies, or
    // platform stack traces in the UI.
    return 'request failed';
  }

  @override
  String toString() => message;
}
