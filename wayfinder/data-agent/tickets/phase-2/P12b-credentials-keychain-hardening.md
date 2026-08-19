# P12b — credentials keychain 生产硬化（ACL + 多 host + 真实包）

**Type**: prototype
**Phase**: 2 / 生产
**Status**: Blocked by [P10](P10-intranet-tunneling.md)（多 host backend 选型等拓扑）
**Blocks**: 生产期 per-user PAT 必填阶段（G3 stable：fallback off、per-user PAT 必填）

**Question**: 把 P12 prototype 的简版 keychain provider 升级到生产：runtime-exfil 硬化（per-item ACL 限 harness 二进制读、排除 bash/terminal，需 harness code-signing）+ 独立 locked keychain + 交互/Touch-ID unlock；多 host 部署的 central backend（KMS/Vault）；跨平台（libsecret/CredManager）；落地真实 `@deepseek-ai/dsh-credentials-keychain` 包（per-file 100% 覆盖门）；userId/scopeId branding。

**Context**:
- P12（resolved 2026-08-19）已建 seam `{userId?, scopeId?}` 寻址 + macOS Keychain prototype（`security` CLI），**兑现 at-rest 红线**（PAT 不再可 grep）。本票是 P12 明确延后的生产硬化部分。
- 红线两层：at-rest（P12 已满足）vs **runtime-exfil**（agent 跑 `security find-generic-password -w` 查明文）——本票靠 per-item ACL + harness code-signing 堵。多 host 时 per-host keychain 无法同步 → central backend。
- 触发时机：生产期 per-user PAT 必填（G3 stable fallback off）+ 多 host 部署形态确定（P10 解）。本票 blocked by P10：多 host backend 选型（KMS envelope / Vault transit）依赖 P10 拓扑决策；ACL/runtime-exfil 部分本身 P10 无关，但作生产期 bundle 一并取。

**Scope**:
- per-item ACL 限 harness 二进制（code-signing identity）读、排除 bash/terminal——research-worthy：macOS `SecAccessControl`/`security add-generic-password -T` trusted-app 语义、keytar/`security` 能否设 ACL、dev 未签名 harness 的可行性。
- 独立 locked keychain（非 login）+ 启动交互 unlock / Touch-ID（runtime-exfil：bash 够不到 unlock 后的 keychain 需 ACL，独立 keychain + unlock 是 at-rest/runtime 双重）。
- 多 host central backend provider（KMS envelope / Vault transit），与 keychain provider 同 seam 抽象可换（P12 已留 provider 抽象）。
- 落地真实 `packages/credentials/credentials-keychain` 包（package.json/tsconfig/src/README + 测试过 100% 覆盖门，macOS-only `security` 路径用 v8-ignore/platform-skip 对齐 credentials-local 的 win32 处理）。
- userId/scopeId branding（`Branded<'UserId'>`/`Branded<'ScopeId'>` + factory，对齐 AGENTS "opaque cross-boundary ids are branded"）。

**Not doing**：per-user 登录/身份（P9）、Qoder PAT 业务语义（G3）、MaxCompute per-scope（R2/P4）、seam `{userId?,scopeId?}` 寻址（P12 已建）。

**Risks**：macOS ACL/code-signing 在 dev 未签名 harness 上难稳定设（`-T` 按 path 非 identity 可伪造）；多 host backend 选型依赖 P10 拓扑；原生 binding（若 keytar）跨平台构建链影响 additive-only；KMS/Vault 自身凭证链（新 secret-to-protect）。

**From P12**：P12 Design 明确延后至此——runtime-exfil/多 host/真实包/branding。
