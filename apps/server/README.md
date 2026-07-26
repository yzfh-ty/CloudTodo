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
- 管理员动态口令 MFA（TOTP + 一次性恢复码，后台"安全设置"中启用）
- 高风险操作（禁用用户、重置密码）在启用 MFA 后需附带 `X-CloudTodo-MFA-Code` 二次确认
- 安全审计日志查询 `GET /api/admin/security-audit-logs`（分页/筛选，元数据写入时脱敏）
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

- `--use-docker-db`：使用开发 Compose 覆盖文件启动仅绑定到 `127.0.0.1` 的 PostgreSQL（生产部署不要使用该覆盖文件）
- `--seed-admin`：仅在本地执行 create-only 的 `npm run seed:admin`（不会重置已有密码）
- `--skip-install`：跳过 `npm ci`
- `--skip-prisma-generate`：跳过 Prisma Client 生成
- `--skip-migrate`：跳过数据库迁移
- `--port 3001`：指定后端端口
- `--database-url "postgresql://..."`：指定数据库连接串

### 默认管理员账号

执行 `start-server.bat --seed-admin` 或 `npm run seed:admin` 后，会在本地创建缺失的管理员账号；重复执行不会重置已有密码。

未配置 `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` 时，仅本地开发默认账号为：

- 管理后台：`http://localhost:3000/admin/login`
- 登录账号：`admin@example.com`
- 登录密码：`admin123456`

如果当前目录的 `.env` 中配置了 `ADMIN_SEED_EMAIL`、`ADMIN_SEED_PASSWORD`，则仅在开发 seed 创建新账号时使用。生产环境禁止运行 seed；请通过一次性 `ADMIN_INITIAL_EMAIL`、`ADMIN_INITIAL_USERNAME`、`ADMIN_INITIAL_PASSWORD` 环境变量执行：

```bash
ADMIN_INITIAL_EMAIL=admin@todo.example.com \
ADMIN_INITIAL_USERNAME=admin \
ADMIN_INITIAL_PASSWORD='replace-with-a-32+-character-random-secret' \
npm run provision:admin
```

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

完成迁移后，使用仓库根目录的 `make seed-admin` 创建本地开发管理员账号，默认登录名为 `admin`，密码为 `admin123456`。生产环境使用上面的 `provision:admin` 命令。

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

生产部署只使用基础 Compose 文件，并通过外部环境或 Secret Manager 注入所有必填变量；缺少数据库凭据、外部地址、CORS 白名单或任一密钥时，Compose 会在创建容器前失败。`docker-compose.development.yml` 仅供宿主机运行 Prisma/Nest 的本地开发命令使用，会把 PostgreSQL 绑定到回环地址。

在当前目录执行：

```bat
docker compose up --build
```

Compose 默认只把明文 HTTP 端口发布到宿主机回环地址，供同机 TLS 终止代理转发：

- 后端接口：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`
- 健康检查：`http://localhost:3000/health`

不要将该 HTTP 端口直接暴露到公网。生产公网入口应由反向代理提供 HTTPS；只有网络边界另有等效保护时，才显式设置 `SERVER_BIND_ADDRESS` 覆盖默认回环绑定。

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
npm run provision:admin
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
