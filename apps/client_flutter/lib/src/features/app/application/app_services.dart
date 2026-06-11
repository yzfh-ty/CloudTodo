import '../../../core/config/app_config.dart';
import '../../../core/http/http_client.dart';
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
  final AppSessionController sessionController;

  factory AppServices.create(AppConfig config) {
    final apiClient = ApiClient(createHttpClient(config.apiBaseUrl));
    final authRepository = AuthRepository(apiClient);
    final deviceRepository = DeviceRepository(apiClient);
    final profileRepository = ProfileRepository(apiClient);
    final todoRepository = TodoRepository(apiClient);
    final todoMetadataRepository = TodoMetadataRepository(apiClient);
    final remindersRepository = RemindersRepository(apiClient);
    final syncRepository = SyncRepository(apiClient);
    final notificationEndpointsRepository = NotificationEndpointsRepository(apiClient);
    final sessionController = AppSessionController(
      authRepository: authRepository,
      onAuthenticated: (_) => deviceRepository.registerCurrentDevice(),
    );

    apiClient.registerSessionHooks(
      refreshSession: sessionController.refreshSessionSilently,
      clearSession: sessionController.forceLogout,
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
      sessionController: sessionController,
    );
  }
}
