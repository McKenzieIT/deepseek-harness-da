# P12c — native keychain binding + harness code-signing（runtime-exfil ACL）

**Type**: prototype
**Phase**: 2 / 生产
**Status**: **blocked**（by harness 分发流程建立：Apple Developer Program + notarization + 打包可签名 binary——非 keychain 包独立可决，亦非本 map 票可解）
**Blocks**: 完整 runtime-exfil ACL（per-item Touch-ID，限 harness 读、排除 bash/terminal）
**From P12b**（resolved 2026-08-20）：P12b Finding/Design §1+§7 显式 DEFER 至此——`security`-CLI-only runtime-exfil 不可达（accessor=/usr/bin/security，harness 与 bash 不可区分），完整 runtime-exfil 需 native binding + harness 签名。

**Question**: 经 native Security-framework binding + harness Developer-ID code-signing，达 per-item Touch-ID ACL（读限制到 harness 二进制、排除 bash/terminal），兑现 P12b 延后的 runtime-exfil 红线。

**Context**:
- P12b（resolved 2026-08-20）落了 `security`-CLI-only 的 `packages/credentials/credentials-keychain/`（at-rest + locked-keychain + per-user CRUD + branding），**诚实 DEFER** per-item ACL/runtime-exfil 到本票。[`research/p12b-keychain-acl-feasibility.md`](../../research/p12b-keychain-acl-feasibility.md) cited TN3137/TN3133/`kSecClassGenericPassword`/`SecAccessControlCreateFlags`/forum 691188 + adversarial §8。
- 红线两层：at-rest（P12b 已达，keychain DB 加密）vs **runtime-exfil**（agent 驱动 bash 读 PAT 外传）——本票靠 native binding + 签名堵。
- 本票 **blocked by harness 分发流程**：当前 harness 以 `pnpm exec tsx`/`node` 脚本形态跑，无二进制可签；Developer-ID 签名需 Apple Developer Program 会员 + notarization + 打包 .app/.exec——这是比 keychain 包远大的分发层工程，需先建立。

**Scope**:
- native Security-framework binding（`SecItemAdd`/`SecItemCopyMatching` 直接调，accessor = harness 二进制，非 `security` CLI 子进程）+ `kSecAttrAccessControl` + `SecAccessControlCreateWithFlags`（`.biometryCurrentSet`/`.userPresence`）+ `kSecUseDataProtectionKeychain`（data protection keychain，非 file-based）。
- harness 打包成可签名 binary + Developer-ID 签名（非 ad-hoc/self-signed——可伪造）。
- `kSecAttrAccessGroup`（绑 harness Team ID）或 `SecAccessCreate` + `SecTrustedApplicationCreateWithApplicationSignature(harness DR)` 限 harness 二进制读、排除 bash/terminal。
- 与 P12b 的 `security`-CLI provider 同 seam 抽象可换（P12 已留 provider 抽象）；native provider 替换或并列。

**Not doing**：keychain CRUD/seam（P12/P12b 已建）、PAT 业务语义（G3）、central backend（跨网/多 host 部署形态雾）、cert-revocation（transport-secret lifecycle 雾）。

**Risks**：native node-gyp/N-API binding 污染 harness 构建链（违反 P12 选 `security` CLI 的 additive-only 立场——需 team 显式放宽，或用 Swift 调 Security.framework 的稳定 ABI 走 sidecar 避 node-gyp）；harness 分发工程（Apple Developer Program、notarization、打包）本身是前置 blocked 项；native binding 自身凭证链（新 secret-to-protect 递归，同 P12b §7.3）；跨平台 native binding（libsecret/CredManager 各异）。

**Unblock 条件**：harness 分发流程建立（可签名 binary + Developer ID）——非本 map 可独裁，需团队/产品决策开「harness 打包分发」票或纳入分发线。unblock 后本票转 prototype（grill native binding 形态：node-gyp vs Swift sidecar vs FFI；grill code-signing DR 信任模型）。
