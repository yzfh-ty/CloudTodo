import 'app_timezone.dart';

String formatDateTime(DateTime? value) {
  if (value == null) {
    return '未设置';
  }

  final local = dateTimeInAppTimezone(value);
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');

  return '${local.year}-$month-$day $hour:$minute';
}
