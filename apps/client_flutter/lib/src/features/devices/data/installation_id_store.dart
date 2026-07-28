import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

abstract class InstallationIdStore {
  Future<String> getOrCreate();
}

class SharedPreferencesInstallationIdStore implements InstallationIdStore {
  SharedPreferencesInstallationIdStore({Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  static const _storageKey = 'cloudtodo_installation_id';
  static final _uuidPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  );

  final Uuid _uuid;

  @override
  Future<String> getOrCreate() async {
    final preferences = await SharedPreferences.getInstance();
    final existing = preferences.getString(_storageKey)?.toLowerCase();
    if (existing != null && _uuidPattern.hasMatch(existing)) return existing;

    final created = _uuid.v4();
    await preferences.setString(_storageKey, created);
    return created;
  }
}
