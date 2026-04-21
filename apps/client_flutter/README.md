# CloudTodo Flutter Client

CloudTodo Flutter Client 是面向 Web、Android、Windows 的统一客户端实现。

## 当前状态

当前客户端已经具备可联调、可预览的基础能力：

- Flutter Web / Android / Windows 工程骨架
- 统一分层结构：`core` / `features` / `routing`
- Cookie 会话恢复
- 应用级运行时后端地址切换
- 登录 / 注册
- 任务 / 提醒 / 设置 三个一级入口

## 当前信息架构

一级导航：

- 任务
- 提醒
- 设置

设置页当前承载：

- 账户信息
- 个人资料
- 时区设置
- 通知方式管理
- 高级连接设置
- 退出登录

## 已实现功能

### 任务

- 列表
- 搜索
- 筛选
- 创建
- 编辑
- 完成 / 重新打开 / 归档 / 删除
- 详情弹窗
- 近期提醒侧栏

### 提醒

- 独立页面
- 创建 / 编辑 / 删除
- 详情弹窗

### 设置

- 资料修改
- 时区选择
- 通知方式配置
- 后端地址切换
- 退出登录

### 通知方式

当前支持：

- 企业微信机器人
- 标准 Webhook

当前能力：

- 创建 / 编辑 / 删除 / 测试
- 请求体模板编辑
- 恢复默认模板
- 占位符说明
- 模板示例预览
- 最近结果与上次测试时间展示
- 测试结果查看返回内容与本次请求体

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

### 安装依赖

```bash
flutter pub get
```

### 静态检查与测试

```bash
flutter analyze
flutter test
```

### 运行 Web

```bash
flutter run -d chrome --web-hostname localhost
```

### 运行 Windows

```bash
flutter run -d windows
```

## Docker

当前仓库已经提供：

- [Web Dockerfile](Dockerfile.web)
- [nginx 配置](nginx.conf)
- [docker-compose.yml](docker-compose.yml)

在当前目录执行：

```powershell
docker compose up --build
```

默认访问地址：

- Web：`http://localhost:8080`
- 当前 Web 容器使用 `nginx` 托管 Flutter Web 静态资源

## 后端地址

客户端支持两种方式配置后端地址：

- 登录 / 注册页中的高级连接设置
- 设置页中的高级设置

常见本地地址：

- Web：`http://localhost:3000`
- Windows：`http://127.0.0.1:3000/api`
- Android 模拟器：`http://10.0.2.2:3000/api`
