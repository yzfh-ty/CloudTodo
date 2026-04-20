# CloudTodo Server

CloudTodo 后端服务当前采用：

- Node.js
- TypeScript
- NestJS 风格模块化结构
- Prisma + PostgreSQL

## 当前能力

目前后端已经具备以下真实能力：

- 管理员登录、会话与鉴权守卫
- 管理员用户列表、用户详情、资料更新
- 管理员禁用/启用用户
- 管理员重置用户密码
- 管理员操作日志
- 管理后台页面：`/admin`、`/admin/login`
- 普通用户注册 / 登录 / refresh / 登出
- 普通用户资料接口：`/api/users/me`
- Todo 基础 CRUD
- Reminder CRUD
- Notification Endpoint CRUD
- 调度器扫描提醒
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

推荐本地数据库方案：

- 使用 WSL Docker 启动 PostgreSQL 容器

## 环境变量

建议将 `.env.example` 视为生产占位模板：

- 包含完整字段
- 使用生产场景的占位值
- 不包含任何真实生产密钥

本地开发时，复制为 `.env` 后再改成本机可运行的值。

示例：

```env
NODE_ENV=production
PORT=3000
APP_NAME=CloudTodo Server
APP_BASE_URL=https://todo.example.com
DATABASE_URL=postgresql://cloudtodo:change-me-db-password@db.example.com:5432/cloudtodo?schema=public
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
WEBHOOK_SIGNING_SECRET=change-me-webhook-secret
ADMIN_SESSION_SECRET=change-me-admin-session-secret
SCHEDULER_ENABLED=true
SCHEDULER_SCAN_INTERVAL_MS=5000
DELIVERY_SCAN_INTERVAL_MS=5000
DELIVERY_MAX_ATTEMPTS=3
```

说明：

- 本地开发时建议把 `APP_BASE_URL` 改成 `http://127.0.0.1:3000`
- 本地开发时建议把 `DATABASE_URL` 改成指向本机 PostgreSQL，例如 `127.0.0.1:5432`
- 当前 `.env.example` 是生产占位模板，不是本地开发直连模板

## 首次启动

### 1. 安装依赖

```bash
npm install
```

### 2. 复制环境变量

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 4. 确认 migration 状态

当前仓库已经建立正式 Prisma migration 基线。

检查状态：

```bash
npx prisma migrate status
```

预期结果：

- `Database schema is up to date!`

### 5. 初始化测试账号

```bash
npm run seed:admin
```

默认测试账号：

- 管理员：`admin@example.com / admin123456`
- 默认不创建普通演示用户

管理员默认账号可以通过环境变量覆盖：

- `ADMIN_SEED_USERNAME`
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`
- `ADMIN_SEED_NICKNAME`
- `ADMIN_SEED_TIMEZONE`

### 6. 启动开发服务

```bash
npm run start:dev
```

或启动编译后服务：

```bash
npm run build
npm run start
```

## 本地数据库流程

### 启动 PostgreSQL 容器

如果使用 WSL Docker：

```powershell
wsl.exe bash -lc "docker run -d --name cloudtodo-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cloudtodo -p 5432:5432 -v cloudtodo-postgres-data:/var/lib/postgresql/data --restart unless-stopped postgres:16-alpine"
```

检查状态：

```powershell
wsl.exe bash -lc "docker ps --filter name=cloudtodo-postgres"
```

### 后续数据库变更

从现在开始，数据库结构变更应走正式 migration 流程，不再继续把 `db push` 当主流程使用。

开发新增变更：

```bash
npm run prisma:migrate:dev -- --name your_change_name
```

部署环境应用迁移：

```bash
npm run prisma:migrate:deploy
```

查看数据库：

```bash
npm run prisma:studio
```

## Seed 流程

当前 seed 脚本位置：

- `prisma/seed.ts`

执行命令：

```bash
npm run seed:admin
```

默认会 upsert：

- 管理员账号

可选行为：

- 当 `DEMO_USER_ENABLED=true` 时，额外创建演示普通用户

可通过环境变量覆盖：

- `ADMIN_SEED_USERNAME`
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`
- `ADMIN_SEED_NICKNAME`
- `ADMIN_SEED_TIMEZONE`
- `DEMO_USER_ENABLED`
- `DEMO_USER_EMAIL`
- `DEMO_USER_PASSWORD`

示例：

```env
ADMIN_SEED_USERNAME=root_admin
ADMIN_SEED_EMAIL=root@example.com
ADMIN_SEED_PASSWORD=change-this-password
ADMIN_SEED_NICKNAME=Root Admin
ADMIN_SEED_TIMEZONE=UTC
```

## 常用命令

```bash
npm install
npm run build
npm run start:dev
npm run prisma:generate
npm run prisma:migrate:dev -- --name init_xxx
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

## 调度与投递说明

当前服务进程内已经包含：

- Reminder 扫描调度器
- Webhook 投递 worker

相关配置：

- `SCHEDULER_ENABLED`
- `SCHEDULER_SCAN_INTERVAL_MS`
- `DELIVERY_SCAN_INTERVAL_MS`
- `DELIVERY_MAX_ATTEMPTS`

本地测试 Webhook 回调入口：

- `POST /api/webhook-test/echo`

## 故障排查

### Prisma 连不上数据库

优先检查：

- PostgreSQL 容器是否启动
- `DATABASE_URL` 是否指向 `127.0.0.1:5432`
- `npx prisma migrate status` 是否正常

### 服务启动了但接口访问不到

优先检查：

- `PORT` 是否为 `3000`
- 本地端口是否被其他进程占用
- 是否使用了 `npm run start` 或 `npm run start:dev`

### 登录后立刻失效

优先检查：

- 是否刚执行了改密
- 是否执行了退出所有会话
- 浏览器是否携带了正确 Cookie

## 相关文档

- [后端管理后台接口详细设计](D:\project\CloudTodo\docs\api\后端管理后台接口详细设计.md)
- [数据库表结构设计](D:\project\CloudTodo\docs\architecture\数据库表结构设计.md)
- [Docker部署设计](D:\project\CloudTodo\docs\architecture\Docker部署设计.md)
