import 'http_client.dart';

PlatformHttpClient createPlatformHttpClient(
  String baseUrl, {
  HttpClientPolicy policy = const HttpClientPolicy(),
}) {
  throw UnsupportedError(
      'CloudTodo Web client currently only initializes Web transport.');
}
