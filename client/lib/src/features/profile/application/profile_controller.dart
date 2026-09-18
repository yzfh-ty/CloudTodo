import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../../app/application/app_session_controller.dart';
import '../data/profile_repository.dart';
import '../domain/profile_user.dart';

class ProfileController extends ChangeNotifier {
  ProfileController({
    required ProfileRepository repository,
    required AppSessionController sessionController,
  })  : _repository = repository,
        _sessionController = sessionController;

  final ProfileRepository _repository;
  final AppSessionController _sessionController;

  ProfileUser? profile;
  bool isLoading = true;
  bool isSaving = false;
  String? errorMessage;

  Future<void> load() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      profile = await _repository.getMe();
    } catch (error) {
      errorMessage = AppException.describe(error);
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> save({
    required String nickname,
    required String email,
    required String timezone,
  }) async {
    isSaving = true;
    errorMessage = null;
    notifyListeners();

    try {
      final updated = await _repository.updateMe(
        nickname: nickname,
        email: email,
        timezone: timezone,
      );
      profile = updated;
      _sessionController.absorbUser(updated.toSessionUser());
      return true;
    } catch (error) {
      errorMessage = AppException.describe(error);
      notifyListeners();
      return false;
    } finally {
      isSaving = false;
      notifyListeners();
    }
  }
}
