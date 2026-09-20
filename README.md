# CloudTodo

CloudTodo 是面向朋友、家人小范围自部署的个人 Todo 与提醒服务。

一个服务端可以由多个熟人共同使用，但每个人拥有完全独立的账号空间、Todo、提醒、设备和通知配置，不建立共享或协作关系。

## 当前状态

- Flutter 客户端：保留 Web、Android、Windows、Linux 工程
- 后端实现：Go + SQLite 服务端开发中
- 数据库方案：目标使用 SQLite 单实例部署
- API 规范：[CloudTodo API 设计规范](docs/api/api-interface-design.md)

## 目录

```text
CloudTodo/
├─ client/          Flutter 客户端
├─ server/          Go + SQLite 服务端
├─ docs/            API 文档
├─ scripts/         客户端启动与工具脚本
├─ .github/         客户端 CI
└─ README.md
```

## 客户端启动

安装依赖：

```bash
cd client
flutter pub get
```

启动 Flutter Web：

```bash
scripts\start-client-web.bat
```

静态检查和测试：

```bash
cd client
flutter analyze
flutter test
```

构建 Web：

```bash
cd client
flutter build web --release
```

## 新后端实现原则

- API 根路径使用 `/api`
- SQLite 单实例运行
- 多用户仅用于朋友或家人之间的账号隔离
- 每个用户可以多端登录
- 普通退出只影响当前设备
- 服务端不提供用户间共享和协作能力

后端重新实现前，以 API 文档为唯一接口依据，不恢复旧后端代码和旧接口。
