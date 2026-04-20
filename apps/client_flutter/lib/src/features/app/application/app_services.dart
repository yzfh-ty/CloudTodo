import '../../../core/config/app_config.dart';
import '../../../core/http/http_client.dart';
import '../../auth/data/auth_repository.dart';
import '../../notification_endpoints/data/notification_endpoints_repository.dart';
import '../../profile/data/profile_repository.dart';
import '../../reminders/data/reminders_repository.dart';
import '../../todos/data/todo_repository.dart';
import 'app_session_controller.dart';

class AppServices {
  AppServices._({
    required this.config,
    required this.apiClient,
    required this.authRepository,
    required this.profileRepository,
    required this.todoRepository,
    required this.remindersRepository,
    required this.notificationEndpointsRepository,
    required this.sessionController,
  });

  final AppConfig config;
  final ApiClient apiClient;
  final AuthRepository authRepository;
  final ProfileRepository profileRepository;
  final TodoRepository todoRepository;
  final RemindersRepository remindersRepository;
  final NotificationEndpointsRepository notificationEndpointsRepository;
  final AppSessionController sessionController;

  factory AppServices.create(AppConfig config) {
    final apiClient = ApiClient(createHttpClient(config.apiBaseUrl));
    final authRepository = AuthRepository(apiClient);
    final profileRepository = ProfileRepository(apiClient);
    final todoRepository = TodoRepository(apiClient);
    final remindersRepository = RemindersRepository(apiClient);
    final notificationEndpointsRepository = NotificationEndpointsRepository(apiClient);
    final sessionController = AppSessionController(authRepository: authRepository);

    apiClient.registerSessionHooks(
      refreshSession: sessionController.refreshSessionSilently,
      clearSession: sessionController.forceLogout,
    );

    return AppServices._(
      config: config,
      apiClient: apiClient,
      authRepository: authRepository,
      profileRepository: profileRepository,
      todoRepository: todoRepository,
      remindersRepository: remindersRepository,
      notificationEndpointsRepository: notificationEndpointsRepository,
      sessionController: sessionController,
    );
  }
}
