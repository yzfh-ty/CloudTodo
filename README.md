# CloudTodo

CloudTodo 是一个多端 Todo 与提醒服务，目标覆盖：

- Web
- Android
- Windows

项目当前采用单仓结构，已经落地后端服务、后端内置管理后台，以及 Flutter 三端客户端骨架与核心用户流程。

## 当前结构

```text
CloudTodo/
├─ apps/
│  ├─ client_flutter/
│  └─ server/
├─ docs/
│  ├─ api/
│  ├─ architecture/
│  └─ product/
└─ README.md
```

## 已实现

### 1. 服务端

当前后端已经具备以下能力：

- 用户注册 / 登录 / refresh / 登出
- 用户资料接口：`/api/users/me`
- Todo CRUD 与状态流转
- Reminder CRUD 与近期提醒查询
- Notification Endpoint CRUD 与测试接口
- 进程内 Reminder 扫描调度
- Webhook 投递 worker
- Prisma migration 基线
- 后端内置管理后台 `/admin`
- 管理员登录、用户列表、用户详情、资料更新
- 管理员禁用 / 启用用户
- 管理员重置用户密码
- 管理员操作日志

### 2. 客户端

当前客户端已经完成三端统一骨架初始化：

- Flutter Web / Android / Windows 工程骨架
- 分层结构：`core` / `features` / `routing`
- 运行时配置加载
- Cookie 会话恢复
- 登录 / 注册页
- 运行时输入后端地址
- 任务页：列表、搜索、筛选、创建、编辑、完成、重新打开、归档、删除
- 提醒页：独立模块入口，支持创建、编辑、删除
- 设置页：资料、时区、通知方式、退出登录
- 通知方式支持：
  - 企业微信机器人
  - 标准 Webhook

### 3. 当前客户端信息架构

当前一级导航为：

- 任务
- 提醒
- 设置

设置页当前集中承载：

- 账户信息
- 个人资料
- 时区设置
- 通知方式配置
- 退出登录

## 正在推进

当前工作区还在继续收敛这几块能力：

- 通知方式的请求体模板配置
- 企业微信机器人与标准 Webhook 的测试/投递适配
- 用户可见文案中文化
- 设置页交互继续收口
- 客户端模块继续从页面内联逻辑向控制器层收敛

这些内容已经进入当前代码修改中，但是否全部通过本地验证，应以当前分支实际运行结果为准。

## 接下来计划实现

### 1. 客户端继续完善

- 通知方式模板的默认模板切换与占位符说明
- 更友好的时区选择，而不是纯文本输入
- 更完整的任务详情与提醒详情展示
- 统一的提交中状态、错误提示、空状态设计
- Android / Windows 端更接近生产可用的本地体验

### 2. 服务端继续完善

- Notification Endpoint 请求体模板正式持久化与投递链路联调
- 企业微信机器人、标准 Webhook 的真实业务校验
- 更多管理员后台交互收尾
- 测试用例补强
- CI / 构建与部署脚本完善

### 3. 工程化与交付

- Web / Server Docker 化联调收尾
- 前后端 README 和部署说明同步更新
- 本地开发与生产部署路径进一步清晰化

## 开发入口

### 后端

如果继续开发后端，优先看：

- [CloudTodo Server README](D:/project/CloudTodo/apps/server/README.md)

### 客户端

如果继续开发客户端，优先看：

- [CloudTodo Flutter Client README](D:/project/CloudTodo/apps/client_flutter/README.md)

## 核心文档

- [后端管理后台接口详细设计](D:/project/CloudTodo/docs/api/后端管理后台接口详细设计.md)
- [数据库表结构设计](D:/project/CloudTodo/docs/architecture/数据库表结构设计.md)
- [Docker部署设计](D:/project/CloudTodo/docs/architecture/Docker部署设计.md)
- [后端管理后台设计](D:/project/CloudTodo/docs/product/后端管理后台设计.md)

## 当前建议的工作顺序

如果从当前状态继续推进，最合适的是：

1. 完成通知方式模板与真实投递链路联调
2. 收尾设置页与客户端中文化
3. 继续补客户端细节交互与验证
4. 补测试、CI 与部署说明
