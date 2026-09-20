# CloudTodo Go Server

CloudTodo 服务端使用 Go + SQLite，按 [API 设计规范](../docs/api/api-interface-design.md) 提供个人空间、多用户隔离、多端会话、Todo、提醒、通知和管理接口。

## 本地启动

在 `server/` 目录执行：

```powershell
go mod download
$env:CLOUDTODO_ADMIN_EMAIL = "admin@example.com"
$env:CLOUDTODO_ADMIN_USERNAME = "admin"
$env:CLOUDTODO_ADMIN_PASSWORD = "replace-with-a-strong-password"
go run .
```

默认监听：

```text
http://localhost:3000
```

SQLite 默认文件：

```text
server/data/cloudtodo.db
```

可通过 `CLOUDTODO_DB_PATH` 修改数据库路径，`PORT` 修改监听端口。

## 检查

```powershell
gofmt -w main.go internal
go test ./...
```

健康检查：

```text
GET /health
```

管理员首次创建通过环境变量完成；如果管理员账号已存在，启动时不会覆盖密码。