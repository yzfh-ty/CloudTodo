import '../../../core/config/app_config.dart';
import '../../../core/http/http_client.dart';
import '../../../core/notifications/local_notification_service.dart';
import '../../auth/data/auth_repository.dart';
import '../../devices/data/device_repository.dart';
import '../../notification_endpoints/data/notification_endpoints_repository.dart';
import '../../profile/data/profile_repository.dart';
import '../../reminders/data/reminders_repository.dart';
import '../../sync/data/sync_repository.dart';
import '../../todos/data/todo_metadata_repository.dart';
import '../../todos/data/todo_repository.dart';
import 'app_session_controller.dart';

class AppServices {
  AppServices._({
    required this.config,
    required this.apiClient,
    required this.authRepository,
    required this.deviceRepository,
    required this.profileRepository,
    required this.todoRepository,
    required this.todoMetadataRepository,
    required this.remindersRepository,
    required this.syncRepository,
    required this.notificationEndpointsRepository,
    required this.localNotificationService,
    required this.sessionController,
  });

  final AppConfig config;
  final ApiClient apiClient;
  final AuthRepository authRepository;
  final DeviceRepository deviceRepository;
  final ProfileRepository profileRepository;
  final TodoRepository todoRepository;
  final TodoMetadataRepository todoMetadataRepository;
  final RemindersRepository remindersRepository;
  final SyncRepository syncRepository;
  final NotificationEndpointsRepository notificationEndpointsRepository;
  final LocalNotificationService localNotificationService;
  final AppSessionController sessionController;

  factory AppServices.create(
    AppConfig config, {
    LocalNotificationService? localNotificationService,
  }) {
    config.validateApiBaseUrl();
    final notificationService =
        localNotificationService ?? LocalNotificationService();
    final apiClient = ApiClient(createHttpClient(config.apiBaseUrl));
    final authRepository = AuthRepository(apiClient);
    final deviceRepository = DeviceRepository(apiClient);
    final profileRepository = ProfileRepository(apiClient);
    final todoRepository = TodoRepository(apiClient);
    final todoMetadataRepository = TodoMetadataRepository(apiClient);
    final syncRepository = SyncRepository(apiClient);
    final notificationEndpointsRepository =
        NotificationEndpointsRepository(apiClient);

    Future<void> invalidateSession({bool clearCookies = true}) {
      apiClient.invalidateSession(clearCookies: clearCookies);
      return notificationService.clearAccountState();
    }

    final sessionController = AppSessionController(
      authRepository: authRepository,
      onAuthenticated: (_) => deviceRepository.registerCurrentDevice(),
      onSessionInvalidated: invalidateSession,
    );
    final remindersRepository = RemindersRepository(
      apiClient,
      localNotificationService: notificationService,
      sessionGeneration: () => sessionController.sessionGeneration,
    );

    apiClient.registerSessionHooks(
      refreshSession: sessionController.refreshSessionSilently,
      clearSession: sessionController.forceLogout,
      sessionGeneration: () => sessionController.sessionGeneration,
      sessionUserId: () => sessionController.currentUser?.id,
    );

    return AppServices._(
      config: config,
      apiClient: apiClient,
      authRepository: authRepository,
      deviceRepository: deviceRepository,
      profileRepository: profileRepository,
      todoRepository: todoRepository,
      todoMetadataRepository: todoMetadataRepository,
      remindersRepository: remindersRepository,
      syncRepository: syncRepository,
      notificationEndpointsRepository: notificationEndpointsRepository,
      localNotificationService: notificationService,
      sessionController: sessionController,
    );
  }

  void dispose() {
    apiClient.dispose();
    sessionController.dispose();
  }
}
