# Android 调试环境

本文说明 CloudTodo 当前项目的 Android 调试路径，以及本仓库开发机的限制。

## 当前机器状态

这台开发机是 Ubuntu 22.04 ARM64，已安装：

- Flutter 3.44.6 / Dart 3.12.2
- OpenJDK 17
- Android SDK Platform 36
- Android Build Tools 36
- Android NDK 28.2
- Android SDK command-line tools 12.0
- ADB（系统 ARM64 版本）

当前没有 `/dev/kvm`，因此本机不运行 Android Emulator。Android Debug APK 构建、Flutter 检查和 ADB 真机调试均可在本机执行；需要模拟器时，在具备硬件虚拟化的 x86_64 开发机上执行。

2026-07-16 已在当前机器验证：

- `flutter doctor -v`：Android toolchain 通过，无问题
- `flutter analyze`：通过
- `flutter test`：7 个测试全部通过
- `flutter build apk --debug --target-platform android-arm,android-arm64,android-x64`：构建成功
- `adb start-server`：启动成功，等待连接真机

## 配置 Android 命令行工具

在项目根目录执行：

```bash
source tools/android-env.sh
sdkmanager --version
adb version
```

脚本只设置当前 shell 的环境变量，不会把机器路径写入仓库。Android SDK 当前目录为 `/usr/lib/android-sdk`。

完整检查 Flutter 和 Android SDK：

```bash
flutter doctor -v
```

## 连接 Android 真机

1. 在手机的开发者选项中打开“USB 调试”。
2. 用 USB 线连接手机，并在手机上允许此电脑的 RSA 调试授权。
3. 重新登录系统（见下一节的 `plugdev` 权限），然后执行：

```bash
source tools/android-env.sh
adb kill-server
adb start-server
adb devices -l
```

设备状态应为 `device`。如果显示 `unauthorized`，解锁手机并重新确认授权；如果没有设备，检查 USB 线、手机的 USB 模式和 udev 权限。

## USB 权限

系统已有 Android udev 规则，但当前用户必须属于 `plugdev` 组。管理员执行：

```bash
sudo usermod -aG plugdev "$USER"
```

执行后注销并重新登录，再用 `id` 确认输出中包含 `plugdev`。不要把 `adb` 以 root 运行，也不要把生成的 `~/.android/adbkey*` 文件加入仓库。

## 后端和客户端联调

先启动 CloudTodo 后端：

```bash
make setup
make db-migrate
make server-dev
```

Android 真机不能访问 `localhost`。真机应使用可从手机访问的后端地址，例如：

```text
https://api.example.com/api
```

登录页展开“高级连接设置”后输入完整地址。当前 Android 网络安全配置默认仅允许本地开发用的 HTTP 地址（`10.0.2.2`、`127.0.0.1`、`localhost`），局域网 HTTP 地址可能被 Android 拒绝，优先使用 HTTPS。

如果在 x86_64 开发机上启动 Android 模拟器，模拟器访问宿主机后端使用：

```text
http://10.0.2.2:3000/api
```

## Flutter 命令

项目要求 Flutter 3.44.6（见 `apps/client_flutter/.fvmrc`），当前机器已安装相同版本。连接真机后执行：

```bash
cd apps/client_flutter
flutter pub get
flutter devices
flutter run -d <device-id>
```

构建调试 APK：

```bash
make client-build-android
```

生成文件在 `apps/client_flutter/build/app/outputs/flutter-apk/app-debug.apk`，也可以用 `adb install -r` 安装到真机。

## Git 排除

仓库已排除 Flutter/Gradle 生成目录、Android `local.properties`、Android 构建产物（APK/AAB/APKS）、密钥文件和本地 SDK/Flutter SDK 目录。不要提交：

- `apps/client_flutter/android/local.properties`
- `apps/client_flutter/build/`
- `*.apk`、`*.aab`、`*.apks`
- `*.jks`、`*.keystore`
- `~/.android/`、`~/.gradle/` 中的用户级文件

检查某个文件是否被排除：

```bash
git check-ignore -v apps/client_flutter/android/local.properties
```
