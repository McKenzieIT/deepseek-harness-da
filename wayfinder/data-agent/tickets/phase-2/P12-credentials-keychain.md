# P12 — credentials keychain/KMS provider + per-user 凭证寻址

**Type**: prototype
**Phase**: 2（capability seams / credentials）
**Status**: Unblocked
**Blocks**: per-user PAT 落地（G3 设计的实现，分布 P3/P9）+ P9 per-user 凭证管理

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
