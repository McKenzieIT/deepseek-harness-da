# G3b — per-user Qoder PAT provisioning 生产接线（G3 stable）

**Type**: prototype（/grilling + /domain-modeling 一问一答 → /prototype landing；HITL）
**Phase**: 1（G3 stable 续；跨 P3/P9/P8b/P12b 接线）
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-session 2026-08-20 (G3b)
**Depends on**: G3（per-user PAT 设计，resolved 2026-08-19）· P12+P12b（keychain provider+per-user 寻址+branding+at-rest+locked+re-unlock）· P3（subagent-qoder MVP T1 全局）· P9（admin+per-user 登录 prototype）· P8b（audit 生产包 per-user Qoder feed）· P10（mTLS 门禁）· T1（Qoder PAT 全局 file 层）—皆 resolved
**Blocks**: G3c（keychain-host mount landing，decision 1 crux）· P9b（per-user 登录生产 = Stratum B enabler，decision 3/5 + identity 真值）

## Question

把 G3 early-phase 设计（T1 全局 fallback、P3 MVP 用全局 `resolve(ref)` 无 address）转 **stable 生产接线**：per-user PAT 必填 + fallback off + 接 P12b keychain provider 生产形态。grill 7 关键决策定夺 → 产最廉 concrete artifact。

## Context（code-grounded，grill 支点）

- **seam**（`packages/credentials/credentials/src/index.ts`）：`ctx.credentials` = 单一 `CredentialProvider`（非 registry）；四方法 `address?: CredentialAddress`（`{userId?,scopeId?}`）条件 arity；seam 拥 `notifyUpdated` + `credentials/updated(ref,address?)`。branding `UserId`/`ScopeId` `Branded`。
- **P12b keychain provider**（`packages/credentials/credentials-keychain/src/index.ts`）：`KeychainCredentialProvider` per-user CRUD（`service=ref,account=userId`）+ G3 staged fallback 建进 provider 内（`fallback?: KeychainFallback` read-only `{resolve,describe}`，per-user miss/global→fallback）；Config 无 `static Config: z`（injectable `runner`/`fallback` 不合 yml）；`runner: SecurityRunner` 必填（prod=`securityCli`）；`unlockPassword?`；re-unlock-on-locked。
- **local provider**（`packages/credentials/credentials-local/src/index.ts`）：`LocalCredentialProvider` file 层 `~/.dsh/.credentials.yaml`（env>file>dotenv）；有 `static Config: z`（yml-mountable）；`resolve(ref)` 单参 = 天然 `KeychainFallback`。= T1 全局 fallback 落点。
- **P3**（`packages/subagent/subagent-qoder/src/index.ts`）：`QoderProvider.start` 现 `resolve(QODER_PERSONAL_ACCESS_TOKEN)` 无 address（MVP T1 全局）。
- **P8b**（`packages/data/audit/src/index.ts`）：`resolveIdentity()` 返 `{}`（T1 fallback，P9 未建）；hook `tools/post-execute` 读 `result.value.costs` tag `qoder_call`+Credits。
- **P9**：仅 prototype（`prototypes/p9-admin-access-isolation/`），无生产包。per-user 登录 net-new（harness 无 login 基建，唯一身份=anon install id）。
- **base mount**（`packages/bundle/base/cordis.patch.yml:85`）：`- id: credentials name: '@deepseek-ai/dsh-credentials-local'`（yml）。patch 语义=target row 替换整 config、`disabled:true` 可关。keychain provider 无 mount 行。
- **Cordis 机制**（`vendor/cordis/src/service.ts` + `registry.ts`）：`ctx.plugin(Service,config)` 注册 service 绑 `ctx.<name>`；**Service 构造函数立即 `ctx.reflect.provide(name,self,check)`（auto-register）**→ 构造 LocalCredentialProvider 作 fallback 会 double-register 'credentials'；无 `static Config` 的 Service 经 `ctx.plugin` config 透传（含 injectable）；**访问未 inject 的 `ctx.<service>` 抛 "cannot get property without inject"（无 soft optional）**→ 须硬 inject。

## Design / Finding（2026-08-20 resolved，/grilling 7 决策一问一答 + /prototype landing + Cordis 机制核实）

**META（scope）= A**：落 Stratum A（P9-独立 scaffolding）+ 开 P9b 延后 Stratum B（P9-依赖真实 per-user provisioning）。7 决策中 **2/4/6 + identity seam 落地（green，typecheck-clean）**，**1（crux）spec'd landing-ready（开 G3c，含 global-writes gap 发现）**，**3/5 延后 P9b**，**7 verified**。

**7 决策（grilling 推荐→用户确认）**：

1. **keychain provider mount 形态（crux）→ SPEC 到 G3c landing**：
   - **1a mount 形态 = (a) 新薄 host/composite package**：static Config 接 yml 标量（path/autoLockSeconds/lockOnSleep/unlockPasswordSource/perUserFallbackRefs）+ `apply(ctx,config)` 程序式构造 **plain file-shim fallback**（复用 credentials-local 的 `parseCredentialsDocument` + `launchEnvironmentOf`，非 Service 避 double-register）+ `ctx.plugin(KeychainCredentialProvider, {runner: securityCli, fallback: shim, ...})`；data-agent bundle `- id: credentials disabled:true`（关 base local，keychain 唯一 ctx.credentials）。Cordis 机制核实：Service 构造 auto-register → fallback 须 plain shim（非 LocalCredentialProvider 实例）；ctx.plugin 透传 injectable config。程序式 ctx.plugin 先例（`packages/examples/agent-spine-demo/src/index.ts:220+`）。
   - **1b unlockPassword/autoLock = autoLock:300（保 P12b locked-when-idle 收窄）+ unlockPasswordSource: 'interactive'(默认,安全) | 'env'(无值守 fallback,bash 可读弱化锁,诚实文档) | 'none'**。P12b §7.3 secret-to-protect 递归：唯一真正安全=interactive（不落盘/env）；runtime-exfil ACL 经 grill 判为 over-spec（P12c dropped 2026-08-21——破坏开箱即用 + 非硬边 + 威胁已被 P12b landed + P10 工具门禁覆盖），不作为需求；interactive unlockPassword 是 security-CLI 内最安全选项，残余解锁期窗口由 auto-lock + P10 工具门禁收窄。
   - **⚠️ global-writes gap（G3b 深挖发现，G3c 须解）**：P12b 的 `KeychainFallback` 是 **read-only** `{resolve,describe}`；但**全局凭证写**（Models 页写 DEEPSEEK_API_KEY、更新 T1 全局 PAT）需 writable 层；keychain `set(no userId)` 现 **throw**（不 delegate fallback.set）。把 keychain 挂成 ctx.credentials（替 base local）暴露此 gap——全局写无处去。**G3c landing 须解**：(A) fallback 升级 writable（KeychainFallback 加 set/unset + shim 实 file 写，DRY 代价）OR (B) keychain `set(no userId)` delegate 到 writable fallback OR (C) 保 base local mount + keychain 组合（须核 Cordis 多 provider 'credentials' last-wins/compose 语义）。+ interactive stdin prompt in apply（tty/非 tty 处理）。**此 gap 是 G3b grill 浮出的真设计问题，deserves focused G3c landing（非 rushed）。**

2. **P3 per-user 切片接线 → LAND（green，27/27）**：subagent-qoder `QoderProvider.start` 改 `resolve(QODER_PERSONAL_ACCESS_TOKEN, { userId: ctx.identity.current()?.userId })`（MVP 无 address→T1 全局 进化）。userId 源 = **ctx.identity seam**（P9b 填真值）。**Cordis 机制**：访问未 inject 的 `ctx.<service>` 抛 "cannot get property without inject"（无 soft optional）→ identity 须作 P3 **硬 inject**（`inject=['subagents','credentials','identity']`）；data-agent bundle 总 mount identity stub（`current()=undefined`=global，等价 MVP 全局行为，非"identity 缺失"）。今日 no-op→global，P9b 填→per-user。+ 5 测试 mount IdentityService + 2 断言更新 `(REF, undefined)` + 1 per-user 线程测试（FixedIdentity→resolve 带 `{userId}`）。

3. **P9 per-user 自助 set 接 keychain → DEFER P9b**：P9 生产包不存在（仅 prototype）。真实 per-user 自助 `set(ref,value,{userId})` + UI 流 + keychain unlock 须 P9 落生产包（admin+gate+login+access-link+storage domain，类 P12b 的 auth 子系统）。延后 P9b。

4. **fallback off 切换 → LAND（green，28 tests）**：`KeychainCredentialProvider` 加 additive `perUserFallbackRefs?: Set<CredentialRef>`：per-user miss 路径 `ref∈set→fallback`（G3 early T1），`∉→undefined`（stable per-user 必填→caller reject）；无 userId 路径（全局凭证）**总走 fallback**（常开，保 DEEPSEEK_API_KEY 等）。默认 `undefined=all=early`（后兼容 P12b）；stable host 配 set 排除 QODER。dormant till keychain-host mount（G3c）。

5. **per-user PAT 必填 UX → DEFER P9b**：必填 vs lazy + 无 PAT 请求处理须 per-user 登录态（P9b）。stable 切片：fallback off（decision 4）+ per-user miss→undefined→P3 reject（"not configured"）已是 stable 必填行为；真 UX（登录后必填 vs lazy 提示）延后 P9b。

6. **审计接线 → LAND（green，13/13）**：P8b `resolveIdentity()` 改读 `ctx.identity.current()`→`AuditIdentity`（userId→user_id, tenantId→tenant_id, scopeId→scope_id）；今日 stub→`{}`→NULL 列（T1 fallback 不变）；P9b 填→per-user 归属。audit 加 `static inject=['identity']`（同 P3 硬 inject 理由）+ 测试 mount IdentityService + 1 per-user 归属测试（FixedIdentity→record carries user_id/scope_id/tenant_id）。

7. **scope 正交性 → VERIFIED**：grep 实证 `query-maxcompute/src/index.ts:266` `pushCredentials(scopeId)` 用 `ctx.credentials.resolve(ref)` **无 scopeId address**（ODPS access_id/key 全局，P9 (i) 落地）；per-scope = sidecar `set_credentials` scope_id + OdpsConfig region，**非 ctx.credentials 维度**。**无 caller 用 `{scopeId}` 经 ctx.credentials** → keychain 只处理 userId **完全够**（`CredentialAddress.scopeId?` forward-compat 未用）。不扩 keychain scopeId（YAGNI；未来 P9 (ii) per-scope-入-keychain 才需）。

## 落地（tasks 1-4，皆 typecheck-clean + tests green）

- `packages/credentials/credentials-keychain/src/index.ts`：+ `perUserFallbackRefs?: Set<CredentialRef>`（decision 4；Config + class field + resolve/describe 门控）+ 测试。dormant till G3c mount。
- `packages/identity/identity/`（**新包**）：`IdentityService extends Service`，`current(): CallerIdentity | undefined` stub 返 undefined；`declare module Context { identity }`；`CallerIdentity { userId?, scopeId?, tenantId? }`。+ invariant + test + README + tsconfig + tsconfig.host ref。P9b 填真值。
- `packages/subagent/subagent-qoder/`：`resolve(ref,{userId})` threading + `inject` 加 'identity' + dsh-identity dep + 测试（27/27 green）。
- `packages/data/audit/`：`resolveIdentity` 读 `ctx.identity.current()` + `static inject=['identity']` + dsh-identity dep + 测试（13/13 green）。
- `tsconfig.host.json` +identity ref（surgical，credentials-keychain 后）；audit + subagent-qoder tsconfig +identity reference。

## 延后

- **G3c（新票 `tickets/phase-2/G3c-credentials-keychain-host-mount.md`）**：decision 1 crux mount landing——keychain-host 包（host apply + plain file-shim fallback + unlockPasswordSource）+ bundle `- id: credentials disabled:true` + mount host + tsconfig.host ref。**须解 global-writes gap**（writable fallback / set-delegation / double-provide-verify）+ interactive unlockPassword prompt（tty/非 tty）。design 已 verified-ready against Cordis 机制；global-writes gap 是 G3b 浮出的待解。
- **P9b（新票 `tickets/phase-2/P9b-admin-access-isolation-hardening.md`）**：per-user 登录生产包（admin+gate+login+access-link+storage domain，类 P12b auth 子系统）= Stratum B enabler。填 ctx.identity 真值（激活 decision 2/6 per-user）+ decision 3（自助 set 接 keychain）+ decision 5（必填 vs lazy UX）。

## 毕业雾

- G3 Deferred「scope 正交性确认」**毕业**（decision 7 verified：无 {scopeId} ctx.credentials caller；per-scope 在 sidecar+OdpsConfig）。
- 新雾（G3c 须解）：**keychain 作 ctx.credentials 的 global-writes gap**（read-only fallback ⊥ 全局写需求）——G3c landing 时清。

## Assets

- 落地包/改：`packages/credentials/credentials-keychain/src/index.ts` + tests；`packages/identity/identity/`（新包全套）；`packages/subagent/subagent-qoder/{src/index.ts,package.json,tests/,tsconfig.json}`；`packages/data/audit/{src/index.ts,package.json,tests/,tsconfig.json}`；`tsconfig.host.json`。
- 新票：`tickets/phase-2/G3c-...md` + `tickets/phase-2/P9b-...md`。
