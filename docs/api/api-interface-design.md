# CloudTodo API 设计规范

> 本文档从零定义 CloudTodo 的新接口，不兼容或继承历史接口。后续服务端、客户端、数据库和测试均以本文档为准。

## 1. 产品边界

CloudTodo 是一个面向个人私有、小范围熟人或家庭自部署场景的 Todo 与提醒服务。

一个部署实例可以由朋友或家人共同使用，但每个人都拥有完全独立的私人账号空间。多个账号之间只有“共用同一服务端”这一关系，不产生团队、成员、共享或协作关系。

本版本支持：

- 朋友或家人共用一个服务端
- 相互隔离的个人账号空间
- 每个用户在多个设备或客户端上登录
- Todo、清单、标签、提醒和通知配置
- 客户端增量同步
- 管理员管理用户和设备
- SQLite 单实例部署

## 2. 基础约定

### 2.1 API 根路径

```text
/api
```

所有接口使用 HTTPS；本地开发可以使用 HTTP。

### 2.2 数据格式

- 请求和响应使用 `application/json; charset=utf-8`
- 字段使用 `snake_case`
- ID 使用 UUID 字符串
- 时间使用 UTC RFC 3339 字符串，例如 `2026-09-18T08:30:00Z`
- 布尔值使用 JSON boolean
- 空值使用 `null`
- 服务端不接受客户端提交的 `user_id` 作为数据归属依据
- 未提供 `timezone` 时默认使用 `Asia/Shanghai`（UTC+08:00）

### 2.3 统一成功响应

```json
{
  "code": "OK",
  "message": "success",
  "data": {},
  "request_id": "req_01J..."
}
```

### 2.4 统一错误响应

```json
{
  "code": "TODO_NOT_FOUND",
  "message": "todo not found",
  "details": null,
  "request_id": "req_01J..."
}
```

HTTP 状态码和业务错误码同时返回：

| HTTP 状态 | 含义 |
| --- | --- |
| 400 | 请求格式或字段校验失败 |
| 401 | 未登录、会话失效或凭据错误 |
| 403 | 已登录但无权执行操作 |
| 404 | 资源不存在，或资源不属于当前用户 |
| 409 | 资源版本冲突或唯一性冲突 |
| 413 | 请求体过大 |
| 429 | 请求频率过高 |
| 500 | 服务端内部错误 |

客户端只根据 `code` 判断业务分支，不解析 `message`。

## 3. 用户和会话

### 3.1 用户规则

- `email` 全局唯一
- `username` 全局唯一
- 普通用户只能访问自己的数据
- 管理员是独立角色，不参与普通用户数据共享
- 禁用用户后，所有该用户会话立即失效

### 3.2 认证方式

使用服务端生成的不可预测会话令牌：

- `access_token`：短期访问令牌，默认 30 分钟
- `refresh_token`：长期刷新令牌，默认 30 天
- 服务端只保存令牌哈希，不保存明文令牌
- 每次刷新都轮换 refresh token
- refresh token 按设备独立保存

Web 客户端使用 HttpOnly Cookie；原生客户端使用安全的本地凭据存储，并通过：

```http
Authorization: Bearer <access_token>
```

### 3.3 注册

```http
POST /api/auth/register
```

请求：

```json
{
  "email": "user@example.com",
  "username": "alice",
  "password": "a-strong-password",
  "nickname": "Alice",
  "timezone": "Asia/Shanghai",
  "device": {
    "identifier": "install-01J...",
    "platform": "windows",
    "name": "Alice Windows",
    "app_version": "1.0.0"
  }
}
```

响应数据：

```json
{
  "user": {},
  "device": {},
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "access_expires_at": "2026-09-18T09:00:00Z",
    "refresh_expires_at": "2026-10-18T08:30:00Z"
  }
}
```

### 3.4 登录

```http
POST /api/auth/login
```

请求：

```json
{
  "account": "alice",
  "password": "a-strong-password",
  "device": {
    "identifier": "install-01J...",
    "platform": "android",
    "name": "Alice Phone",
    "app_version": "1.0.0"
  }
}
```

同一个用户可以拥有多个设备。相同的 `(user_id, device.identifier)` 登录时更新设备信息，不产生重复设备记录。

### 3.5 刷新会话

```http
POST /api/auth/refresh
```

请求体：

```json
{
  "refresh_token": "..."
}
```

刷新成功后返回新的 access token 和 refresh token，旧 refresh token 立即失效。

### 3.6 退出当前设备

```http
POST /api/auth/logout
```

请求体：

```json
{
  "refresh_token": "..."
}
```

只撤销当前 refresh token，不影响同一用户的其他设备。

### 3.7 退出所有设备

```http
POST /api/auth/logout-all
```

需要当前密码或当前会话二次确认。成功后撤销当前用户的全部会话。

### 3.8 当前用户和密码

```http
GET  /api/me
PATCH /api/me
POST /api/me/change-password
```

`PATCH /me` 允许修改：

```json
{
  "nickname": "Alice",
  "timezone": "Asia/Shanghai"
}
```

修改密码成功后撤销全部旧会话，当前客户端需要重新登录。

## 4. 设备接口

### 4.1 查询设备

```http
GET /api/devices
```

### 4.2 注册或更新设备

```http
PUT /api/devices/current
```

请求：

```json
{
  "identifier": "install-01J...",
  "platform": "linux",
  "name": "Home Linux",
  "app_version": "1.0.0",
  "push_token": null
}
```

该接口按当前用户和 `identifier` 幂等更新。

### 4.3 设备心跳

```http
POST /api/devices/current/heartbeat
```

### 4.4 删除设备

```http
DELETE /api/devices/{device_id}
```

删除设备会撤销该设备的全部会话，不影响当前用户的其他设备和业务数据。

## 5. Todo 清单和标签

### 5.1 清单

```http
GET    /api/lists
POST   /api/lists
GET    /api/lists/{list_id}
PATCH  /api/lists/{list_id}
DELETE /api/lists/{list_id}
```

创建请求：

```json
{
  "name": "工作",
  "color": "#0F766E",
  "sort_order": 0
}
```

删除清单不会删除其中的 Todo，Todo 的 `list_id` 会变为 `null`。

### 5.2 标签

```http
GET    /api/tags
POST   /api/tags
GET    /api/tags/{tag_id}
PATCH  /api/tags/{tag_id}
DELETE /api/tags/{tag_id}
```

删除标签不会删除 Todo。

## 6. Todo 接口

### 6.1 列表

```http
GET /api/todos
```

查询参数：

| 参数 | 说明 |
| --- | --- |
| `cursor` | 下一页游标，可选 |
| `limit` | 每页数量，默认 50，最大 100 |
| `status` | `pending`、`completed`、`archived`、`deleted` |
| `list_id` | 清单 ID |
| `tag_id` | 标签 ID |
| `keyword` | 标题和描述搜索 |
| `due_from` | 截止时间起点 |
| `due_to` | 截止时间终点 |
| `updated_after` | 更新时间起点 |

响应：

```json
{
  "items": [],
  "next_cursor": "...",
  "has_more": true
}
```

### 6.2 创建

```http
POST /api/todos
```

```json
{
  "title": "购买牛奶",
  "description": null,
  "list_id": "uuid-or-null",
  "tag_ids": [],
  "priority": "medium",
  "due_at": "2026-09-19T12:00:00Z",
  "is_all_day": false
}
```

### 6.3 查询、修改、删除

```http
GET    /api/todos/{todo_id}
PATCH  /api/todos/{todo_id}
DELETE /api/todos/{todo_id}
```

修改使用部分更新：

```json
{
  "title": "购买牛奶和面包",
  "status": "completed",
  "version": 3
}
```

`version` 必须与服务端当前版本一致，否则返回 `409 TODO_VERSION_CONFLICT`。不允许跨用户使用 Todo ID。

删除是逻辑删除，删除记录必须进入同步结果。

## 7. 提醒接口

### 7.1 Todo 下的提醒

```http
GET  /api/todos/{todo_id}/reminders
POST /api/todos/{todo_id}/reminders
```

创建请求：

```json
{
  "channels": ["local", "webhook", "email", "telegram"],
  "remind_at": "2026-09-19T08:00:00Z",
  "repeat": {
    "type": "none",
    "rule": null
  }
}
```

`channels` 是数组，可以同时选择多个通知渠道：

- `local`：当前客户端本地通知，不依赖服务端通知提供商
- `webhook`：用户在客户端配置 Webhook 地址，由服务端投递
- `email`：用户在客户端配置收件邮箱，由服务端 SMTP 投递
- `telegram`：用户在客户端配置 Telegram Chat ID，由服务端机器人投递

### 7.2 提醒维护

```http
GET    /api/reminders/upcoming
GET    /api/reminders/{reminder_id}
PATCH  /api/reminders/{reminder_id}
DELETE /api/reminders/{reminder_id}
```

### 7.3 客户端提醒事件

```http
GET  /api/reminder-events?cursor=...
POST /api/reminder-events/{event_id}/ack
```

客户端确认事件后，服务端不得再次返回同一事件。

## 8. 通知渠道与订阅

### 8.1 渠道归属

| 渠道 | 配置位置 | 服务端要求 |
| --- | --- | --- |
| `local` | 客户端本地设置 | 不需要服务端提供商 |
| `webhook` | 客户端填写地址 | 服务端负责安全校验、模板渲染和投递 |
| `email` | 客户端填写邮箱；管理员配置邮件服务 | 服务端配置 SMTP 并负责退订 |
| `telegram` | 客户端填写 Chat ID；管理员配置机器人 | 服务端配置 Telegram Bot Token |

服务端使用内置通知模板，不向普通客户端开放模板编辑。模板由服务端按渠道生成：

- Webhook：JSON 请求体
- Email：邮件主题、纯文本正文和 HTML 正文
- Telegram：机器人消息文本

### 8.2 用户通知订阅

```http
GET    /api/notification-subscriptions
PUT    /api/notification-subscriptions/webhook
PUT    /api/notification-subscriptions/email
PUT    /api/notification-subscriptions/telegram
DELETE /api/notification-subscriptions/{subscription_id}
POST   /api/notification-subscriptions/{subscription_id}/test
```

#### Webhook 订阅

```json
{
  "enabled": true,
  "name": "家庭 Webhook",
  "target_url": "https://example.com/hook",
  "secret": "optional-secret"
}
```

#### Email 订阅

```json
{
  "enabled": true,
  "email": "user@example.com"
}
```

#### Telegram 订阅

```json
{
  "enabled": true,
  "chat_id": "123456789"
}
```

规则：

- 一个用户可以同时配置多个渠道
- 订阅配置只属于当前用户
- Webhook 地址和 secret 只返回脱敏结果
- SMTP 密码和 Telegram Bot Token 永远不返回给客户端
- 客户端只负责填写用户侧信息，不能修改服务端提供商配置

### 8.3 服务端邮件和 Telegram 配置

服务端管理接口：

```http
GET   /api/admin/notification-providers/email
PATCH /api/admin/notification-providers/email
POST  /api/admin/notification-providers/email/test
GET   /api/admin/notification-providers/telegram
PATCH /api/admin/notification-providers/telegram
POST  /api/admin/notification-providers/telegram/test
```

邮件服务配置：

```json
{
  "enabled": true,
  "smtp_host": "smtp.example.com",
  "smtp_port": 465,
  "security": "ssl",
  "username": "notify@example.com",
  "password": "smtp-password",
  "from_name": "CloudTodo",
  "from_address": "notify@example.com"
}
```

Telegram 服务配置：

```json
{
  "enabled": true,
  "bot_token": "telegram-bot-token",
  "bot_name": "cloudtodo_bot"
}
```

管理接口只返回配置状态、主机、端口、发件人和机器人名称等非敏感信息；密码和 Bot Token 只允许写入或替换，不允许读取。

### 8.4 邮件退订

每封通知邮件必须包含：

- 页面退订链接
- `List-Unsubscribe` 头
- 支持一键退订的 `List-Unsubscribe-Post` 头

退订接口：

```http
GET  /api/notifications/email/unsubscribe?token={unsubscribe_token}
POST /api/notifications/email/unsubscribe
```

退订令牌必须是有签名、有时效、只针对单个用户邮箱订阅的令牌。退订成功后：

- 只关闭该用户的 Email 订阅
- 不删除用户账号
- 不影响 Webhook、Telegram 或本地通知
- 用户可以在客户端重新开启 Email 订阅

如果服务端邮件提供商未配置，Email 渠道测试和实际投递返回 `EMAIL_PROVIDER_NOT_CONFIGURED`；Telegram 同理返回 `TELEGRAM_PROVIDER_NOT_CONFIGURED`。
## 9. 增量同步

同步接口只同步当前用户的数据，不支持跨用户同步。

### 9.1 初始化同步

```http
GET /api/sync/bootstrap
```

响应：

```json
{
  "snapshot_at": "2026-09-18T08:30:00Z",
  "cursor": "cursor_...",
  "lists": [],
  "tags": [],
  "todos": [],
  "reminders": [],
  "notification_subscriptions": []
}
```

### 9.2 拉取变化

```http
GET /api/sync/changes?cursor={cursor}&limit=100
```

响应：

```json
{
  "items": [
    {
      "collection": "todos",
      "operation": "upsert",
      "id": "todo-uuid",
      "version": 4,
      "updated_at": "2026-09-18T08:31:00Z",
      "data": {}
    },
    {
      "collection": "todos",
      "operation": "delete",
      "id": "deleted-todo-uuid",
      "version": 5,
      "updated_at": "2026-09-18T08:32:00Z",
      "data": null
    }
  ],
  "next_cursor": "cursor_...",
  "has_more": false
}
```

同步实现要求：

- 变化记录必须保留逻辑删除信息
- 游标只对当前用户有效
- 服务端在一次请求中使用稳定的数据库水位点
- 客户端收到版本冲突时重新拉取资源后再提交

## 10. 管理接口
### 10.1 管理员认证

管理员接口使用独立的管理员会话，不复用普通用户会话。

管理员登录成功的条件：

- 账号存在
- `role = admin`
- `status = active`
- 密码验证成功
- 未触发登录限流

接口：

```http
POST /api/admin/auth/login
POST /api/admin/auth/refresh
GET  /api/admin/auth/me
POST /api/admin/auth/logout
POST /api/admin/auth/logout-all
POST /api/admin/auth/change-password
```

登录请求：

```json
{
  "account": "admin",
  "password": "strong-password"
}
```

登录响应：

```json
{
  "admin": {
    "id": "admin-uuid",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "status": "active"
  },
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "access_expires_at": "2026-09-18T09:00:00Z",
    "refresh_expires_at": "2026-10-18T08:30:00Z"
  }
}
```

管理员会话规则：

- 管理员 access token 和 refresh token 使用独立的签名或存储命名空间
- 普通用户 token 不能访问 `/api/admin/*`
- 管理员 token 不能作为普通用户身份访问用户业务接口
- `logout` 只撤销当前管理员会话
- `logout-all` 撤销当前管理员的全部会话
- 管理员修改密码后撤销旧会话，当前客户端需要重新登录
- 管理员被禁用后，所有管理员会话立即失效
- Cookie 模式必须校验 CSRF；Bearer 模式必须校验 Authorization 令牌
- 登录、刷新、改密和高风险管理操作必须限流

未登录或非管理员访问管理 API 时返回：

```json
{
  "code": "ADMIN_AUTH_REQUIRED",
  "message": "administrator authentication required",
  "details": null,
  "request_id": "req_01J..."
}
```

### 10.2 管理员用户管理

管理接口独立使用：

```text
/api/admin
```

至少包含：

```http
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET  /api/admin/users
POST /api/admin/users
GET  /api/admin/users/{user_id}
PATCH /api/admin/users/{user_id}
POST /api/admin/users/{user_id}/disable
POST /api/admin/users/{user_id}/enable
POST /api/admin/users/{user_id}/reset-password
GET  /api/admin/users/{user_id}/devices
GET  /api/admin/audit-logs
```

管理员接口不能提供普通用户之间的共享或协作操作。

## 11. SQLite 实现约束

本版本按单实例自部署设计，不要求 Redis、消息队列或 PostgreSQL。

SQLite 必须启用：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

数据约束：

- 用户业务表必须包含 `user_id`
- 资源 ID 使用 UUID 文本
- JSON 字段使用 SQLite JSON 文本格式
- 所有写操作使用事务
- 所有带版本号的更新使用条件更新
- `user_id + updated_at + id` 建立同步索引
- 调度器只允许单实例运行
- 数据库文件、备份文件和附件目录分开管理

## 12. 安全要求

- 密码只保存强哈希结果
- refresh token 只保存哈希结果
- 登录、刷新、密码修改和管理员登录限流
- 所有资源查询必须绑定当前用户
- Webhook URL 必须进行出站地址校验
- 日志不得输出密码、token、Webhook secret
- 管理员高风险操作必须记录审计日志
- 删除默认使用逻辑删除，确保多端同步能够收到删除事件

## 13. 验收标准

### 多用户

- 用户 A 无法读取、修改或删除用户 B 的任何资源
- 用户 A 的同步游标无法读取用户 B 的变化
- 用户 A 无法读取用户 B 的设备和通知方式

### 多端

- 一个用户可以在多个端同时保持有效会话
- 一个端退出不影响其他端
- 一个端创建的 Todo 可以被其他端同步获取
- 删除一个设备只撤销该设备会话

### 自部署

- 单个服务进程可以直接运行
- 只依赖 SQLite 即可完成核心功能
- 不要求 Redis、Kafka 或独立消息队列
- 服务重启后会话、Todo、提醒和同步游标仍然有效

## 14. 冻结级数据契约

本章补充所有接口共用的数据结构。未特别说明时，接口返回的数据对象均使用这些字段。

### 14.1 User

普通用户响应：

```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "username": "alice",
  "nickname": "Alice",
  "timezone": "Asia/Shanghai",
  "created_at": "2026-09-18T08:30:00Z",
  "updated_at": "2026-09-18T08:30:00Z"
}
```

管理接口可以额外返回：

```json
{
  "role": "user",
  "status": "active",
  "last_login_at": "2026-09-18T08:30:00Z"
}
```

永远不返回：

- `password_hash`
- 明文 refresh token
- Webhook secret
- SMTP password
- Telegram Bot Token

### 14.2 Device

```json
{
  "id": "device-uuid",
  "identifier": "install-01J...",
  "platform": "windows",
  "name": "Alice Windows",
  "app_version": "1.0.0",
  "last_active_at": "2026-09-18T08:30:00Z",
  "is_online": true,
  "created_at": "2026-09-18T08:30:00Z",
  "updated_at": "2026-09-18T08:30:00Z"
}
```

`identifier` 由客户端安装实例生成并持久化。同一用户的不同设备必须使用不同标识。

### 14.3 Todo

```json
{
  "id": "todo-uuid",
  "list_id": "list-uuid",
  "tag_ids": ["tag-uuid"],
  "title": "购买牛奶",
  "description": null,
  "status": "pending",
  "priority": "medium",
  "due_at": "2026-09-19T12:00:00Z",
  "is_all_day": false,
  "version": 1,
  "created_at": "2026-09-18T08:30:00Z",
  "updated_at": "2026-09-18T08:30:00Z",
  "deleted_at": null
}
```

### 14.4 Reminder

```json
{
  "id": "reminder-uuid",
  "todo_id": "todo-uuid",
  "channels": ["local", "email"],
  "remind_at": "2026-09-19T08:00:00Z",
  "repeat": {
    "type": "none",
    "rule": null
  },
  "status": "pending",
  "version": 1,
  "created_at": "2026-09-18T08:30:00Z",
  "updated_at": "2026-09-18T08:30:00Z",
  "deleted_at": null
}
```

### 14.5 NotificationSubscription

```json
{
  "id": "subscription-uuid",
  "channel": "email",
  "enabled": true,
  "email": "user@example.com",
  "target_url": null,
  "chat_id": null,
  "secret_configured": false,
  "last_delivery_at": null,
  "last_error_code": null,
  "version": 1,
  "created_at": "2026-09-18T08:30:00Z",
  "updated_at": "2026-09-18T08:30:00Z"
}
```

不同渠道只返回对应字段；未使用字段返回 `null`。Webhook 的 `secret` 只返回 `secret_configured`。

### 14.6 分页结果

所有列表接口统一返回：

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

约束：

- 默认 `limit = 50`
- 最大 `limit = 100`
- `cursor` 是不透明字符串，客户端不得解析或修改
- 游标只对当前用户和当前数据集合有效

## 15. 完整接口清单

### 15.1 用户接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册并创建首个设备会话 |
| POST | `/api/auth/login` | 登录并创建或更新设备会话 |
| POST | `/api/auth/refresh` | 轮换当前 refresh token |
| POST | `/api/auth/logout` | 退出当前设备 |
| POST | `/api/auth/logout-all` | 退出当前用户全部设备 |
| GET | `/api/me` | 当前用户资料 |
| PATCH | `/api/me` | 修改当前用户资料 |
| POST | `/api/me/change-password` | 修改密码并撤销旧会话 |
|
### 15.2 设备接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/devices` | 当前用户的设备列表 |
| PUT | `/api/devices/current` | 注册或更新当前设备 |
| POST | `/api/devices/current/heartbeat` | 更新当前设备活跃时间 |
| DELETE | `/api/devices/{device_id}` | 删除设备并撤销该设备会话 |
|
### 15.3 Todo 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/lists` | 清单列表 |
| POST | `/api/lists` | 创建清单 |
| GET/PATCH/DELETE | `/api/lists/{list_id}` | 清单查询、修改、删除 |
| GET | `/api/tags` | 标签列表 |
| POST | `/api/tags` | 创建标签 |
| GET/PATCH/DELETE | `/api/tags/{tag_id}` | 标签查询、修改、删除 |
| GET | `/api/todos` | Todo 分页查询 |
| POST | `/api/todos` | 创建 Todo |
| GET/PATCH/DELETE | `/api/todos/{todo_id}` | Todo 查询、修改、删除 |
|
### 15.4 提醒和通知接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/todos/{todo_id}/reminders` | 查询或创建 Todo 提醒 |
| GET/PATCH/DELETE | `/api/reminders/{reminder_id}` | 提醒查询、修改、删除 |
| GET | `/api/reminders/upcoming` | 查询近期提醒 |
| GET | `/api/reminder-events` | 查询待处理提醒事件 |
| POST | `/api/reminder-events/{event_id}/ack` | 确认提醒事件 |
| GET | `/api/notification-subscriptions` | 查询用户通知订阅 |
| PUT | `/api/notification-subscriptions/{channel}` | 配置一个渠道 |
| DELETE | `/api/notification-subscriptions/{subscription_id}` | 删除订阅 |
| POST | `/api/notification-subscriptions/{subscription_id}/test` | 测试订阅投递 |
| GET | `/api/notifications/email/unsubscribe` | 邮件页面退订 |
| POST | `/api/notifications/email/unsubscribe` | 邮件一键退订 |
|
### 15.5 同步接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sync/bootstrap` | 获取当前用户完整快照 |
| GET | `/api/sync/changes` | 获取当前用户增量变化 |
|
### 15.6 管理接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/auth/login` | 管理员登录 |
| POST | `/api/admin/auth/refresh` | 管理员刷新会话 |
| GET | `/api/admin/auth/me` | 当前管理员会话 |
| POST | `/api/admin/auth/logout` | 退出当前管理员设备 |
| POST | `/api/admin/auth/logout-all` | 退出管理员全部设备 |
| POST | `/api/admin/auth/change-password` | 修改管理员密码 |
| GET | `/api/admin/users` | 用户分页查询 |
| POST | `/api/admin/users` | 创建普通用户 |
| GET/PATCH | `/api/admin/users/{user_id}` | 查询或修改用户资料 |
| POST | `/api/admin/users/{user_id}/disable` | 禁用用户 |
| POST | `/api/admin/users/{user_id}/enable` | 启用用户 |
| POST | `/api/admin/users/{user_id}/reset-password` | 重置用户密码 |
| GET | `/api/admin/users/{user_id}/devices` | 查看用户设备 |
| GET | `/api/admin/audit-logs` | 查询管理员审计日志 |
| GET/PATCH | `/api/admin/notification-providers/email` | 查询或配置 SMTP |
| POST | `/api/admin/notification-providers/email/test` | 测试邮件服务 |
| GET/PATCH | `/api/admin/notification-providers/telegram` | 查询或配置 Telegram Bot |
| POST | `/api/admin/notification-providers/telegram/test` | 测试 Telegram Bot |
|
### 15.7 支撑接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务健康检查，无需登录 |
| GET | `/api/capabilities` | 当前服务能力和渠道状态 |
| GET | `/api/me/export` | 导出当前用户数据 |
| DELETE | `/api/me` | 删除当前用户账号和数据 |
| GET | `/api/notification-deliveries` | 查询当前用户投递记录 |
| GET | `/api/notification-deliveries/{delivery_id}` | 查询单条投递记录 |
| GET | `/api/admin/system/status` | 查询服务端系统和提供商状态 |
## 16. 写操作、幂等和并发

### 16.1 版本控制

所有可修改资源都有整数 `version`。客户端修改时必须提交当前版本：

```json
{
  "title": "新的标题",
  "version": 3
}
```

版本不匹配返回：

```json
{
  "code": "RESOURCE_VERSION_CONFLICT",
  "message": "resource version conflict",
  "details": {
    "resource_id": "todo-uuid",
    "current_version": 4
  },
  "request_id": "req_01J..."
}
```

客户端应先重新获取资源，再由用户或客户端重新提交修改。

### 16.2 幂等请求

以下 POST 接口支持 `Idempotency-Key`：

- 注册
- 创建 Todo、清单、标签和提醒
- 创建或测试通知订阅
- 管理员创建用户
- 管理员密码重置
- 邮件和 Telegram 服务测试

同一用户在有效期内重复提交相同 key，服务端返回第一次请求的结果，不重复创建或投递。

### 16.3 删除

- 普通业务资源使用逻辑删除
- 删除操作产生同步删除事件
- 物理清理由服务端定期维护任务执行
- 物理清理前不得使仍在有效同步窗口内的客户端丢失删除事件

## 17. 通知投递模型

### 17.1 通知事件

所有服务端通知使用统一事件模型：

```json
{
  "event_id": "event-uuid",
  "event_type": "reminder.triggered",
  "triggered_at": "2026-09-19T08:00:00Z",
  "user": {
    "id": "user-uuid",
    "timezone": "Asia/Shanghai"
  },
  "todo": {
    "id": "todo-uuid",
    "title": "购买牛奶",
    "status": "pending",
    "priority": "medium"
  },
  "reminder": {
    "id": "reminder-uuid",
    "scheduled_for": "2026-09-19T08:00:00Z"
  }
}
```

### 17.2 Webhook

请求头：

```http
X-CloudTodo-Event: reminder.triggered
X-CloudTodo-Event-Id: event-uuid
X-CloudTodo-Timestamp: 2026-09-19T08:00:00Z
X-CloudTodo-Signature: sha256=...
```

签名原文：

```text
timestamp + "." + event_id + "." + request_body
```

服务端默认最多投递 3 次，采用递增退避；最终失败后记录 `dead_letter` 状态，不无限重试。

### 17.3 Email 和 Telegram

- Email 使用服务端内置模板，并自动附加退订信息
- Telegram 使用服务端内置文本模板
- 提供商未配置时不创建成功投递记录
- 每次投递记录渠道、订阅 ID、事件 ID、状态、响应摘要和错误码
- 同一个 `event_id + subscription_id` 不得重复成功投递

## 18. 错误码

### 18.1 认证错误

| 错误码 | 说明 |
| --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 用户名或密码错误 |
| `AUTH_REQUIRED` | 需要普通用户登录 |
| `ADMIN_AUTH_REQUIRED` | 需要管理员登录 |
| `SESSION_EXPIRED` | 会话已过期 |
| `SESSION_REVOKED` | 会话已撤销 |
| `REFRESH_TOKEN_REUSED` | 检测到 refresh token 重放 |
| `RATE_LIMITED` | 超过请求频率限制 |

### 18.2 资源错误

| 错误码 | 说明 |
| --- | --- |
| `RESOURCE_NOT_FOUND` | 资源不存在或不属于当前用户 |
| `RESOURCE_VERSION_CONFLICT` | 资源版本冲突 |
| `VALIDATION_ERROR` | 请求字段不合法 |
| `DUPLICATE_RESOURCE` | 资源唯一性冲突 |
| `INVALID_CURSOR` | 游标无效或已过期 |

### 18.3 通知错误

| 错误码 | 说明 |
| --- | --- |
| `WEBHOOK_URL_REJECTED` | Webhook 地址未通过安全校验 |
| `WEBHOOK_DELIVERY_FAILED` | Webhook 投递失败 |
| `EMAIL_PROVIDER_NOT_CONFIGURED` | 服务端未配置 SMTP |
| `EMAIL_DELIVERY_FAILED` | 邮件投递失败 |
| `TELEGRAM_PROVIDER_NOT_CONFIGURED` | 服务端未配置 Telegram Bot |
| `TELEGRAM_DELIVERY_FAILED` | Telegram 投递失败 |
| `EMAIL_UNSUBSCRIBE_TOKEN_INVALID` | 邮件退订令牌无效或过期 |

## 19. 请求限制

默认限制：

| 项目 | 限制 |
| --- | --- |
| 用户名 | 3-64 个字符 |
| 昵称 | 不超过 64 个字符 |
| Todo 标题 | 不超过 200 个字符 |
| Todo 描述 | 不超过 20,000 个字符 |
| Webhook URL | 不超过 2,048 个字符 |
| Webhook 请求体 | 不超过 256 KB |
| 分页数量 | 默认 50，最大 100 |
| 单用户 Webhook 订阅 | 默认最多 10 个 |

服务端必须对密码、token、Webhook URL、SMTP 配置和 Bot Token 设置独立的大小限制。

## 20. 接口完成标准

接口进入实现阶段前必须满足：

- 每个 endpoint 已定义方法、路径、鉴权方式、请求字段、响应字段和错误码
- 每个资源都有用户归属规则和版本字段
- 所有通知渠道都有配置来源、投递模板、失败状态和重试规则
- Email 具备退订和重新订阅闭环
- 管理员接口具备独立会话和权限校验
- 同步接口具备稳定游标、删除事件和冲突处理
- SQLite 单实例可以在不依赖外部服务的情况下完成核心流程
- 客户端和服务端可以分别根据本文档独立开发和测试
## 21. 支撑接口

### 21.1 服务健康检查

```http
GET /health
```

该接口不要求登录，供 Docker、反向代理和外部监控使用。

正常响应：

```json
{
  "status": "ok",
  "service": "cloudtodo",
  "version": "0.1.0",
  "database": "ok",
  "time": "2026-09-18T08:30:00Z"
}
```

数据库不可用时返回 HTTP `503`，并将 `status` 设置为 `unhealthy`。响应不得暴露数据库连接串或内部错误堆栈。

### 21.2 客户端能力查询

```http
GET /api/capabilities
```

需要普通用户登录。用于客户端决定显示哪些配置项。

响应：

```json
{
  "server_version": "0.1.0",
  "api_base": "/api",
  "channels": {
    "local": true,
    "webhook": true,
    "email": true,
    "telegram": false
  },
  "limits": {
    "max_todos_per_page": 100,
    "max_webhook_subscriptions": 10
  },
  "features": {
    "data_export": true,
    "account_deletion": true,
    "incremental_sync": true
  }
}
```

`email` 和 `telegram` 的值只表示服务端提供商是否已配置，不返回 SMTP 或 Bot 凭据。

### 21.3 用户数据导出

```http
GET /api/me/export
```

需要普通用户登录。返回当前用户的完整数据包：

```json
{
  "format": "cloudtodo-json",
  "version": 1,
  "exported_at": "2026-09-18T08:30:00Z",
  "user": {},
  "lists": [],
  "tags": [],
  "todos": [],
  "reminders": [],
  "notification_subscriptions": []
}
```

约束：

- 只导出当前用户数据
- 不导出密码、会话令牌、Webhook secret、SMTP 配置和 Telegram Bot Token
- 大数据量时可以改为异步导出任务，但 v1 可直接返回 JSON
- 导出接口必须限流

### 21.4 删除当前账号

```http
DELETE /api/me
```

请求：

```json
{
  "password": "current-password",
  "confirmation": "DELETE"
}
```

删除规则：

- 必须通过当前密码或等价的二次确认
- 撤销当前用户全部会话
- 删除或逻辑删除该用户的 Todo、提醒、清单、标签、设备和通知订阅
- 不删除管理员审计日志中的必要记录
- 删除完成后当前客户端回到登录页
- 重复删除返回 `RESOURCE_NOT_FOUND`，不得泄露账号状态

### 21.5 通知投递记录

```http
GET /api/notification-deliveries?cursor=...&limit=50
GET /api/notification-deliveries/{delivery_id}
```

列表返回：

```json
{
  "id": "delivery-uuid",
  "event_id": "event-uuid",
  "subscription_id": "subscription-uuid",
  "channel": "email",
  "status": "success",
  "attempt_count": 1,
  "response_code": 250,
  "error_code": null,
  "created_at": "2026-09-19T08:00:00Z",
  "completed_at": "2026-09-19T08:00:02Z"
}
```

用户只能查看自己的投递记录。响应不得包含：

- SMTP 密码
- Telegram Bot Token
- Webhook secret
- 完整 Webhook 请求头中的认证信息
- 超过限制长度的第三方响应正文

### 21.6 管理员系统状态

```http
GET /api/admin/system/status
```

需要管理员会话。响应：

```json
{
  "server_version": "0.1.0",
  "database": {
    "engine": "sqlite",
    "status": "ok",
    "size_bytes": 123456
  },
  "providers": {
    "email": {
      "enabled": true,
      "configured": true,
      "last_test_at": "2026-09-18T08:30:00Z"
    },
    "telegram": {
      "enabled": false,
      "configured": false,
      "bot_name": null,
      "last_test_at": null
    }
  },
  "scheduler": {
    "enabled": true,
    "last_run_at": "2026-09-18T08:30:00Z",
    "last_error": null
  }
}
```

该接口不得返回：

- 数据库路径
- 数据库连接信息
- SMTP 密码
- Telegram Bot Token
- 服务器操作系统敏感信息

## 22. 补充错误码

| 错误码 | 说明 |
| --- | --- |
| `SERVICE_UNHEALTHY` | 服务或数据库不可用 |
| `EXPORT_NOT_ALLOWED` | 当前账号不允许导出 |
| `ACCOUNT_DELETE_CONFIRMATION_REQUIRED` | 缺少账号删除确认 |
| `ACCOUNT_DELETE_PASSWORD_INVALID` | 删除账号时密码错误 |
| `DELIVERY_NOT_FOUND` | 投递记录不存在或不属于当前用户 |
| `PROVIDER_NOT_CONFIGURED` | 服务端通知提供商未配置 |
| `SYSTEM_STATUS_UNAVAILABLE` | 系统状态暂时不可用 |

## 23. 管理 Web 承载方式

管理 Web 不单独部署前端项目，由 Go 服务端直接提供页面和静态资源。

建议目录：

```text
server/
├─ admin/
│  ├─ index.html
│  ├─ login.html
│  ├─ style.css
│  └─ app.js
├─ internal/
└─ main.go
```

访问路径：

```text
GET /admin
GET /admin/login
```

管理 API：

```text
/api/admin/*
```

### 23.1 页面和 API 关系

- `/admin` 由 Go 服务端返回管理页面
- `/admin/login` 由 Go 服务端返回管理员登录页面
- 页面通过同源请求访问 `/api/admin/*`
- API 始终返回 JSON，不返回管理页面 HTML
- 管理页面不放入 Flutter 客户端
- 不需要独立的 React、Vue、Nginx 或前端部署服务

管理页面可以采用以下任一实现方式：

- Go `html/template` 服务端渲染
- Go `embed.FS` 嵌入 HTML、CSS、JavaScript
- Go 直接托管 `server/admin/` 静态文件

### 23.2 管理页面鉴权

未登录访问：

```text
GET /admin        -> 跳转 /admin/login
GET /api/admin/*  -> 401 ADMIN_AUTH_REQUIRED
```

登录成功后：

1. 页面提交 `POST /api/admin/auth/login`。
2. 服务端签发独立管理员会话 Cookie。
3. 页面后续请求携带管理员 Cookie。
4. 非管理员用户即使拥有普通用户会话，也不能访问管理 API。
5. 管理员退出或会话失效后，页面跳转回 `/admin/login`。

Cookie 模式要求：

- `HttpOnly`
- `Secure`（生产环境）
- `SameSite=Lax` 或更严格
- 管理员会话和普通用户会话使用不同 Cookie 名称
- 所有非安全方法校验 CSRF

### 23.3 管理页面最低功能

- 管理员登录和退出
- 当前管理员信息
- 用户列表和搜索
- 创建用户
- 修改用户资料
- 禁用和启用用户
- 重置用户密码
- 查看用户设备
- 查看通知服务商状态
- 查看系统状态
- 查看审计日志

管理页面不直接操作 SQLite 文件，所有操作通过 `/api/admin/*` 完成。

### 23.4 接口结论

采用 Go 服务端托管管理 Web 后，不新增另一套前端接口，也不修改已有管理 API 路径：

- 页面路径：`/admin/*`
- 管理接口：`/api/admin/*`
- 普通用户接口：`/api/*`
- 健康检查：`/health`
