# P12b — credentials keychain 生产硬化（ACL + 多 host + 真实包）

**Type**: prototype
**Phase**: 2 / 生产
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-session 2026-08-20
**Blocks**: 生产期 per-user PAT 必填阶段（G3 stable：fallback off、per-user PAT 必填）
**From P10（内网穿透 resolved 2026-08-20）**：P10 定前期 single-host 拓扑（Mac 内网直接可达、Caddy 反代+mTLS、无隧道）→ 前期 macOS Keychain 够（P12 已落地）；多 host central backend（KMS envelope / Vault transit）= 本票生产 scope，非 P10 前置（P10 拓扑依赖解除，本票 unblocked）。ACL/runtime-exfil 部分本身 P10 无关，作生产期 bundle 一并取。

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

## Finding/Design（2026-08-20 resolved，/prototype + /grilling 一问一答 + /research subagent）

**6 决策（grilling 推荐→用户确认）**：
1. **runtime-exfil ACL（crux）→ DEFER 到 P12c**：research（[`research/p12b-keychain-acl-feasibility.md`](../../research/p12b-keychain-acl-feasibility.md)，cited TN3137/TN3133/`kSecClassGenericPassword`/`SecAccessControlCreateFlags`/forum 691188，§8 adversarial 自审）+ 实测（scratch keychain `security` probe）**双向确认 security-CLI-only 不可达**：`security find-generic-password -w` 的 ACL accessor 是直接调用者 `/usr/bin/security`（Apple 签名，`identifier "com.apple.security" and anchor apple`），非 spawner——harness 与 bash 经同一 Apple 签名 CLI 子进程读，path/identity ACL 不可区分。实测三证：(a) 默认 item 仅信 `/usr/bin/security`→bash-spawn-security 读成（accessor=security CLI 命中）；(b) `-T "" -T /bin/bash` restricted item 连 harness 都读不到（accessor≠bash）；(c) `dump-keychain -a` 显示 ACL 按 Apple identity 非 path。`security` CLI 仅 `-T appPath`（path、可伪造；`SecTrustedApplicationCreateFromPath` 10.15+ deprecated）+ `set-keychain-settings`（keychain 级）+ `set-*-partition-list`，**无** per-item Touch-ID/`SecAccessControl`（需 native `SecItemAdd`+`kSecUseDataProtectionKeychain`+`kSecAttrAccessControl`）。identity-based ACL 需 Developer-ID 签名 harness 二进制（ad-hoc/self-signed 可伪造；当前 harness 是 `pnpm exec tsx` 脚本，无二进制可签）。→ 落 security-CLI 能做的 + **DEFER per-item ACL/runtime-exfil 到 P12c**（native binding + harness code-signing），依赖 harness 打包分发流程。
2. **locked keychain + unlock → LAND**：独立（非 login）keychain + `set-keychain-settings -t -l -u`（auto-lock + lock-on-sleep + lock-after-timeout）+ 启动 `unlock-keychain -p` + teardown `lock-keychain`。**live 实测** `set-keychain-settings` 当前 CLI 仅 `[-lu] [-t]`，`-c`（lock-on-logout）不在当前 CLI 故不设（research note §3.3 的 `-c` 是版本误引，live e2e 捕获并纠正）。诚实：at-rest-when-locked + 收窄 runtime-exfil 到解锁窗口（未消除）；`unlockPassword` 是新 secret-to-protect（interactive 安全 / stored 弱化，因同 spawner 不可区分）。
3. **多 host central backend → DEFER**：P10 已定前期 single-host；central backend 是跨网/多 host 真需求时另票（YAGNI）。留 map 雾「跨网/多 host 部署形态」。
4. **真实包 → LAND**：`packages/credentials/credentials-keychain/`（package.json/tsconfig/src/invariant.ts/README bilingual + i18n pair + tests），镜像 credentials-local 约定。
5. **branding → LAND in seam**：`packages/credentials/credentials/src/brand.ts` 新增 `UserId = Branded<'UserId'>`/`ScopeId = Branded<'ScopeId'>` + lowercase factory `userId()`/`scopeId()`（镜像 seam 自身 `credentialRef` lowercase 约定，非 dsh-llm 的 capital factory）；`types.ts` `CredentialAddress` 用 branded（兑现 P12 显式延后 + AGENTS「opaque cross-boundary ids are branded」）；`index.ts` re-export；tests 用 factory。additive（seam 内 4 文件：brand.ts 新 + types.ts/index.ts/credentials.spec.ts 改 + memory.ts 不动只读 address），无 tsconfig.base 改。
6. **cert-CRL → SPLIT**：cert 吊销属 transport 层、与 keychain PAT 正交；P12b 守 keychain 焦点，cert-revocation 入 map Not-yet-specified 作 transport-secret-lifecycle follow-up（部署期 ops 或独立小票）。

**落地（生产包 `packages/credentials/credentials-keychain/`）**：`KeychainCredentialProvider extends CredentialProvider`——per-user CRUD（`service=ref, account=userId`）+ G3 staged fallback 注入（`KeychainFallback` read-only {resolve,describe}）+ locked-keychain/auto-lock/teardown-lock + branded `userId` + injectable `SecurityRunner`/`KeychainFallback`（无 `static Config`/Schemastery，因 injectable deps 不合 yml；config 编程式传入，`resolveSpec` 显式默认）+ production 错误区分 miss vs fault（`isItemNotFound` stderr regex：found/not-found→undefined/real-error→throw）。`securityCli`（real `/usr/bin/security` spawn，`export` 出供生产/live-e2e 显式传）v8-ignored（live-only，非 mac CI 不跑）；unit tests 注入 `FakeKeychain`（in-memory `security` 模拟 + fault injectors）覆盖 provider 全逻辑；live macOS e2e（`describe.skipIf(process.platform !== 'darwin' || !process.env.DSH_KEYCHAIN_LIVE)`）实测 real `securityCli` 在 scratch keychain round-trip PAT（本机 darwin 实跑：21/21 绿，scratch 自清）。**per-file 100% 覆盖门**：`src/index.ts` + `src/invariant.ts` 全绿（`securityCli` v8-ignored 排除）。`invariant.ts` no-op companion（镜像 credentials-local；seam 拥有 `credentials/updated` invariant，provider 行为由 unit suite 钉）。branding 改 seam `credentials` 包（brand.ts+types.ts+index.ts+credentials.spec.ts），seam tests 66 绿、src typecheck 绿（rebuild lib 后 keychain 解析 fresh decl）。

**延后 P12c（新票 `tickets/phase-2/P12c-...md`）**：runtime-exfil ACL = native Security-framework binding（`SecItemAdd`+`kSecAttrAccessControl`+`kSecUseDataProtectionKeychain` per-item biometry）+ harness 打包成可签名 binary + Developer-ID code-signing；**依赖 harness 分发流程建立**（Apple Developer Program、notarization、打包 .app/.exec），非 keychain 包独立可决。blocked by harness 分发。

**解锁下游**：G3 stable per-user PAT 必填阶段（fallback off、per-user PAT 必填）——P12b 的 at-rest + locked-keychain + per-user CRUD + branding 达生产门槛，G3 可转 stable。

**毕业雾**：「跨网/多 host 部署形态」留（P10 resolved 立的，P12b defer central backend 细化之）；新雾「cert-revocation（transport-secret lifecycle）」+ P12c（native binding + code-signing，blocked by harness 分发）入 map Not-yet-specified。
