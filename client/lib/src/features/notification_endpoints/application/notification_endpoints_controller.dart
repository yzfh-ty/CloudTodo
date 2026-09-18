import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../data/notification_endpoints_repository.dart';
import '../domain/notification_endpoint.dart';
import '../domain/notification_endpoint_form_data.dart';

class NotificationEndpointsController extends ChangeNotifier {
  NotificationEndpointsController({
    required NotificationEndpointsRepository repository,
  }) : _repository = repository;

  final NotificationEndpointsRepository _repository;

  List<NotificationEndpoint> items = const [];
  bool isLoading = true;
  String? errorMessage;
  String? testingId;
  String? submittingId;

  Future<void> load() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      items = await _repository.getEndpoints();
    } catch (error) {
      errorMessage = AppException.describe(error);
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> createEndpoint(NotificationEndpointFormData draft) {
    return _runMutation('creating', () async {
      await _repository.createEndpoint(
        name: draft.name,
        targetUrl: draft.targetUrl,
        payloadTemplate: draft.payloadTemplate,
        isEnabled: draft.isEnabled,
        secret: draft.secret,
      );
      await load();
    });
  }

  Future<bool> updateEndpoint(String id, NotificationEndpointFormData draft) {
    return _runMutation(id, () async {
      await _repository.updateEndpoint(
        id: id,
        name: draft.name,
        targetUrl: draft.targetUrl,
        payloadTemplate: draft.payloadTemplate,
        isEnabled: draft.isEnabled,
        secret: draft.secret,
        clearSecret: draft.clearSecret,
      );
      await load();
    });
  }

  Future<bool> deleteEndpoint(String id) {
    return _runMutation(id, () async {
      await _repository.deleteEndpoint(id);
      await load();
    });
  }

  Future<Map<String, dynamic>?> testEndpoint(String id) async {
    testingId = id;
    errorMessage = null;
    notifyListeners();

    try {
      return await _repository.testEndpoint(id);
    } catch (error) {
      errorMessage = AppException.describe(error);
      notifyListeners();
      return null;
    } finally {
      testingId = null;
      notifyListeners();
    }
  }

  Future<bool> _runMutation(
    String marker,
    Future<void> Function() action,
  ) async {
    submittingId = marker;
    errorMessage = null;
    notifyListeners();

    try {
      await action();
      return true;
    } catch (error) {
      errorMessage = AppException.describe(error);
      notifyListeners();
      return false;
    } finally {
      submittingId = null;
      notifyListeners();
    }
  }
}
