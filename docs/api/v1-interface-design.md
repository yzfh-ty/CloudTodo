# CloudTodo API v1 设计规范

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
/api/v1
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
POST /api/v1/auth/register
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
POST /api/v1/auth/login
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
POST /api/v1/auth/refresh
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
POST /api/v1/auth/logout
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
POST /api/v1/auth/logout-all
```

需要当前密码或当前会话二次确认。成功后撤销当前用户的全部会话。

### 3.8 当前用户和密码

```http
GET  /api/v1/me
PATCH /api/v1/me
POST /api/v1/me/change-password
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
GET /api/v1/devices
```

### 4.2 注册或更新设备

```http
PUT /api/v1/devices/current
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
POST /api/v1/devices/current/heartbeat
```

### 4.4 删除设备

```http
DELETE /api/v1/devices/{device_id}
```

删除设备会撤销该设备的全部会话，不影响当前用户的其他设备和业务数据。

## 5. Todo 清单和标签

### 5.1 清单

```http
GET    /api/v1/lists
POST   /api/v1/lists
GET    /api/v1/lists/{list_id}
PATCH  /api/v1/lists/{list_id}
DELETE /api/v1/lists/{list_id}
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
GET    /api/v1/tags
POST   /api/v1/tags
GET    /api/v1/tags/{tag_id}
PATCH  /api/v1/tags/{tag_id}
DELETE /api/v1/tags/{tag_id}
```

删除标签不会删除 Todo。

## 6. Todo 接口

### 6.1 列表

```http
GET /api/v1/todos
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
POST /api/v1/todos
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
GET    /api/v1/todos/{todo_id}
PATCH  /api/v1/todos/{todo_id}
DELETE /api/v1/todos/{todo_id}
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
GET  /api/v1/todos/{todo_id}/reminders
POST /api/v1/todos/{todo_id}/reminders
```

创建请求：

```json
{
  "channel": "local",
  "remind_at": "2026-09-19T08:00:00Z",
  "repeat": {
    "type": "none",
    "rule": null
  }
}
```

`channel` 可选：

- `local`
- `webhook`
- `both`

### 7.2 提醒维护

```http
GET    /api/v1/reminders/upcoming
GET    /api/v1/reminders/{reminder_id}
PATCH  /api/v1/reminders/{reminder_id}
DELETE /api/v1/reminders/{reminder_id}
```

### 7.3 客户端提醒事件

```http
GET  /api/v1/reminder-events?cursor=...
POST /api/v1/reminder-events/{event_id}/ack
```

客户端确认事件后，服务端不得再次返回同一事件。

## 8. 通知方式接口

```http
GET    /api/v1/notification-endpoints
POST   /api/v1/notification-endpoints
GET    /api/v1/notification-endpoints/{endpoint_id}
PATCH  /api/v1/notification-endpoints/{endpoint_id}
DELETE /api/v1/notification-endpoints/{endpoint_id}
POST   /api/v1/notification-endpoints/{endpoint_id}/test
```

创建请求：

```json
{
  "name": "个人 Webhook",
  "type": "webhook",
  "target_url": "https://example.com/hook",
  "secret": "optional-secret",
  "payload_template": "{\"title\": \"{{todo_title}}\"}",
  "enabled": true
}
```

`target_url`、`secret` 只允许当前用户访问。列表接口返回脱敏后的 URL 和密钥状态，不返回明文 secret。

## 9. 增量同步

同步接口只同步当前用户的数据，不支持跨用户同步。

### 9.1 初始化同步

```http
GET /api/v1/sync/bootstrap
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
  "notification_endpoints": []
}
```

### 9.2 拉取变化

```http
GET /api/v1/sync/changes?cursor={cursor}&limit=100
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

管理接口独立使用：

```text
/api/v1/admin
```

至少包含：

```http
POST /api/v1/admin/auth/login
POST /api/v1/admin/auth/logout
GET  /api/v1/admin/users
POST /api/v1/admin/users
GET  /api/v1/admin/users/{user_id}
PATCH /api/v1/admin/users/{user_id}
POST /api/v1/admin/users/{user_id}/disable
POST /api/v1/admin/users/{user_id}/enable
POST /api/v1/admin/users/{user_id}/reset-password
GET  /api/v1/admin/users/{user_id}/devices
GET  /api/v1/admin/audit-logs
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

## 13. v1 验收标准

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
