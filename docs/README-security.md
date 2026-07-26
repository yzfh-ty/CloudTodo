# CloudTodo 安全路线图：WebAuthn、RBAC 与协议限制说明

本文档记录审计报告（SECURITY_AUDIT_REPORT.md）P2 中尚未实现、需要架构级投入的项目的最小可行设计，以及已知协议限制。已实现的 P2 项（管理员 TOTP MFA、高风险操作二次确认、安全审计查询接口、审计哈希链、值级脱敏、Webhook v2 签名）不在本文范围内。

## 1. WebAuthn / Passkey（未实现，设计草案）

### 目标
为管理员提供抗钓鱼的第二因素（或免密登录），优先于 TOTP 使用；TOTP 与恢复码作为回退。

### 数据模型（新增表）
```prisma
model WebAuthnCredential {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  credentialId    Bytes     @unique @map("credential_id")      // authenticator credential ID
  publicKey       Bytes     @map("public_key")                 // COSE public key
  signCount       BigInt    @default(0) @map("sign_count")     // 克隆检测
  transports      String[]  @map("transports")
  aaguid          String?   @db.Uuid
  nickname        String?   @db.VarChar(64)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastUsedAt      DateTime? @map("last_used_at") @db.Timestamptz(6)
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("webauthn_credentials")
}
```

### 接口骨架（均挂在 /api/admin/mfa/webauthn 下，复用 AdminApiSessionGuard）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /register/options | 生成注册 challenge（存服务端会话/短期表，5 分钟过期），RequireRecentAdminAuth |
| POST | /register/verify | 校验 attestation，写入凭据；RequireRecentAdminAuth + 现有 TOTP 确认 |
| POST | /login/options | 登录第二步生成 assertion challenge（携带用户已注册凭据 ID 列表） |
| POST | /login/verify | 校验 assertion（origin、rpIdHash、signCount 单调递增），成功后签发会话 |
| POST | /credentials/:id/delete | 删除凭据；RequireMfaConfirmation |

### 实现要点
- 引入 `@simplewebauthn/server`（无原生依赖，纯 TS），rpID 取 `APP_BASE_URL` 域名，生产守卫已强制 HTTPS。
- challenge 必须一次性消费（复用现有"条件更新原子消费"模式）。
- signCount 回退（新值 ≤ 旧值）按克隆处理：拒绝并写 `admin_mfa_failure` 审计。
- 登录策略：任一凭据 assertion 通过 ⇒ 满足 MFA；`assertLoginMfa` 扩展为 TOTP / 恢复码 / WebAuthn 三选一。
- 前端：管理面板（纯 JS）用 `navigator.credentials.create/get` + base64url 编解码，无需框架。

### 未实现原因
需要新表 + 挑战存储 + 浏览器端交互 + 完整攻防测试（origin 伪造、challenge 重放、signCount 回退），一次迭代塞入风险高于收益。

## 2. RBAC / 管理员角色拆分（未实现，设计草案）

### 现状
`UserRole` 仅 `user/admin` 两档；所有管理接口只区分"是否 admin"。

### 最小可行模型
不引入通用权限表，先按**固定角色 + 路由能力矩阵**拆分：

```prisma
enum AdminRole {
  viewer      // 只读：dashboard、用户列表/详情、日志查询
  operator    // + 用户资料修改、启用/禁用、密码重置
  superadmin  // + 创建用户、MFA 管理、（未来）角色管理
}
// User 表新增: adminRole AdminRole? @map("admin_role")（role=admin 时有效）
```

能力检查用装饰器：`@RequireAdminRole('operator')`，在 `AdminApiSessionGuard` 内按 `viewer < operator < superadmin` 比较。现有 admin 全部迁移为 `superadmin`（迁移脚本一条 UPDATE），行为不变，之后逐个降权。

### 路由矩阵（初版）
- viewer：GET dashboard/users/operation-logs/security-audit-logs
- operator：POST users/:id/(disable|enable|reset-password)、PATCH users/:id
- superadmin：POST users、mfa/*、auth/logout-all-sessions

### 未实现原因
牵动所有管理路由与面板 UI 的可见性逻辑，且需要与"管理员管理管理员"的产品决策配套（谁能改谁的角色），不适合无人值守迭代。

## 3. 企业微信机器人 body 完整性（协议限制，已知状态）

企业微信群机器人 webhook 的签名方案由其协议固定：`HMAC-SHA256(secret, "{timestamp}\n{secret}")` 放在 URL query（`timestamp`/`sign`），**签名不覆盖请求 body**。这意味着：

- CloudTodo 无法为 WeCom 目标提供 body 完整性/防篡改保证 —— 中间人可在不破坏签名的情况下改写消息内容。传输安全完全依赖 HTTPS（出站校验已强制 https + 证书校验 + IP 固定）。
- CloudTodo 自有 Webhook（非 WeCom）走 v2 签名：`HMAC-SHA256(secret, "{timestamp}.{event_id}.{delivery_id}.{body}")`，头部 `X-CloudTodo-Signature-Version: 2`，覆盖 body 与投递标识；接收方应校验签名、按 `X-CloudTodo-Event-Id` 幂等去重、并拒绝时间戳偏差过大的请求（建议 ±5 分钟）。
- 缓解措施（已实现）：WeCom 请求同样经过 SSRF 防护、每次投递重新校验端点状态、响应大小/超时限制；投递结果写入安全审计流（`webhook_delivery_*`）。

## 4. 已实现的防篡改审计链（简述）

`security_audit_logs` 自 20260727_000017 起带 `chain_seq / prev_hash / entry_hash`：每条新事件在事务内持 Postgres advisory lock 串行取得前驱哈希，`entry_hash = SHA-256(canonical(prev_hash, 全部业务字段, created_at))`。`verifyAuditChain()` 可离线校验篡改/删除/重链。历史行（迁移前）无哈希，链从部署后的第一条开始。后续可选增强：定期把链头哈希外发到对象存储/另一数据库作为锚点。
