# CloudTodo

CloudTodo 是一个面向多端的 Todo 与提醒服务，目标覆盖：

- Web
- Android
- Windows

当前仓库采用单仓结构，已经包含：

- 后端服务
- 后端内置管理后台
- Flutter 三端客户端

## 仓库结构

```text
CloudTodo/
├─ apps/
│  ├─ client_flutter/
│  └─ server/
├─ docs/
├─ start-client-web.bat
├─ start-dev.bat
├─ start-server.bat
└─ README.md
```

## 当前能力

### 服务端

- 普通用户注册 / 登录 / refresh / 登出
- 用户资料接口：`/api/users/me`
- Todo CRUD 与状态流转
- Reminder CRUD 与近期提醒查询
- Notification Endpoint CRUD
- Notification Endpoint 测试投递
- Notification Endpoint 请求体模板渲染
- Reminder 扫描调度
- Webhook 投递 worker
- 后端内置管理后台 `/admin`
- 管理员登录、用户列表、用户详情、资料更新
- 管理员禁用 / 启用用户
- 管理员重置用户密码
- 管理员操作日志

### 客户端

- Flutter Web / Android / Windows 工程骨架
- 统一分层结构：`core` / `features` / `routing`
- Cookie 会话恢复
- 运行时后端地址切换
- 任务页：列表、搜索、筛选、创建、编辑、完成、重新打开、归档、删除、详情
- 提醒页：创建、编辑、删除、详情
- 设置页：资料、时区、通知方式、后端地址、退出登录
- 通知方式支持：
  - 企业微信机器人
  - 标准 Webhook
- 通知方式模板支持：
  - 模板编辑
  - 恢复默认模板
  - 占位符说明
  - 示例预览
  - 测试结果查看返回内容与请求体

## 快速开始

### Windows BAT 手动启动开发环境

从仓库根目录执行：

```bat
start-dev.bat --use-docker-db --seed-admin
```

该命令会打开两个终端窗口：

- 后端服务：`http://localhost:3000`
- Flutter Web：`http://localhost:8080`

如果已经有本地 PostgreSQL，可改用：

```bat
start-dev.bat --database-url "postgresql://cloudtodo:cloudtodo@localhost:5432/cloudtodo?schema=public"
```

也可以拆开启动：

```bat
start-server.bat --use-docker-db --seed-admin
start-client-web.bat
```

常用参数：

- `--api-port 3001`：指定后端端口
- `--web-port 8081`：指定 Flutter Web 端口
- `--skip-install`：跳过后端 `npm install`
- `--skip-prisma-generate`：跳过 Prisma Client 生成
- `--skip-migrate`：跳过数据库迁移
- `--skip-pub-get`：跳过 `flutter pub get`

### 默认管理员账号

执行 `start-dev.bat --use-docker-db --seed-admin` 或 `start-server.bat --seed-admin` 后，会初始化管理员账号。

未配置 `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` 时，仅本地开发默认账号为：

- 管理后台：`http://localhost:3000/admin/login`
- 登录账号：`admin@example.com`
- 登录密码：`admin123456`

如果 `apps/server/.env` 中配置了 `ADMIN_SEED_EMAIL`、`ADMIN_SEED_PASSWORD`，则以 `.env` 中的值为准。
生产环境必须显式配置强随机 `ADMIN_SEED_PASSWORD`、`JWT_ACCESS_SECRET`、`ADMIN_SESSION_SECRET`、`CSRF_SECRET`、`WEBHOOK_SECRET_ENCRYPTION_KEY` 和 `PASSWORD_RESET_TOKEN_SECRET`，服务会拒绝使用默认弱值启动。

### 后端

```bat
cd apps/server
npm install
npm run prisma:generate
npm run start:dev
```

### 客户端

```bat
cd apps/client_flutter
flutter pub get
flutter run -d chrome --web-hostname localhost --no-web-resources-cdn
```

`--no-web-resources-cdn` 会将 Flutter Web 渲染资源随应用本地提供，浏览器无需访问 Google CDN。

### Docker 部署

当前仓库采用“后端 / Web 分开 compose”的方式：

- 后端 compose：`apps/server/docker-compose.yml`
- Web compose：`apps/client_flutter/docker-compose.yml`

后端启动：

```bat
cd apps/server
docker compose up --build
```

Web 启动：

```bat
cd apps/client_flutter
docker compose up --build
```

当前 Web 容器使用 `nginx` 托管 Flutter Web 静态资源，并在容器启动时生成运行时 `config.json`。

## 仓库入口

- [后端说明](apps/server/README.md)
- [客户端说明](apps/client_flutter/README.md)

## 当前导航

客户端当前一级导航为：

- 任务
- 提醒
- 设置

设置页当前集中承载：

- 账户信息
- 个人资料
- 时区设置
- 通知方式配置
- 后端地址高级设置
- 退出登录
