import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as timezone;

const defaultAppTimezone = 'Asia/Shanghai';

bool _initialized = false;
late timezone.Location _currentLocation;

timezone.Location get appTimezoneLocation {
  initializeAppTimezone();
  return _currentLocation;
}

void initializeAppTimezone() {
  if (_initialized) {
    return;
  }

  timezone_data.initializeTimeZones();
  _currentLocation = timezone.getLocation(defaultAppTimezone);
  _initialized = true;
}

void setAppTimezone(String value) {
  initializeAppTimezone();
  try {
    _currentLocation = timezone.getLocation(value);
  } on ArgumentError {
    _currentLocation = timezone.getLocation(defaultAppTimezone);
  }
}

DateTime dateTimeInAppTimezone(DateTime value) {
  initializeAppTimezone();
  return timezone.TZDateTime.from(value, _currentLocation);
}

DateTime appTimezoneWallClock({
  required int year,
  required int month,
  required int day,
  required int hour,
  required int minute,
}) {
  initializeAppTimezone();
  return timezone.TZDateTime(
    _currentLocation,
    year,
    month,
    day,
    hour,
    minute,
  );
}
