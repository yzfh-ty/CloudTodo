# CloudTodo Server

CloudTodo Server 是项目的后端服务，提供：

- 用户接口
- Todo / Reminder / Notification Endpoint 接口
- 后端内置管理后台
- Reminder 调度
- Webhook 投递

## 技术栈

- Node.js
- TypeScript
- NestJS 风格模块化结构
- Prisma
- PostgreSQL

## 当前能力

### 用户侧

- 注册 / 登录 / refresh / 登出
- 用户资料接口：`/api/users/me`
- Todo 基础 CRUD
- Reminder CRUD
- Notification Endpoint CRUD
- Notification Endpoint 测试投递
- Notification Endpoint 请求体模板渲染

### 管理侧

- 管理员登录与会话鉴权
- 用户列表
- 用户详情
- 用户资料更新
- 用户禁用 / 启用
- 用户密码重置
- 操作日志
- 管理后台页面：`/admin`、`/admin/login`

### 调度与投递

- Reminder 扫描调度器
- Webhook 投递 worker

## 目录

```text
apps/server/
├─ prisma/
│  ├─ migrations/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ common/
│  └─ modules/
│     ├─ admin/
│     ├─ admin-panel/
│     ├─ auth/
│     ├─ health/
│     ├─ notification-endpoints/
│     ├─ reminders/
│     ├─ scheduler/
│     ├─ todos/
│     ├─ users/
│     └─ webhook-test/
├─ .env.example
├─ nest-cli.json
├─ package.json
├─ tsconfig.build.json
└─ tsconfig.json
```

## 环境要求

- Node.js 22+
- npm 10+
- PostgreSQL 16+

## 快速开始

### Windows BAT 手动启动

从仓库根目录执行：

```bat
start-server.bat --use-docker-db --seed-admin
```

常用参数：

- `--use-docker-db`：启动 `apps/server/docker-compose.yml` 中的 PostgreSQL
- `--seed-admin`：执行 `npm run seed:admin`
- `--skip-install`：跳过 `npm ci`
- `--skip-prisma-generate`：跳过 Prisma Client 生成
- `--skip-migrate`：跳过数据库迁移
- `--port 3001`：指定后端端口
- `--database-url "postgresql://..."`：指定数据库连接串

### 默认管理员账号

执行 `start-server.bat --seed-admin` 或 `npm run seed:admin` 后，会初始化管理员账号。

未配置 `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` 时，仅本地开发默认账号为：

- 管理后台：`http://localhost:3000/admin/login`
- 登录账号：`admin@example.com`
- 登录密码：`admin123456`

如果当前目录的 `.env` 中配置了 `ADMIN_SEED_EMAIL`、`ADMIN_SEED_PASSWORD`，则以 `.env` 中的值为准。
生产环境必须显式配置强随机 `ADMIN_SEED_PASSWORD`、`JWT_ACCESS_SECRET`、`ADMIN_SESSION_SECRET`、`CSRF_SECRET`、`WEBHOOK_SECRET_ENCRYPTION_KEY` 和 `PASSWORD_RESET_TOKEN_SECRET`，服务会拒绝使用默认弱值启动。

### 1. 安装依赖

```bash
npm ci
```

### 2. 复制环境变量

```bash
cp .env.example .env
```

Windows CMD / BAT:

```bat
copy .env.example .env
```

本地开发也可以直接使用精简模板：

```bash
cp .env.development.example .env
```

仓库根目录的 `make setup` 会在 `.env` 不存在时自动执行这一步。

### 3. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 4. 启动开发服务

```bash
npm run start:dev
```

## Docker 部署

当前仓库已经提供：

- [Dockerfile](Dockerfile)
- [docker-compose.yml](docker-compose.yml)

在当前目录执行：

```bat
docker compose up --build
```

默认入口：

- 后端接口：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`
- 健康检查：`http://localhost:3000/health`

## 常用命令

```bash
npm ci
npm run build
npm run start:dev
npm run prisma:generate
npm run prisma:migrate:dev -- --name your_change_name
npm run prisma:migrate:deploy
npm run prisma:studio
npm run seed:admin
```

## 主要访问入口

- 健康检查：`GET /health`
- 管理后台登录页：`GET /admin/login`
- 管理后台首页：`GET /admin`
- 管理员接口：`/api/admin/*`
- 普通用户接口：`/api/auth/*`、`/api/users/*`、`/api/todos/*`

## 通知方式与投递

当前通知方式链路支持：

- 企业微信机器人
- 标准 Webhook

当前行为：

- 测试通知方式时，后端会真实向目标地址发送一次请求
- 正常提醒触发后，调度器会按 Notification Endpoint 配置真实投递
- 请求体模板同时作用于：
  - 手动测试通知方式
  - 调度器真实投递

请求体模板支持的典型占位符：

- `{{todo_title}}`
- `{{todo_status}}`
- `{{todo_priority}}`
- `{{scheduled_for}}`
- `{{triggered_at}}`
- `{{endpoint_name}}`
- `{{user_timezone}}`
- `{{payload_text}}`
- `{{payload_json}}`

Notification Endpoint 当前还会记录以下最近一次结果字段：

- 最近成功时间
- 最近失败时间
- 最近响应码
- 最近返回摘要

企业微信机器人测试说明：

- 如果目标地址包含 `weixin.qq.com/cgi-bin/webhook/send`，后端会按企业微信机器人格式发送测试消息
- 如果机器人启用了签名校验，可在 Notification Endpoint 的 `secret` 中填写签名密钥
- 后端会校验企业微信返回体中的 `errcode`

## 本地测试 Webhook 回调入口

- `POST /api/webhook-test/echo`

## 故障排查

### Prisma 连不上数据库

优先检查：

- PostgreSQL 是否启动
- `DATABASE_URL` 是否指向本地可访问数据库
- `npx prisma migrate status` 是否正常

### 服务启动后接口访问不到

优先检查：

- `PORT` 是否为 `3000`
- 本地端口是否被占用
- 是否使用了 `npm run start:dev`

### 登录后立刻失效

优先检查：

- 是否刚执行了改密
- 是否执行了退出所有会话
- 浏览器是否携带了正确 Cookie
