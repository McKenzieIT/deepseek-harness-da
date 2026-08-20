# G3c — credentials-keychain-host mount landing（G3 stable crux）

**Type**: prototype（/prototype landing + 解 global-writes gap；HITL）
**Phase**: 2（生产）
**Status**: Resolved (2026-08-20)
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

## Design / Resolution（2026-08-20 resolved，/prototype landing + grill A/B/C + Cordis 机制核实）

**global-writes gap 解法 = (A) writable fallback shim**（grill 推荐→用户确认；(C) Cordis 证伪出局）。

- **(C) Cordis 证伪**：`vendor/cordis/src/reflect.ts` `provide()` — `if(this.store[key]) throw "service X has been registered at <fiber>"`；同名同 scope 双 provide throw；`set` 只允许原 fiber 覆写 → patch 不能 override base 的 'credentials' → 须 disable base credentials + 单 keychain provider。
- **KeychainFallback += 可选 `set?/unset?`**（additive，`packages/credentials/credentials-keychain/src/index.ts`）：keychain `set(no userId)` delegate `if(fallback.set) fallback.set(ref,value) else throw`；`unset(no userId)` delegate `if(fallback.unset) fallback.unset(ref) else no-op`。无 userId 路径（全局凭证）总走 fallback；per-user miss 走 perUserFallbackRefs 门控（G3b decision 4，已落）。
- **credentials-local additive export `renderDocument`**（comment-preserving 渲染器，原内部函数）：host shim 复用它 + `writeFileAtomic`+`withFileLock`+`parseCredentialsDocument`（皆既有 export）做 file 写，无 DRY 重复（reusing building blocks）。

**落地 `packages/credentials/credentials-keychain-host/`（新包，typecheck-clean + 6/6 tests green）**：

- function plugin（无 static Config——config 透传让 injectable `runner` 到 apply）；`apply(ctx,config)` async + `await ctx.plugin(KeychainCredentialProvider,...)` 确保 ensureKeychain 完。
- **writable file-shim fallback**（`makeFileFallback`，非 Service 避 double-register）：read 缓存 parseCredentialsDocument；set/unset 经 `withFileLock`+`renderDocument`+`writeFileAtomic` 写 `.credentials.yaml`（comment-preserving）+ env-shadow 拒（mirror credentials-local）+ 缓存失效。resolve/describe 读 env>file>dotenv。
- **unlockPasswordSource**: `interactive`(默认, tty stdin prompt, 非 tty→undefined 须 pre-created+unlocked) | `env`(read process.env[var], bash 可读弱化锁) | `none`。autoLock:300（保 P12b locked-when-idle 收窄）。
- **perUserFallbackRefs**: host Config 的 `string[]`→Set（early=undefined=all、stable=空 set=per-user 必填）。
- **mount mechanics**（G3b 已核实）：`ctx.plugin(KeychainCredentialProvider)` 构造 auto-register 成 ctx.credentials（Service 构造 `ctx.reflect.provide`）；shim 是 plain object 非 Service → 不 double-register；bundle 须 disable base credentials（disable-only，additive）+ mount host。

**bundle 接线 = opt-in（文档化，非 active）**：active 行（`- id: credentials disabled:true` + mount host）会使 data-agent profile boot 时强依赖 macOS+keychain+unlockPassword（非 mac CI/dev-without-keychain 崩）→ **不 commit active 行**（同 P12b 先例：落 keychain 包但不在 bundle 挂 active），host README 文档化 opt-in 接线（含 config 示例）。部署 ready for macOS keychain 时 uncomment。

**测试**（6/6 green，`tests/host.spec.ts`）：mounts keychain as ctx.credentials + per-user 隔离 + 全局写经 shim（file comment-preserving round-trip）+ unset + fallback-off stable（per-user miss→undefined、global 仍走 shim）+ env-shadow 拒。

**毕业雾**：map「keychain 作 ctx.credentials 的 global-writes gap」**毕业**（G3c decision A 解）。

## Assets

- `packages/credentials/credentials-keychain-host/`（新包全套：`src/index.ts` host apply+writable shim+unlockPassword 解析、`src/invariant.ts`、`tests/host.spec.ts` 6 green、`package.json`、`tsconfig.json`、`README.md`）。
- `packages/credentials/credentials-local/src/index.ts`：additive `export renderDocument`。
- `packages/credentials/credentials-keychain/src/index.ts`：`KeychainFallback` += `set?/unset?`；`set`/`unset` delegate（no userId）。
- `tsconfig.host.json`：+`credentials-keychain-host` ref。
