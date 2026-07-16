import 'dart:io';

class LocalAutostart {
  bool get isSupported => Platform.isLinux;

  File get _entry {
    final home = Platform.environment['HOME'];
    if (home == null || home.isEmpty) {
      throw const FileSystemException('HOME is not configured');
    }
    return File('$home/.config/autostart/cloudtodo.desktop');
  }

  Future<bool> isEnabled() async {
    if (!isSupported) {
      return false;
    }
    return _entry.exists();
  }

  Future<void> setEnabled(bool enabled) async {
    if (!isSupported) {
      return;
    }

    final entry = _entry;
    if (!enabled) {
      if (await entry.exists()) {
        await entry.delete();
      }
      return;
    }

    await entry.parent.create(recursive: true);
    final executable = Platform.resolvedExecutable
        .replaceAll(r'\', r'\\')
        .replaceAll('"', r'\"');
    await entry.writeAsString(
      '[Desktop Entry]\n'
      'Type=Application\n'
      'Name=CloudTodo\n'
      'Comment=CloudTodo background reminders\n'
      'Exec="$executable" --background\n'
      'Terminal=false\n'
      'X-GNOME-Autostart-enabled=true\n',
      flush: true,
    );
  }
}
