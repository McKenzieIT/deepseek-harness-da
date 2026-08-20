# G3c — credentials-keychain-host mount landing（G3 stable crux）

**Type**: prototype（/prototype landing + 解 global-writes gap；HITL）
**Phase**: 2（生产）
**Status**: Unblocked（G3b resolved 2026-08-20，scaffolding 已落）
**Assignee**: (unclaimed)
**Depends on**: G3b（decision 1 spec + identity seam + perUserFallbackRefs landed）· P12b（keychain provider）· P10（mTLS）
**Blocks**: 真实 per-user PAT 必填闭环（无 keychain 作 ctx.credentials 则 per-user 切片 dormant）

## Question

落 G3b decision 1 的 crux mount：把 `KeychainCredentialProvider` 挂成 `ctx.credentials`（替 base local），含 **keychain-host 包** + bundle 接线。**核心须解 G3b 浮出的 global-writes gap**：P12b 的 `KeychainFallback` 是 read-only `{resolve,describe}`，但全局凭证写（Models 页写 DEEPSEEK_API_KEY、更新 T1 全局 PAT）需 writable 层；keychain `set(no userId)` 现 throw（不 delegate）→ 挂成 ctx.credentials 后全局写无处去。

## Context（G3b 已 verified-ready）

- **mount 形态（G3b 1a 定）**：新薄 host package（`packages/credentials/credentials-keychain-host/`）—— static Config 接 yml 标量 + `apply(ctx,config)` 程序式构造 plain file-shim fallback（复用 credentials-local 的 `parseCredentialsDocument`+`launchEnvironmentOf`，非 Service 避 double-register）+ `ctx.plugin(KeychainCredentialProvider, {runner: securityCli, fallback: shim, ...})`；bundle `- id: credentials disabled:true`（关 base local，keychain 唯一 ctx.credentials）+ mount host + tsconfig.host ref。
- **Cordis 机制（G3b 核实）**：Service 构造 auto-register（`ctx.reflect.provide`）→ fallback 须 plain shim（非 LocalCredentialProvider 实例）；`ctx.plugin` 无 static Config 的 Service 透传 injectable config；程序式 ctx.plugin 先例 `packages/examples/agent-spine-demo/src/index.ts:220+`。
- **unlockPassword/autoLock（G3b 1b 定）**：autoLock:300 + `unlockPasswordSource: 'interactive'(默认)|'env'(fallback)|'none'`。interactive stdin prompt in apply（tty/非 tty 处理——非 tty（launchd）降级 none 或须 pre-created+unlocked keychain）。
- **perUserFallbackRefs（G3b decision 4 已落）**：host Config 的 `perUserFallbackRefs: string[]`→Set；early=undefined(all)、stable=空 set(per-user 必填)。

## Scope（global-writes gap 的解法待 grill/landing 定）

G3c 须解全局写 gap，三选一（grill 定夺）：
- **(A) writable fallback**：`KeychainFallback` 加 `set/unset`；host 的 shim 实 file 写（复用 credentials-local 的 `writeFileAtomic` + `withFileLock`，DRY 代价但可接受——reusing building blocks）。keychain `set(no userId)` delegate `fallback.set(ref,value)`。
- **(B) keychain set(no userId) delegate**：保 fallback read-only，但 keychain `set(no userId)` 改 delegate 到一个 writable global slot（须 fallback 升级或第二 writable 层）。
- **(C) 保 base local mount + keychain 组合**：不 disable base credentials；keychain 作 composite（须核 Cordis 多 provider 'credentials' last-wins/compose 语义——`ctx.reflect.provide` 多 provider 行为未 fully verified in G3b）。
- + interactive unlockPassword prompt 的 tty/非 tty 处理。

## Risks

- global-writes gap 解法影响 keychain provider 设计（A 改 KeychainFallback 接口=P12b 包改；B 改 keychain set；C 依赖 Cordis 多 provider 语义）。
- interactive prompt in apply（boot 阻塞）——非 tty server 降级处理。
- surgical 提交（并发活跃）。
