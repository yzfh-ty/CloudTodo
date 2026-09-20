import 'package:flutter/foundation.dart';

import '../../../core/errors/app_exception.dart';
import '../data/notification_subscriptions_repository.dart';
import '../domain/notification_subscription.dart';
import '../domain/notification_subscription_form_data.dart';

class NotificationSubscriptionsController extends ChangeNotifier {
  NotificationSubscriptionsController({
    required NotificationSubscriptionsRepository repository,
  }) : _repository = repository;

  final NotificationSubscriptionsRepository _repository;

  List<NotificationSubscription> items = const [];
  bool isLoading = true;
  String? errorMessage;
  String? testingId;
  String? submittingId;

  Future<void> load() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      items = await _repository.getSubscriptions();
    } catch (error) {
      errorMessage = AppException.describe(error);
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> createSubscription(NotificationSubscriptionFormData draft) {
    return _runMutation('creating', () async {
      await _repository.upsertSubscription(channel: draft.channel, targetValue: draft.targetValue, enabled: draft.enabled, secret: draft.secret);
      await load();
    });
  }

  Future<bool> updateSubscription(String id, NotificationSubscriptionFormData draft) {
    return _runMutation(id, () async {
      await _repository.upsertSubscription(channel: draft.channel, targetValue: draft.targetValue, enabled: draft.enabled, secret: draft.secret);
      await load();
    });
  }
  Future<bool> deleteSubscription(String id) {
    return _runMutation(id, () async {
      await _repository.deleteSubscription(id);
      await load();
    });
  }

  Future<Map<String, dynamic>?> testSubscription(String id) async {
    testingId = id;
    errorMessage = null;
    notifyListeners();

    try {
      return await _repository.testSubscription(id);
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
