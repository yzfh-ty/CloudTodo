<!--
来源：Claude Fable 5 独立完整安全代码审查（只读审查 + 真实命令验证）
审查对象：CloudTodo @ 2c36265（分支 main）
审查日期：2026-07-27
本文件由审查原文归档而成，未改动结论内容；后续修复进度记录在文末「修复跟踪」一节。
-->
# CloudTodo 独立代码审查报告

**审查对象**：`/home/ubuntu/CloudTodo` @ `2c36265`（分支 `main`，工作区干净，与 `origin/main` 同步）
**审查日期**：2026-07-27　**审查方式**：只读审查 + 真实命令验证，未修改任何文件
**声明**：本次审查未采信 `SECURITY_AUDIT_REPORT.md` 的既有结论，所有关键指控均由我亲自复现验证。

---

## 一、总体结论与风险等级

**整体风险等级：中高（Medium-High）。建议阻止发布，但不需要紧急下线。**

这是一份工程质量明显高于平均水平的代码库。SSRF 防护层是我见过的实现中最扎实的之一（我实测了十进制/八进制/十六进制 IPv4、IPv4-mapped 与 NAT64/6to4 IPv6、尾点域名、DNS rebinding、重定向跟随、云元数据地址，**没有找到任何绕过**）；生产配置守卫、CSRF 双提交、会话签名、密码重置单次消费、Webhook 密钥 AES-256-GCM 加密存储、乐观租约式投递等控制都实现正确。全仓库零硬编码密钥、零 `eval`/`exec`、零 `$queryRawUnsafe`、零 CORS 通配符、零调试残留、`npm audit` 零漏洞。

但有两处**声称存在的安全控制实际不成立**，这是本次审查的核心结论：

1. **最新提交主打的"防篡改审计链"在真实数据库中 100% 验证失败，且从未被任何代码路径验证过。** 我在 `cloudtodo` 与 `cloudtodo_test` 两个库上分别实测，8/8 条已哈希记录全部 `{valid: false}`。单元测试全绿，因为它们只在内存对象上测试，绕过了真正的失效点。
2. **管理员分级 MFA（step-up MFA）可被完全绕过。** 持有被劫持管理员会话的攻击者可以在不掌握原认证器的情况下把 MFA 重新绑定到自己的设备上，而这正是该控制设计要防御的威胁。

这两项都不是"远程未认证攻陷"级别的漏洞，但它们让两个被写进提交信息和文档的安全承诺落空。在审计合规语境下，一个宣称有效却实际无效的审计链，比没有审计链更危险。

---

## 二、🔴 Critical（2 项）

### C-1　"防篡改"审计链在真实数据库中完全失效，且从未被验证

这实际上是五个缺陷叠加的结果，我把它们合并为一条 Critical，因为单独修任何一个都不能恢复该控制的可用性。

**证据（我亲自复现，非推断）**

通过真实服务写入路径写一条审计记录、再经 Prisma 读回重算哈希：

```
metadata written  : {"delivery_id":"d1","endpoint_id":"e1","status":200}
metadata read back: {"status":200,"delivery_id":"d1","endpoint_id":"e1"}
write hash : 19e9d4165433fdf049f3a9fb
read  hash : 962c63c66c97de63e68c255d
HASHES MATCH: false
```

对两个库全量只读扫描：

```
DB=cloudtodo_test        hashedRows=8  hashOK=0  hashFAIL=8   chainSeq gaps=1
DB=cloudtodo(生产库只读)  hashedRows=8  hashOK=0  hashFAIL=8   chainSeq gaps=1
verifyAuditChain(126 rows) => {"valid":false,"brokenAtChainSeq":"124"}
```

**根因一：jsonb 键序重排**（`apps/server/src/common/security/security-audit.service.ts:100-115`）
`computeAuditEntryHash` 用 `JSON.stringify` 对内存中的 JS 对象取哈希，而 `metadata` 落库为 Postgres `jsonb`——jsonb 按"键长度优先、再字节序"规范化键序，不保留原始顺序。实测确认：

```sql
SELECT '{"delivery_id":"d","endpoint_id":"e","status":200}'::jsonb::text;
 -> {"status": 200, "delivery_id": "d", "endpoint_id": "e"}
```

真实调用方确实会命中：`scheduler.service.ts:672` 发出 `{delivery_id, endpoint_id, status}`，`notification-endpoints.service.ts:133` 发出 `{endpoint_id, target}`，`admin.service.ts` 中多处发出多键 metadata。

**根因二：审计外键 `ON DELETE SET NULL` 会在事后改写已哈希的行**（`prisma/schema.prisma:459-460`）

```prisma
actorUser  User? @relation("SecurityAuditActor",  ..., onDelete: SetNull)
targetUser User? @relation("SecurityAuditTarget", ..., onDelete: SetNull)
```

删除用户会把已经参与哈希计算的 `actor_user_id`/`target_user_id` 静默置为 NULL，哈希立即失配。这是当前 8 条记录全部失败的**主因**——它们的 actor 和 target 都已被置空，连 metadata 为空的记录也一并失败。任何 GDPR 删除、DBA 清理或测试清理都会永久破坏链条。

同一文件 `schema.prisma:436` 更严重：`adminUser ... onDelete: Cascade` 意味着**删除一个管理员会连带删除该管理员写过的全部 `admin_operation_logs`**——这是一条一步到位的审计抹除原语。

**根因三：`verifyAuditChain` 是死代码**（`security-audit.service.ts:122-140`）
全仓搜索确认，它只被 `test/security-audit-chain.spec.ts` 引用，**没有任何端点、任务或任务调度调用它**。同时 `chainSeq`/`prevHash`/`entryHash` 在整个 `src/` 中除定义文件外零出现，即管理端 API `GET /api/admin/security-audit-logs`（`admin.controller.ts:230`）根本不返回链字段，管理面板 UI（`admin-panel.audit.ts:88-98`）也不展示。链只写不验。

**根因四：验证逻辑接受任意截断**（`security-audit.service.ts:125-138`）
首条已哈希记录的 `prevHash` 从未与 `AUDIT_CHAIN_GENESIS` 比对（此时 `expectedPrev` 仍是 `null`），`chainSeq` 连续性也从不检查。攻击者删除日志的任意**前缀**或**尾部**后，剩余链条仍然验证通过。只有中间篡改会被发现。我实测确认当前库中已存在 `chainSeq` 跳号（gaps=1）。

**根因五：无密钥的 SHA-256，任何写库能力即可伪造全链**（`security-audit.service.ts:100`）
`createHash('sha256')` 无 HMAC 密钥，数据库层也没有 append-only 约束（`prisma/migrations` 中仅有 sync watermark 相关触发器，审计表既未 `REVOKE UPDATE/DELETE` 也无拒绝触发器），且应用角色拥有该表。任何拿到 `UPDATE`/`DELETE` 权限的人（凭据泄露、内部人员）可以在数秒内改一条记录并重算其后全部哈希。该设计只能发现意外损坏，发现不了对手——而文件头注释写的是 "Tamper-evident audit storage"。

**附带缺陷：审计写入失败被静默吞掉，且串行化在单一全局锁上**（`security-audit.service.ts:51-74`）
每条审计事件都在独立事务中抢占同一个 advisory key `913571`。Prisma 默认 `maxWait: 2000ms`/`timeout: 5000ms`，队列一深就抛异常，而 catch 块只写一条 `logger.warn` 就放行——业务操作照样成功。攻击者洪泛 `/api/auth/login` 制造锁竞争，就能让本应记录这次攻击的 `user_login_failure` 事件成批丢失。

**建议修复**

- 哈希改用规范化序列化（递归按键排序，或 JCS/RFC 8785），或直接把规范字符串与行一起持久化后再哈希。
- 审计外键改为 `Restrict`/`NoAction`，或干脆去掉外键、冗余存储不可变的 actor id + 用户名快照；`admin_operation_logs` 绝不允许 CASCADE。
- 新增管理员可调用的链验证端点 + 周期性校验任务，破链时告警。
- 验证逻辑要求首条记录锚定 genesis（或锚定已签名的检查点），断言 `chainSeq` 连续，并周期性对外发布签名链头以便发现尾部截断。
- 改用 HMAC，密钥放在应用 DB 角色读不到的地方（KMS/独立签名服务）；对应用角色 `REVOKE UPDATE, DELETE ON security_audit_logs`。
- 审计写入并入原业务事务，或走带重试的 outbox；丢弃事件应告警而非仅 warn；按天分链降低锁竞争。

---

### C-2　管理员 step-up MFA 可被完全绕过（重新绑定 + 无限次爆破）

**问题一：重新注册 TOTP 无需证明持有当前因子**
`apps/server/src/modules/admin/admin.controller.ts:121-134`（我已逐行确认装饰器）：

```ts
@Post('mfa/totp/start')
@RequireRecentAdminAuth()          // ← 缺少 @RequireMfaConfirmation()
startTotpEnrollment(@CurrentAdmin() admin) { ... }

@Post('mfa/totp/confirm')
@RequireRecentAdminAuth()          // ← 缺少 @RequireMfaConfirmation()
confirmTotpEnrollment(...)
```

对比同文件 `users/:id/disable`（:189-190）与 `users/:id/reset-password`（:210-211）都带了 `@RequireMfaConfirmation()`，而 MFA 自身的管理路由没有。`admin-mfa.service.ts:56-59` 在 `totpEnabledAt` 已存在时仍无条件写入新的 `totpPendingSecretEncrypted`，`confirmEnrollment`（:100-121）仅校验**新**验证码就将其提升为正式密钥，并删除全部旧恢复码、重新签发 8 个新的。

**影响**：攻击者只要持有一个 15 分钟内产生的管理员会话（正是 `@RequireMfaConfirmation()` 要防御的场景），就能把 MFA 静默改绑到自己的认证器上并拿到全新恢复码，随后满足所有 MFA 门禁路由与今后每一次登录。受害管理员要等到自己的 App 失效才会察觉。注意 `disable()`（:138-167）反而正确要求了当前验证码——说明这是遗漏而非设计。

**问题二：所有 MFA 校验路径零限流**
我用 `grep assertRateLimit|assertAllowed` 全量确认，管理端只有 `admin.controller.ts:72` 的登录（8 次/15 分钟）受限。`mfa/totp/confirm`、`mfa/totp/disable` 以及 `admin-api-session.guard.ts:89-100` 中读取 `X-CloudTodo-MFA-Code` 的动作确认头，**都没有任何限流或失败计数**，失败仅写审计日志（`admin-mfa.service.ts:297-303`）。6 位验证码在 ±1 步接受窗口下任一时刻有 3/10⁶ 个有效值，在无限流的端点上于 15 分钟窗口内可完成数万次猜测。

**建议修复**：`totpEnabledAt` 非空时，`start`/`confirm` 必须要求当前因子（加 `@RequireMfaConfirmation()`，并在 service 内调用 `assertActionConfirmation` 兜底）；对 `assertActionConfirmation`、`confirmEnrollment`、`disable` 按管理员 ID 与 IP 双维度限流（如仅计失败、5 次/15 分钟），连续失败后临时锁定。

---

## 三、🟡 Medium（10 项）

### M-1　企业微信默认模板产生非法 JSON——功能性破损 + JSON 注入
**位置**：`src/modules/notification-endpoints/notification-endpoint-template.util.ts:56-68`（渲染）、`:9-29`（默认模板）；消费方 `src/modules/scheduler/scheduler.service.ts:393-425`

`renderPayloadTemplate` 对 `_text` 结尾的变量**不做 JSON 转义**直接插入，而默认企业微信模板把 `补充信息：{{payload_text}}` 放在 JSON 字符串内部，scheduler 又向它传入 `JSON.stringify({...})`——原始引号和大括号直接破坏模板结构。

我实测确认（对编译产物 `dist` 执行）：

```
WeCom default template PARSE FAIL: Expected ',' or '}' after property value ... (恶意标题)
BENIGN title PARSE FAIL:  Expected ',' or '}' after property value ...      (普通标题 "buy milk")
control char \b PARSE FAIL: Bad control character in string literal
```

**关键点：连"buy milk"这样的普通标题都会失败。** 也就是说凡是使用默认模板的企业微信推送，发出的都是非法 JSON——这个功能目前是全线不可用的，而不只是个安全边角。`scheduler.service.ts:394` 确认 `payloadTemplate` 为空时即回落到该默认模板。

安全侧影响：用户通过任务标题/描述控制外发请求体的 JSON 结构，在团队共享的企业微信机器人上可篡改 `msgtype` 等字段注入任意消息结构。此外 `escapeJsonString`（:83-90）遗漏了除 `\n \r \t` 外的全部 U+0000–U+001F 控制字符。

**建议**：`_text` 与普通变量一样转义（或直接取消 `_text` 特例、只保留 `_json`）；`escapeJsonString` 覆盖全部 < U+0020 码点；修正默认模板使用已转义变量。

### M-2　按子串判断服务商，可静默关闭 Webhook 签名
**位置**：`notification-endpoint-template.util.ts:3-7`

```ts
return targetUrl.includes('weixin.qq.com/cgi-bin/webhook/send') ? 'wecom_robot' : 'standard_webhook';
```

匹配发生在整个 URL 上（含查询串与片段）。我实测 `inferNotificationDeliveryKind('https://attacker.example/?x=weixin.qq.com/cgi-bin/webhook/send')` 返回 `wecom_robot`，随后 `scheduler.service.ts:440-451` 走企业微信分支——**跳过 `X-CloudTodo-Signature` 请求体 HMAC**，改为把 `HMAC(timestamp\nsecret)` 作为 `sign` 查询参数发往攻击者自选的主机。

**建议**：基于解析后的 `URL` 判断 `hostname === 'qyapi.weixin.qq.com'` 且 pathname 前缀匹配，不要用子串。

### M-3　管理员登录不做邮箱小写归一化，导致无法登录并可产生重复邮箱
**位置**：`src/modules/admin/admin.service.ts:57-61`、`:543-586`

我已对比确认：用户登录 `auth.service.ts:94` 做了 `account.toLowerCase()`，管理员登录 `admin.service.ts:58` **没有**。而所有写入方（`auth.service.ts:23`、`admin.service.ts:412`、`provision-admin.ts:16`）都存小写。结果是管理员在登录页输入 `Admin@Corp.com` 直接认证失败。更糟的是 `updateUser`（:544）也不归一化就落库，其重复检查（:569-583）大小写敏感，于是 `A@b.com` 与 `a@b.com` 可以共存，且被改成混合大小写的用户此后再也无法用邮箱登录。

**建议**：`AdminService.login` 与 `updateUser` 统一小写；考虑 citext 列或归一化邮箱唯一索引。

### M-4　用户名可以是别人的邮箱，导致登录解析歧义与永久锁定
**位置**：`src/modules/auth/auth.service.ts:26-49`、`:92-95`；`admin.service.ts:418-441`、`:58-61`

注册时 email 只与 email 列查重、username 只与 username 列查重，从不交叉校验，也不拒绝用户名中的 `@`。攻击者注册 `username = "victim@example.com"` 后，受害者用邮箱登录时 `findFirst` 的 `OR` 查询在无 `orderBy` 的情况下行序不确定，可能命中攻击者的行，密码校验失败导致受害者被永久挡在邮箱登录之外；失败审计事件的 `targetUserId`（:137-142）也会归错人。

**建议**：拒绝含 `@` 或形如邮箱的用户名；按单一字段显式解析账号；补充跨列唯一性校验与确定性 `orderBy`。

### M-5　CSRF token 不绑定会话且永不过期，Cookie 缺 `__Host-` 前缀
**位置**：`src/common/security/csrf.service.ts:22-26`、`:69-88`；签发处 `auth.controller.ts:238-246`、`admin.controller.ts:247-255`

```ts
createToken(scope: 'user' | 'admin') {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${this.sign(scope, nonce)}`;   // 与会话/用户无任何绑定
}
```

校验仅比对 header 与 cookie 是否相等、以及对 `scope:nonce` 的 HMAC。任意同 scope 的 token 对任意用户永久有效。攻击者只要能向受害者 Cookie jar 写入（同注册域下的兄弟子域 XSS、被攻陷的子域、同域 `http://` 源），就能用自己注册账号取得的合法签名 token 完成双提交。SameSite=Lax 仍要求请求同站发起，因此需要同站立足点——而这恰恰是 Cookie 前缀与会话绑定要收敛的风险面。

**建议**：HMAC 覆盖会话标识（如会话 Cookie 的 SHA-256）与签发时间戳并校验；生产环境 Cookie 改用 `__Host-` 前缀。

### M-6　限流器容量耗尽即全局 429，按账号计数可被用作锁定武器，且状态仅在单进程
**位置**：`src/common/security/rate-limit.service.ts:20-78`；调用方 `auth.controller.ts:286-307`、`admin.controller.ts:288-309`

```ts
if (!bucket && this.buckets.size >= this.maxBuckets) {   // 默认 10_000
  throw new HttpException({ code: 'RATE_LIMITED', ... }, 429);   // 对任何新 key 都拒绝
}
```

桶 key 包含攻击者可控的账号标识（`auth:login:id:<account>`），分布式攻击者可灌满该 Map；一旦满了，**全应用任何新 IP 或新账号 key 都会收到 429**，形成认证全局中断。其次，成功与失败都计入按账号的桶，故 10 次针对某已知管理员账号的请求即可把该账号锁在门外 15 分钟。最后 Map 在进程内，N 副本部署会把所有限流阈值静默放大 N 倍。

**建议**：按命名空间隔离容量，避免标识符churn 饿死 IP 桶；按账号维度只计失败；多实例部署改用 Redis 等共享存储。

### M-7　密码哈希使用 scrypt 默认成本，不存参数，且阻塞事件循环
**位置**：`src/common/security/password.util.ts:5-28`

```ts
const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
return `scrypt$${salt}$${derivedKey}`;
```

Node 默认 N=16384, r=8, p=1，比当前 OWASP 对 scrypt 的建议（N=2¹⁷）低 8 倍。存储串不含成本参数，意味着日后调高参数就会让所有存量哈希失效，而代码中并不存在登录时重哈希的路径。`scryptSync` 同步阻塞事件循环，而它出现在每一次登录/注册/改密路径上（`auth.service.ts:55,136,565,572,699`；`admin.service.ts:103,262,269,443,809`）。

**建议**：迁移到 argon2id；至少改存 `scrypt$N$r$p$salt$key`、提高 N、改用异步 API，并在登录成功且参数过时时透明重哈希。

### M-8　Flutter 原生端会话仅存内存：每次启动都要重登，Linux 后台提醒功能实质失效
**位置**：`lib/src/core/http/platform_http_client_io.dart:30`、`:42-47`；`lib/src/features/app/application/app_session_controller.dart:49-58`；`lib/src/core/notifications/local_autostart_io.dart:43`

我已确认 Cookie jar 是纯内存 `Map`，`hasSessionHint` 只看内存中的 CSRF cookie，而 `restoreSession()` 在无 hint 时直接 `forceLogout()`——连 `/auth/refresh` 都不尝试。安全姿态很好（磁盘上不留凭据），但代价是：Android/Windows/Linux 用户每次冷启动都必须重新登录；更关键的是 `local_autostart_io.dart:43` 写入的自启动项 `Exec="$executable" --background` 会拉起一个隐藏且**未认证**的实例，而 Linux 端本就不走原生通知调度（`local_notification_service.dart:230-248` 仅对 Android/Windows 排程），完全依赖需要认证的 30 秒轮询循环。因此设置页 `settings_page.dart:694-707` 那个"开机后在后台运行 / 用于接收桌面提醒"开关在 Linux 上是死功能。

**建议**：二选一——用 OS 级安全存储（flutter_secure_storage / libsecret / DPAPI）持久化 refresh cookie 并保留现有 generation 校验；或者移除/禁用该自启动开关并在文档中说明原生会话不跨重启。

### M-9　设置页在 `build()` 中回绑 profile，会覆盖用户正在输入的内容
**位置**：`lib/src/features/settings/presentation/settings_page.dart:143-147`，`settings_page_actions.dart:321-325`（我已逐行确认）

```dart
final profile = _profileController.profile;
if (profile != null) {
  _bindProfile(profile);        // 直接改写三个 TextEditingController.text
}
```

由于该 widget 监听了多个 Listenable，端点加载完成、端点测试返回、保存转圈等任何一次 notify 都会触发 rebuild，进而把昵称/邮箱/时区输入框重置为服务端值——用户编辑到一半的内容被清掉。

**建议**：改为一次性绑定（在 controller 加载完成回调中，或用 `_profileBound` 标志位），不要放在 `build()` 里。

### M-10　CI 只在打 tag 时运行，主分支与 PR 无任何自动化检查
**位置**：`.github/workflows/server-ci.yml:3-7`、`client-ci.yml:3-7`（我已确认两个文件均为 `push: tags: "*"` + `workflow_dispatch`）

tag-only 逻辑本身实现正确，两个工作流也都正确设置了 `permissions: contents: read`、不使用 `pull_request_target`、不引用任何 secret。但代价是合入 `main` 的代码在有人打 tag 之前得不到任何测试、类型检查或依赖审计——`npm audit --audit-level=high` 同样只在打 tag 时跑。考虑到权限已是只读，增加 PR/分支触发没有额外风险。

**建议**：补上 `push: branches: [main]` 与 `pull_request:` 触发。

---

## 四、🟢 Low（15 项）

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| L-1 | `src/main.ts`（无匹配）、`admin.controller.ts:173-223` 等 | 全仓**无全局异常过滤器**（`APP_FILTER`/`useGlobalFilters`/`ExceptionFilter` 零命中）。非 UUID 的 `:id` 传到 Prisma 触发 P2023，返回 500 而非 400，破坏 `{code,message}` 契约并可被按需刷日志 | 加 `ParseUUIDPipe` + 全局过滤器映射 Prisma 错误 |
| L-2 | `todos/dto/*.ts`、`auth/dto/register.dto.ts`、`users/dto/update-me.dto.ts`、`reminders/dto/*` | 多个自由文本字段无 `@MaxLength`；`page` 有 `@Min(1)` 无 `@Max`；`repeat_rule` 仅 `@IsObject()` 即入 jsonb | 补 `@MaxLength`/`@Max`，对 `repeat_rule` 做嵌套校验或体积上限 |
| L-3 | `src/main.ts:71-74` | CSP 含 `script-src 'unsafe-inline'`（为内联管理面板脚本所需），且未调用 `app.disable('x-powered-by')`，无 COOP/CORP | 管理面板脚本外置或加 nonce；关闭 X-Powered-By |
| L-4 | `rate-limit.service.ts:20` + 调用方 | 限流仅覆盖登录/注册/刷新/登出/重置确认/webhook，todos、sync、reminders、devices 全无限制 | 为已认证 API 增加粗粒度全局限流 |
| L-5 | `reminders.service.ts:15-27`、`todo-lists`、`tags`、`devices` | 无按用户配额；`updateReminder` 允许把 `remind_at` 挪动 1ms 绕过 `reminderId:remindAt:channel` 去重键，每个调度周期新增 `reminder_events` 行（webhook 投递本身已有配额，故影响限于行数膨胀） | 参照已有 webhook 配额补充行数配额 |
| L-6 | `todo-lists.service.ts:86-104`、`schema.prisma:267-269` | `is_default` 唯一性是 READ COMMITTED 下的读-改-写，无行锁也无部分唯一索引，并发可产生两个默认列表 | 建 `UNIQUE INDEX ... ON todo_lists(user_id) WHERE is_default AND deleted_at IS NULL` |
| L-7 | `auth.service.ts:124-147`、`:37-49` | 登录时"账号不存在"路径在 `verifyPassword` 之前返回，构成时序侧信道（错误文案本身已正确统一）；注册冲突区分 email/username 泄露存在性 | 未命中路径对固定假哈希跑一次校验；注册冲突返回统一文案 |
| L-8 | `auth.service.ts:263-266`、`:375-406`、`:750-752` | refresh token 每次轮转都重置 30 天 TTL，无绝对上限；`hashRefreshToken` 是无密钥 SHA-256（与重置 token 的 HMAC 不一致）；两个标签页并发刷新会让失败方被判定为重放并吊销该用户全部会话 | 增加链绝对过期；改 HMAC；加入短暂宽限窗口 |
| L-9 | `auth.service.ts:459-529` | logout 是全局的，且刻意接受已轮转的前驱 token（:498），任何历史 refresh token 持有者都能把用户从所有设备踢下线；单设备登出也会杀掉其他设备 | 默认只吊销当前 token 链，全局登出改为显式请求 |
| L-10 | `webhook-test/webhook-test.controller.ts` | 无守卫无 CSRF 的回显端点；目前**安全仅因为** `WebhookTestModule` 未被 `app.module.ts` 引入。认证是逐控制器 opt-in，未来漏加 `@UseGuards` 的控制器默认公开 | 改为 `APP_GUARD` + `@Public()` 显式豁免；删除或仅开发环境启用该模块 |
| L-11 | `admin-panel-session.guard.ts:42-50`、`provision-admin.ts:56` | 面板守卫忽略 `forcePasswordChange`，页面能渲染但所有 XHR 报 `PASSWORD_CHANGE_REQUIRED`；引导管理员恰好总处于该状态且面板没有改密入口 | 该状态下重定向到改密视图 |
| L-12 | `secret.util.ts:41-48`、`admin-mfa.service.ts:321-324`、`schema.prisma:184` | TOTP 密钥与 webhook 密钥共用同一 `WEBHOOK_SECRET_ENCRYPTION_KEY`（单次 SHA-256 派生，无 KDF）；恢复码为无盐 SHA-256 且列上是全局 `@unique` | 分离密钥用途并引入 KDF；恢复码改 HMAC |
| L-13 | `platform_http_client_io.dart:100-146` | 未设 `followRedirects = false`，Dart HttpClient 会在重定向时重发 Cookie 与 `X-CSRF-Token`，且把最终（可能是外部）响应的 cookie 写回 jar | 关闭重定向，JSON API 下 3xx 视为错误 |
| L-14 | `devices/data/device_repository.dart:71-82` | 设备标识是每平台硬编码常量（`'android-client'` 等），服务端按其去重，导致两台安卓设备合并为一行，设备列表与吊销功能无法定位单台设备 | 生成并持久化每安装一个随机 UUID |
| L-15 | `app.dart:153-168` | 本地通知关闭时 `shouldShowEvent` 返回 false，但仍无条件 `ackReminderEvent`，事件被静默消费、服务端标记已投递 | 仅对确实展示（或有意去重抑制）的事件 ack |

其余更轻微项：Docker compose 全部服务缺 `restart` 策略；容器启动时执行 `prisma migrate deploy` 要求应用 DB 角色具备 DDL 权限且多副本会竞争；nginx 未启用 gzip/brotli（Flutter web 的 `main.dart.js` 数 MB）；GitHub Actions 使用可变 tag 而非 commit SHA 固定（第三方 `subosito/flutter-action@v2` 尤其值得固定）；`seed.ts:8` 的弱默认口令仅靠 `NODE_ENV === 'production'` 把关，忘设 `NODE_ENV` 的部署会得到已知口令管理员；README 指向的 `docs/android-debugging.md` 因 `.gitignore` 规则在全新克隆中不存在；`AdminCreateUserDto` 允许 `role: admin` 且 `PATCH /admin/users/:id` 无需 MFA 确认即可改写其他管理员的邮箱/用户名（设计使然，但值得显式决策）。

---

## 五、✅ 已验证无明显问题（关键攻击面）

以下都是我实际验证过的，不是"没看到就算过"：

**SSRF / 出站 HTTP（`outbound-http.service.ts`）——本代码库最强的部分。** 我在 Node 中实测：`https://2130706433/`、`https://0177.0.0.1/`、`https://0x7f.1/` 经 WHATWG URL 归一化后 `hostname` 均为 `127.0.0.1`，被 `loopback` 判定拦截；`::ffff:169.254.169.254` → ipv4Mapped → linkLocal，`64:ff9b::a9fe:a9fe` → rfc6052，`2002:a9fe:a9fe::` → 6to4，`fc00::1` → uniqueLocal，`fe80::1`/`::`/`0.0.0.0`/`100.64.0.1`/`224.0.0.1` 全部 ≠ unicast，均被拦截。DNS rebinding 被自定义 `lookup` 回调固定已解析地址堵死（:276-281，且 TLS `servername` 设置正确）；使用裸 `http.request`/`https.request` 因而**不跟随重定向**；任一 A/AAAA 记录命中私网即整体拒绝（fail-closed）；协议限 `https:`、URL 凭据拒绝、端口白名单默认 443 且 `'*'` fail-closed；请求体 ≤256KB、响应体超限即销毁 socket、独立硬超时。生产环境下 `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` 直接拒绝启动。**未发现任何绕过。** 仅两点残留：`response_code` 回显构成极弱的状态码 oracle；`198.18.0.0/15`（RFC 2544）被 ipaddr.js 判为 unicast 而放行。

**管理面板 XSS。** 面板是服务端生成的单页内联 JS，用 `innerHTML` 渲染，我逐个检查了所有动态插值点（`admin-panel.service.ts:465,559,624,751`、`admin-panel.audit.ts:88-98`、`admin-panel.mfa.ts:84,103-104,117`），**全部经过 `escapeHtml()`**（:340-347，转义 `& < > " '`，元素与带引号属性上下文均足够），横幅/状态用 `textContent`。未发现未转义汇聚点。

**SQL 注入。** 全部 7 处 raw SQL 均使用 `Prisma.sql` 标签模板绑定参数；全仓无 `$queryRawUnsafe`/`$executeRawUnsafe`（仅测试文件中有常量 DDL）。

**租户隔离 / IDOR。** 每个用户态查询都以会话中的 `userId` 过滤（todos/devices/reminders/notification-endpoints/sync 均已抽查）。`sync-cursor.util.ts:67-176` 校验版本、页界（≤1000）、页大小、时间窗、UUID 形态与集合白名单——但即使游标被完全伪造，`sync.service.ts:473-504` 的每条查询仍按 `userId` 收敛，只能重排攻击者自己的数据。`notificationEndpointSelect`（:673-688）刻意排除 `targetUrl` 与 `secret`。

**其他通过项**：会话签名 HMAC-SHA256 + 长度检查 + `timingSafeEqual`；自定义紧凑令牌无 `alg` 字段（算法混淆不适用），载荷在验签**之后**才解析；用户态与管理态签名密钥分离且未配置时 fail-closed；无状态访问令牌可经 `passwordChangedAt`/`sessionRevokedAt` 服务端吊销；refresh 轮转带家族重放检测；凭据变更一律 `SELECT … FOR UPDATE` + 比较并置换；TOTP 通过单调 claimed-step 计数器 + 条件 `updateMany` 防重放，接受窗口 ±1 步，比较用 `timingSafeEqual`；恢复码单次消费且仅展示一次；Cookie 序列化对名与值百分号编码（无头注入）；密码重置 token 以专用密钥 HMAC 且单次消费并连带吊销其他令牌；生产启动守卫强制 7 个密钥强度、HTTPS 源、`COOKIE_SECURE=true`、非本地强口令 DB、字面量 IP 的可信代理列表、`CSRF_TRUSTED_ORIGINS ⊆ 白名单`；`trust proxy` 仅按显式 IP 列表设置，限流器拒绝自行解析 `X-Forwarded-For`；投递采用条件 `updateManyAndReturn` + `updatedAt` 令牌前后复核的乐观租约；提醒触发经事务内唯一 `dedupeKey` 保证幂等；sync 读写序由 per-user advisory lock 迁移脚本保证；Flutter 端零 `badCertificateCallback`、发布版强制 HTTPS/同源、2MB 响应上限、401 单飞刷新带 generation+userId 围栏且仅重放一次、登出会先调服务端吊销、通知标题默认隐藏且切换时会取消已排程的旧通知、`mounted` 检查与 controller dispose 抽查全部到位、前后端 API 路径与字段全部对齐。

---

## 六、安全检查项通过 / 未通过表

| 检查项 | 结论 | 依据 |
|---|---|---|
| SSRF 防护（IP 混淆 / DNS rebinding / 重定向 / 元数据地址） | ✅ 通过 | 实测多种绕过均被拦截，`outbound-http.service.ts` |
| SQL 注入 | ✅ 通过 | 7 处 raw SQL 全参数化，无 Unsafe 变体 |
| 管理面板 XSS / HTML 注入 | ✅ 通过 | 全部插值经 `escapeHtml`，逐点核对 |
| 租户隔离 / IDOR | ✅ 通过 | 全部用户态查询按会话 `userId` 收敛 |
| CORS 配置 | ✅ 通过 | 无通配符；生产必须显式 `CORS_ORIGINS`，`main.ts:15-38` |
| 安全响应头 | ✅ 通过（CSP 待收紧） | `main.ts:66-79`；`script-src 'unsafe-inline'` 见 L-3 |
| 输入校验管道 | ✅ 通过 | `whitelist`+`forbidNonWhitelisted`+`transform`，`main.ts:88-94` |
| 大规模赋值（mass assignment） | ✅ 通过 | 自助路由 DTO 不含 `role`/`status`/`passwordHash` |
| 密钥管理与 git 卫生 | ✅ 通过 | 仅 2 个 `.example` 曾入库，`git log --all --diff-filter=A` 确认；`.env` 被忽略 |
| 依赖漏洞 | ✅ 通过 | `npm audit` 0 vulnerabilities |
| 容器安全（非 root / 只读 / cap_drop / 端口绑定） | ✅ 通过 | `USER node`、`read_only`、`no-new-privileges`、默认 127.0.0.1 |
| 会话令牌设计（签名 / 吊销 / 轮转 / 重放检测） | ✅ 通过 | 见上节；细节问题见 L-8/L-9 |
| CSRF 双提交机制 | ⚠️ 部分通过 | 机制正确但 token 不绑定会话、无过期，M-5 |
| 限流 | ⚠️ 部分通过 | 覆盖面窄、容量耗尽即全局 429、单进程状态，M-6 |
| 密码哈希强度与敏捷性 | ⚠️ 部分通过 | scrypt 默认成本、不存参数、同步阻塞，M-7 |
| 用户枚举防护 | ⚠️ 部分通过 | 错误文案已统一，但存在时序侧信道，L-7 |
| **MFA / TOTP 完整性** | ❌ **未通过** | 重新绑定无需当前因子 + 校验路径零限流，C-2 |
| **审计日志防篡改** | ❌ **未通过** | 真实库 8/8 验证失败、验证函数为死代码、可截断、无密钥，C-1 |
| **审计日志不可变性（外键）** | ❌ **未通过** | 审计 FK `SET NULL`、管理操作日志 `CASCADE`，C-1 |
| Webhook 出站完整性 | ❌ 未通过 | 子串判定服务商即可关闭请求体签名，M-2 |
| 出站模板注入 | ❌ 未通过 | `_text` 变量未转义，默认模板恒产生非法 JSON，M-1 |
| 全局错误处理 | ❌ 未通过 | 无全局异常过滤器，Prisma 错误直出 500，L-1 |
| CI 安全门禁 | ❌ 未通过 | 仅 tag 触发，主分支/PR 无测试与依赖审计，M-10 |

---

## 七、自动化验证命令与真实结果

全部命令由我实际执行，结果为原样摘录，未做美化：

| 命令 | 真实结果 |
|---|---|
| `git status && git log --oneline` | 工作区干净，`main` 与 `origin/main` 同步于 `2c36265` |
| `npm audit` / `npm audit --omit=dev` | `found 0 vulnerabilities`（两次均是） |
| `npx tsc --noEmit` | 通过，exit=0 |
| `npx jest --runInBand`（无 DB） | `22 passed, 1 skipped / 147 passed, 3 skipped, 150 total` |
| `DATABASE_URL=… npx prisma migrate deploy` | `17 migrations found. No pending migrations to apply.` |
| `DATABASE_URL=… npx jest auth-token-races/auth-refresh-logout` | `2 passed / 6 passed` |
| `SYNC_TEST_DATABASE_URL=… npx jest sync-watermark.postgres` | `1 passed / 3 passed`（该套件用的是独立环境变量，易被漏跑） |
| `npm run build`（nest build） | 成功，exit=0 |
| `flutter analyze` | `No issues found!` |
| `flutter test` | `All tests passed!`（23 项） |
| `git log --all --diff-filter=A` 过滤密钥类文件 | 仅 `apps/server/.env.example`、`.env.development.example`，历史上从未提交真实密钥 |
| **审计链写入-读回复现**（自建脚本，测试库） | `HASHES MATCH: false`；`verifyAuditChain(126 rows) => {"valid":false,"brokenAtChainSeq":"124"}` |
| **审计链只读全量扫描**（两个库） | 两库均 `hashedRows=8 hashOK=0 hashFAIL=8`，`chainSeq gaps=1` |
| **jsonb 键序实测**（psql） | `{"delivery_id":..} → {"status":200,"delivery_id":..}` 键序被重排 |
| **企业微信模板渲染实测**（对 dist） | 恶意标题与**普通标题**均 `PARSE FAIL`；`\b` 控制字符亦 `PARSE FAIL` |
| **服务商判定实测** | `inferKind('https://attacker.example/?x=weixin.qq.com/cgi-bin/webhook/send') = wecom_robot` |

说明：我只在 `cloudtodo_test` 库中做过一次写入并已删除该行；生产库 `cloudtodo` 全程只读。未破坏任何数据库或服务。

**一个值得强调的方法论结论**：全部 156 个后端测试与 23 个 Flutter 测试都是绿的，`tsc`、`flutter analyze`、`npm audit` 也全绿，但 C-1 依然存在。原因是 `security-audit-chain.spec.ts` 只在内存对象上验证链条，从不经过 Postgres 往返——而失效点恰恰在往返上。绿色测试套件在这里不构成安全保证。

---

## 八、是否建议阻止发布/合并

**建议阻止发布（Block）**，理由限定且具体：

- **C-1 必须修复后才能发布。** 提交 `2c36265` 的信息是 "add tamper-evident audit chain"，但该链在真实数据库中从未验证通过一次，也没有任何代码去验证它。发布一个宣称有防篡改审计而实际没有的系统，在任何需要审计留痕的场景下都会造成错误的安全假设。同时 `admin_operation_logs` 的 CASCADE 删除是一个一步式审计抹除原语，应当同批修复。
- **C-2 必须修复后才能发布。** MFA step-up 在其主要威胁模型（会话劫持）下可被完全绕过，且验证端点无限流。这两条修复量都很小（加装饰器 + 接限流器），不构成发布阻塞的成本负担。
- **M-1 建议同批修复**，因为它不只是安全问题——企业微信推送功能目前对所有默认模板用户都是坏的，这个 bug 会在发布后立刻被用户发现。

其余 Medium 与 Low 项不构成发布阻塞，可排入后续迭代。

如果存在必须先发的业务压力，最小可接受的临时措施是：给 `mfa/totp/start`、`mfa/totp/confirm` 加上 `@RequireMfaConfirmation()` 与限流（约 10 行改动），并在文档与管理面板中**撤回**"防篡改审计"的表述，降级为"审计日志"，直到链条真正可验证为止。

---

## 九、后续优先级建议

**P0（发布前，预计 1–2 天）**
1. C-2：MFA 重新绑定要求当前因子；所有 MFA 校验路径接入限流。
2. C-1 的止血部分：审计外键改 `Restrict`/`NoAction`，`admin_operation_logs` 取消 CASCADE；哈希改用键排序的规范化序列化。
3. M-1：`_text` 变量按 JSON 转义，`escapeJsonString` 覆盖全部控制字符，修正默认企业微信模板。

**P1（发布后两周内）**
4. C-1 的完整部分：新增链验证端点 + 周期校验任务并告警；验证逻辑锚定 genesis 并断言 `chainSeq` 连续；改 HMAC 并对应用角色 `REVOKE UPDATE/DELETE`；审计写入并入业务事务或走 outbox。注意需要为存量已破损记录设计一次性重锚定迁移。
5. M-3（管理员邮箱大小写——这是正在影响可用性的真实 bug）、M-2（按 host 判定服务商）、M-10（补 PR/分支 CI 触发）。
6. L-1（全局异常过滤器 + `ParseUUIDPipe`）——这条修复成本低、收益覆盖面广。

**P2（一个月内）**
7. M-4、M-5、M-6、M-7（账号解析歧义、CSRF 会话绑定、限流器重构、密码哈希迁移 argon2id 并支持重哈希）。
8. M-8、M-9（Flutter 原生会话持久化决策、设置页表单回绑修复）。
9. L-2 至 L-6 的输入边界、配额与并发唯一性问题。

**P3（技术债）**
10. L-10 改为 `APP_GUARD` 默认拒绝 + `@Public()` 显式豁免——这是防止未来漏加守卫的结构性改进，价值高于其排位。
11. CSP nonce 化以去掉 `'unsafe-inline'`；Actions 按 commit SHA 固定；compose 补 `restart` 策略；nginx 启用 gzip。
12. 补测试：审计链的 Postgres 往返测试、IO/web 传输层（Cookie jar、重定向行为）、登录注册 widget 流程。

---

## 修复跟踪（2026-07-27，Claude Fable 5 修复轮）

以下修复均遵循 TDD（先写失败测试，再实现，再验证通过），已在本地验证但**尚未提交**，等待 Hermes 复核。

| 发现 | 状态 | 修复内容 | 测试 |
|---|---|---|---|
| C-1 审计链 | ✅ 已修复 | 哈希改为递归键排序的规范化序列化（兼容 jsonb 键序重排）；新增应用层连续计数 `chain_index` 并纳入哈希；新增单行链头表 `security_audit_chain_heads` 锚定最新条目；`verifyAuditChain` 强制 genesis 锚定、`chain_index` 连续、可对照链头检测尾部截断；审计表与 `admin_operation_logs` 的用户外键整体移除（历史行不可再被 SET NULL/CASCADE 改写）；新增 `SecurityAuditService.verifyChain()`、管理端点 `GET /api/admin/security-audit-logs/chain-verification` 与面板「校验审计链」按钮。migration：`20260727_000018_harden_security_audit_chain`（存量行保持原样、标记为链前历史，不破坏生产数据） | `security-audit-chain.spec.ts`（14）、`security-audit-chain.postgres.spec.ts`（9，真实 Postgres 写入-读回-篡改）、`admin-audit-chain-report.spec.ts`（3） |
| C-2 MFA 绕过 | ✅ 已修复 | `totpEnabledAt` 非空时 `mfa/totp/start`/`confirm` 必须携带当前因子（`X-CloudTodo-MFA-Code` 头，服务层 `assertActionConfirmation` 强制）；所有 MFA 校验路径（登录、动作确认、enrollment confirm、disable）按管理员 ID + 来源 IP 双维度失败限流（5 次/15 分钟，只计失败，锁定期内有效码也拒绝） | `admin-mfa-stepup.spec.ts`（11）、`admin-mfa.spec.ts`（10） |
| M-1 模板非法 JSON | ✅ 已修复 | `_text` 变量与普通变量一样 JSON 转义；`escapeJsonString` 改用 `JSON.stringify` 派生，覆盖全部 U+0000–U+001F | `notification-endpoint-template.util.spec.ts` |
| M-2 子串判定服务商 | ✅ 已修复 | 改为解析 URL 后精确匹配 `hostname === 'qyapi.weixin.qq.com'` 且 `pathname === '/cgi-bin/webhook/send'`，解析失败回落到带签名的 standard_webhook | 同上（12 项，含 query/path/lookalike host 伪装用例） |
| M-3 邮箱大小写 | ✅ 已修复 | `AdminService.login` 与 `updateUser` 统一小写归一化，重复检查按归一化值比较 | `admin-email-normalization.spec.ts`（6），并在真实服务器上用 `Admin@Example.COM` 登录验证成功 |
| M-10 CI 仅 tag 触发 | ✅ 已修复 | 两个 workflow 增加 `push: branches: [main]` 与 `pull_request:` 触发，保留 tag/manual 与最小 `permissions: contents: read`；server CI 补 `SYNC_TEST_DATABASE_URL`（此前该套件在 CI 中被静默跳过） | CI 配置变更，待下次 push/PR 生效 |
| L-1 无全局异常过滤器 | ✅ 已修复 | 新增 `ApiExceptionFilter`（`APP_FILTER` 全局注册）：统一 `{code,message}` 契约，Prisma P2023/P2003→400、P2025→404、P2002→409，未知错误 500 且不泄露内部信息，headersSent 时不重复写响应；所有 `:id` 路由参数加 `ParseUUIDPipe` | `api-exception.filter.spec.ts`（10） |

**明确未修（按审查 P1/P2 排期，需架构决策）**：HMAC 密钥化哈希 + KMS、对应用角色 `REVOKE UPDATE/DELETE ON security_audit_logs`、审计写入并入业务事务/outbox、周期性链校验任务与告警、M-4~M-9、L-2~L-15。当前链仍为无密钥 SHA-256：可发现事后篡改，但拿到写库权限且知晓算法者仍可整链重算——这一残余风险已在上文根因五说明。
