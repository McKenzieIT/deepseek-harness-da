# P12 — credentials keychain/KMS provider + per-user 凭证寻址

**Type**: prototype
**Phase**: 2（capability seams / credentials）
**Status**: Resolved (2026-08-19)
**Assignee**: wayfinder-session 2026-08-19
**Blocks（软/切片，非硬边）**: per-user PAT 功能切片（G3 设计，分布 P3/P9 的 **per-user 切片**，非 P3/P9 整票——P3 MVP 用 T1 全局、unblocked）+ P9 per-user 凭证管理。P12 是这些切片的**前置基建**，但**不锁 P3/P9 整票**。

**Question**: 给 credentials seam 加 deferred OS-keychain/KMS provider（agent/bash at-rest 不可读）+ per-user 凭证寻址（`ctx.credentials.resolve(ref, { userId })`），作 per-user PAT + P9 per-user 凭证的共享基建。

**Context**:
- seam 现有 provider：`credentials-local`（file `.credentials.yaml` + env/.env 层，flat-namespace `resolve(ref)`，无 user/scope 维度）+ env 层。`resolve(ref)` 签名无 scope/user（"one flat POSIX-identifier namespace until a provider needs richer addressing"——credentials README）。
- **R2 已决 per-scope 寻址**（MaxCompute `resolve + scope_id`，per-call，P4 实现）。**本票是 per-user 维度**——与 per-scope 正交：同一 ref 可按 user 解析（per-user PAT）或按 scope 解析（per-scope MaxCompute 凭证）。
- additive-only：扩 seam（新 provider + 寻址维度），不改 core；保上游升级路径。
- 来源：G3 grilling 决策——per-user PAT 存 keychain provider（agent at-rest 不可读 = "keep keys away from its own agent" 的答案）。

**Open sub-decision（本票内决，可能先 /research 查可用后端）**：keychain 后端选型——OS keychain（macOS Keychain / libsecret / Windows Credential Manager，per-host）/ KMS（阿里 KMS / AWS KMS，central）/ Vault。判据：多用户 harness 部署形态（单 host？多 host？）+ intranet-security-first（agent at-rest 不可读）+ 既有基建。注：OS keychain per-host → 多 host 要同步；KMS central → 需网络 + KMS 凭证链。

**Scope**:
- 新 provider（`@deepseek-ai/dsh-credentials-keychain` 或同族），实现 `CredentialProvider` 四操作（resolve/describe/set/unset）over keychain 后端；agent/bash at-rest 不可读。
- 扩 `resolve`/`describe`/`set`/`unset` 到 per-user 寻址（`{ userId }`；与 R2 的 `{ scopeId }` 正交并存或统一为 `{ scopeId?, userId? }`）。
- per-user 写入经 `ctx.credentials.set(ref, value, { userId })`（自助：用户登录后填自己 PAT → 存其 per-user keychain 槽）。
- `credentials/updated` 事件 per-user 粒度热更新。

**Not doing**：per-user 登录/身份（P9）、Qoder PAT 业务语义（G3）、MaxCompute per-scope（R2/P4）。本票只建 provider + 寻址基建。

**Risks**：后端依赖（OS keychain native binding / KMS 网络）；多 host 同步；per-user 与 per-scope 统一签名的设计成本。

---

## Finding/Design（2026-08-19 resolved，/prototype + grill）

**后端选型 = macOS Keychain（`security` CLI spawn，非 keytar）**。grill 先定向部署事实：生产拓扑 = 前期单机（用户 Mac）→ 后端天然收窄 macOS Keychain（零基建、native、无跨 host 同步；KMS/Vault 单机多余）。红线拆清：P12/G3 字面要求 = **at-rest 不可读**（credentials-local README "Security boundary" 原初顾虑"Tool processes can read this file exactly like any other file the user owns"）——把 PAT 从可 grep 的 `.credentials.yaml` 挪进加密 keychain 即满足（keychain DB 盘上加密，bash `cat`/`grep` 出密文非 PAT）。更强 **runtime-exfil**（agent 跑 `security find-generic-password -w` 查明文）由 P12b 的 locked-keychain + auto-lock + P10 工具门禁覆盖（at-rest + 窗口收窄到解锁期 + 业务用户 agent 禁 bash 触达不了 `security`）；per-item Touch-ID ACL 经 grill 判为 **over-spec**（破坏开箱即用；P12b 研究 §7.2/§A3 自证为增强非硬边），不作为需求——P12c dropped（2026-08-21），非 P12 at-rest 要求。keytar（native node-gyp）会污染 harness 构建链、危及 additive-only → 选 `security` CLI（macOS 原生零依赖）；跨平台（libsecret/CredManager）→ P12b。

**seam 扩展（additive，落真实 `packages/credentials/credentials`）**：四抽象方法 + `notifyUpdated` 加可选 `address?: CredentialAddress`（`{ userId?: string; scopeId?: string }`，统一 per-user/per-scope 维度，与 R2 per-scope 正交）；`credentials/updated(ref, address?)` 事件带 address。**条件 arity 保后向兼容**：全局变更保原 `listener(ref)` 单参 + 2 元 args（既有单参 listener/精确断言零涟漪——credentials-local `review-fixes.spec.ts` 的 `toHaveBeenCalledWith(ref)` 不动；全局路径与上游字节一致）；per-user 变更才 `listener(ref, address)` 扩参。LocalCredentialProvider 少参 override 仍合法（flat/全局 = G3 fallback 落点，per-user 落 keychain）。`CredentialAddress` 值对 seam 不透明（格式/来源属身份层 P9/Tenant）；branding userId/scopeId 为 cross-boundary id 延后 P12b。seam README 预告的 "one flat POSIX-identifier namespace until a provider needs richer addressing" 门由此穿过。验证：credentials + credentials-local 两包 `tsc --noEmit` 绿、66 测试全过（含新 per-user 隔离/正交维度/address-threading 测试）、scoped coverage `credentials/credentials/src` 无 uncovered 行（条件 arity 两分支均被现有+新测试覆盖）。

**prototype 验证**（`wayfinder/data-agent/prototypes/p12-credentials-keychain/`，live 跑于用户 Mac 对 scratch keychain，`pnpm exec tsx .../run.ts`）：per-user CRUD（`service=ref, account=userId`）、alice⊥bob⊥global 隔离、G3 分期 fallback（bob 无 per-user→全局 T1；unset alice 后回落 global）、`credentials/updated` 带 `{userId:'alice'}` address、**at-rest 红线兑现**（keychain DB 21976B，`grep 'sk-alice-demo'` absent——PAT 盘上加密、bash 读不到）。provider 链：KeychainCredentialProvider 包装 fallback provider，per-user 命中返 keychain、miss/无 userId 委托 fallback（全局）。

**延后 P12b（生产硬化票，blocked by P10）**：runtime-exfil ACL/code-signing（限 harness 二进制读、排除 bash/terminal）+ 独立 locked keychain + 交互/Touch-ID unlock；多 host central backend（KMS envelope / Vault transit）；跨平台（libsecret/CredManager）；真实 `@deepseek-ai/dsh-credentials-keychain` 包（含 per-file 100% 覆盖门测试）；userId/scopeId branding。provider 抽象已让后端以后可换不碰 seam/寻址——现在建简版不 paint into a corner。

**解锁**：P12 per-user 寻址基建（seam `{userId?}` 签名 + prototype 验证）解锁 G3 per-user 切片——P3 的 caller-parameterized `resolve(ref,{userId})` + fallback 层、P9 的 per-user 自助 `set(ref,value,{userId})` + per-user 登录态。P3 MVP 仍用 T1 全局（unblocked），per-user 切片待 P3 构建期接线。
