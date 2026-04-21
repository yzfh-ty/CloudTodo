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

### 后端

```powershell
cd apps/server
npm install
npm run prisma:generate
npm run start:dev
```

### 客户端

```powershell
cd apps/client_flutter
flutter pub get
flutter run -d chrome --web-hostname localhost
```

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
