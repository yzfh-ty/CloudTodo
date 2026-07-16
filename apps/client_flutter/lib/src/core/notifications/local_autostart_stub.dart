class LocalAutostart {
  bool get isSupported => false;

  Future<bool> isEnabled() async => false;

  Future<void> setEnabled(bool enabled) async {}
}
