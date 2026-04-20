enum AppSection {
  todos,
  reminders,
  settings,
}

enum AppLocation {
  login,
  register,
  app,
}

class AppRoutePath {
  const AppRoutePath._({
    required this.location,
    this.section = AppSection.todos,
  });

  const AppRoutePath.login() : this._(location: AppLocation.login);

  const AppRoutePath.register() : this._(location: AppLocation.register);

  const AppRoutePath.app([AppSection section = AppSection.todos])
      : this._(location: AppLocation.app, section: section);

  final AppLocation location;
  final AppSection section;

  bool get requiresAuth => location == AppLocation.app;

  Uri toUri() {
    switch (location) {
      case AppLocation.login:
        return Uri(path: '/login');
      case AppLocation.register:
        return Uri(path: '/register');
      case AppLocation.app:
        return Uri(path: '/app/${section.name}');
    }
  }
}
