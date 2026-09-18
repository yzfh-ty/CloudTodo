class ApiResponse {
  const ApiResponse({
    required this.code,
    required this.message,
    required this.data,
  });

  final String code;
  final String message;
  final Object? data;

  factory ApiResponse.fromJson(Map<String, dynamic> json) {
    return ApiResponse(
      code: json['code'] as String? ?? 'UNKNOWN',
      message: json['message'] as String? ?? 'unknown error',
      data: json['data'],
    );
  }
}
