# CloudTodo Flutter Client

CloudTodo 客户端当前已完成三端统一骨架初始化，约束来自现有仓库文档：

- Web、Android、Windows 共用同一套客户端方向
- 管理后台不进入客户端，仍由后端 `/admin` 独立承载
- Web 优先走同域部署，通过 Cookie 会话访问 `/api/*`
- 原生端默认直连本机后端地址
- 运行时配置优先从 `/config.json` 读取

## 当前范围

本次初始化已落地：

- Flutter Web / Android / Windows 工程骨架
- 分层目录：`core` / `features` / `routing`
- 运行时配置加载
- 基于 Cookie 的 API 客户端与会话恢复
- 登录 / 注册页
- 应用主壳与四个一级模块入口
- Todo 列表页、完整表单创建、编辑与状态切换
- Reminder 独立模块页，以及创建、编辑、删除
- 用户资料页
- Notification Endpoint 列表、创建、编辑、删除、测试

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
└─ Dockerfile.web
```

## 本地启动

```bash
flutter pub get
flutter run -d chrome
```

如果后端按仓库推荐通过同域代理部署，默认配置无需改动。

本地直连其他地址时，修改 `web/config.json` 中的 `apiBaseUrl`。

原生端默认地址：

- Android：`http://10.0.2.2:3000/api`
- Windows：`http://127.0.0.1:3000/api`
