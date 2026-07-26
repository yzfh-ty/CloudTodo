# CloudTodo Flutter Client

CloudTodo Flutter Client 是面向 Web、Android、Windows、Linux 的统一客户端实现。

## 当前状态

当前客户端已经具备可联调、可预览的基础能力：

- Flutter Web / Android / Windows / Linux 工程骨架
- 统一分层结构：`core` / `features` / `routing`
- Cookie 会话恢复
- 应用级运行时后端地址切换
- 登录 / 注册
- 任务 / 提醒 / 设置 三个一级入口

## 当前信息架构

一级导航：

- 任务
- 提醒
- 设置

设置页当前承载：

- 账户信息
- 个人资料
- 时区设置
- 通知方式管理
- 高级连接设置
- 退出登录

## 已实现功能

### 任务

- 列表
- 搜索
- 筛选
- 创建
- 编辑
- 完成 / 重新打开 / 归档 / 删除
- 详情弹窗
- 近期提醒侧栏

### 提醒

- 独立页面
- 创建 / 编辑 / 删除
- 详情弹窗

### 设置

- 资料修改
- 时区选择
- 通知方式配置
- 后端地址切换
- 退出登录

### 通知方式

当前支持：

- 企业微信机器人
- 标准 Webhook

当前能力：

- 创建 / 编辑 / 删除 / 测试
- 请求体模板编辑
- 恢复默认模板
- 占位符说明
- 模板示例预览
- 最近结果与上次测试时间展示
- 测试结果查看返回内容与本次请求体

## 目录

```text
apps/client_flutter/
├─ lib/
│  ├─ main.dart
│  └─ src/
│     ├─ core/
│     ├─ features/
│     └─ routing/
├─ web/
│  ├─ config.json
│  ├─ index.html
│  └─ manifest.json
├─ linux/
│  ├─ CMakeLists.txt
│  └─ runner/
└─ Dockerfile.web
```

## 本地启动

### Windows BAT 手动启动 Web

从仓库根目录执行：

```bat
start-client-web.bat
```

默认访问地址：

- Web：`http://localhost:8080`

常用参数：

- `--web-port 8081`：指定 Flutter Web 端口
- `--skip-pub-get`：跳过 `flutter pub get`

### 安装依赖

```bash
flutter pub get
```

### 静态检查与测试

```bash
flutter analyze
flutter test
```

### 运行 Web

```bash
flutter run -d chrome --web-hostname localhost --no-web-resources-cdn
```

`--no-web-resources-cdn` 会将 CanvasKit 等渲染资源随应用本地提供，开发和部署时均不依赖 Google CDN。

### 运行 Windows

```bash
flutter run -d windows
```

### 运行 Linux

```bash
flutter run -d linux
```

### 打包 Android Release

Release 构建必须通过环境变量提供独立签名密钥，不会回退到 Android 调试证书：

```bash
export ANDROID_KEYSTORE_PATH=/absolute/path/to/release.jks
export ANDROID_KEYSTORE_PASSWORD='your-keystore-password'
export ANDROID_KEY_ALIAS='your-key-alias'
export ANDROID_KEY_PASSWORD='your-key-password'
flutter build apk --release --target-platform android-arm,android-arm64,android-x64
```

在上述命令中同时加入
`--dart-define=CLOUDTODO_API_BASE_URL=https://api.example.com/api`，否则原生 Release
会在启动时拒绝缺失的后端配置。

当前 Android 包支持 `armeabi-v7a`、`arm64-v8a` 和 `x86_64`，不会包含 32 位的 `x86` 原生库。本地验证包可从仓库根目录执行：

```bash
make client-build-android
```

### 构建 Linux

当前 Linux 工程面向 Linux ARM64 主机，可在仓库根目录执行：

```bash
CLOUDTODO_API_BASE_URL=https://api.example.com/api make client-build-linux
```

产物位于 `build/linux/arm64/release/bundle/`。

## Docker

当前仓库已经提供：

- [Web Dockerfile](Dockerfile.web)
- [nginx 配置](nginx.conf)
- [docker-compose.yml](docker-compose.yml)

在当前目录执行：

```bat
API_BASE_URL=https://todo.example.com/api docker compose up --build
```

默认访问地址：

- Web：`http://localhost:8080`
- 当前 Web 容器使用 `nginx` 托管 Flutter Web 静态资源

这是 Release 镜像，必须通过 TLS 终止代理提供 HTTPS 页面，并把
`API_BASE_URL` 设置为页面同源的 `https://.../api`（或 `/api`）。未设置该变量时
Compose 会直接拒绝启动；本地 HTTP 调试请使用 `flutter run -d chrome`，不要把
Release 镜像降级为明文配置。

## 后端地址

客户端支持两种方式配置后端地址：

- 登录 / 注册页中的高级连接设置
- 设置页中的高级设置

常见本地地址：

- Web：`http://localhost:3000`
- Windows：`http://127.0.0.1:3000/api`
- Android 模拟器：`http://10.0.2.2:3000/api`

Release 构建不会回退到本地 HTTP。原生 Release 需要通过
`--dart-define=CLOUDTODO_API_BASE_URL=https://api.example.com/api` 注入后端地址；
Web Release 使用与页面同源的 HTTPS `/api` 地址。上述本地 HTTP 地址仅用于调试构建。
