# P10 prototype — 内网穿透安全加固 (THROWAWAY)

> **Throwaway logic/state prototype.** Not production, not wired to real
> Caddy / `ctx.webServer` / P9 `dsh-admin` gate / P7 data-agent preset / P12
> keychain. Mirrors their *shapes* to validate the trust-boundary + tool-gating
> decision flow. Run:
>
> ```
> node run.mjs
> ```
>
> One command, no npm deps (`node:crypto` only). All checks must pass.
> Concrete transport config: `Caddyfile`（示意，部署时以 Caddy 文档为准）。

## Question settled

给定已锁前置约束，transport 形态 + mTLS 身份粒度 + 工具门禁执行点怎么定，才合
intranet-security-first？

前置约束（已从依赖锁定，无需再问）：
- **信任边界单一在 P9 `dsh-admin` gate**（门在其后）。
- **TLS 由门前 transport 终结 → 转发 webserver loopback `127.0.0.1`**（P9 已定）。
- **PAT 不每调用经 transport 明文、不进 process.env**（G3 已定，服务端
  `ctx.credentials.resolve` → `accessToken(value)`）。
- **前期单 host**（用户 Mac），多 host 生产 later（→ P12b central backend）。

## Grilling 锁定（本 session，/prototype + 一问一答给推荐）

1. **Transport = Caddy 反代 + mTLS（无隧道）**。Mac 内网直接可达 admin 经 P9
   分配的 addr:port；Caddy 终结 TLS+mTLS → 转发 loopback。最小暴露面、零
   隧道组件、信任边界单一在 gate。`frp`/`chisel` 前期 ruled out——跨网/多 host
   场景留作 additive 叠加（→ P12b 或跨网真需求时 ticket）。**这回答了 map
   雾"内网穿透技术选型（frp/chisel/...）"**：前期不需要隧道。
2. **mTLS = transport-only**。org/device 客户端证书（单一内部 CA，admin 签发，
   短命 + rotation）；per-user 身份 + scope 全在 P9 gate（per-user 登录 or
   access-link token）。非 per-user cert（那属 P12b 级生产硬化）。G3
   "per-user 登录 + mTLS" 中的 mTLS 即此 transport 层。
3. **工具门禁 = defense-in-depth**。P9 gate 标 `identity.kind`（business-user /
   admin / service）→ P7 data-agent preset 按身份套受限 allowlist（business-user
   禁 `bash` / `code-runtime-shell` / `file-write` / `str-replace-editor` /
   `AskUserQuestion` 委派）+ gate `tools/pre-execute` hook 兜底二次拒。具体
   per-phase 工具表在 P7（并发在做）落定时 wire。

## The crux: transport vs trust boundary

P10 的关键区分：**mTLS 是 transport 硬化（证"受信设备/org"），不是信任边界**。
信任边界单一在 P9 gate（per-user authn + scope authz + identity 标记）。两层
解耦：transport 挡掉未授信设备（TLS 握手层先于 HTTP），gate 挡掉未授权 scope /
用户。PAT 在 gate 之后服务端解析，不经 transport per-call。合 intranet-security-first
（最小暴露面 + 单一信任边界 + 纵深）。

## What the prototype mirrors (shapes only)

| Concern | Real mechanism | Prototype stub |
|---|---|---|
| Transport (mTLS) | Caddy `tls { client_auth { mode require_and_verify; trusted_ca_cert_file } }` | `mtlsAdmit(cert)`（issuer 受信 + 未吊销 + 未过期） |
| Gate (单一信任边界) | P9 `dsh-admin` gate：`/gate/login` + `/gate/link/:token` | `gateEntry` + `authz`（fail-closed） |
| Tool-gating | P7 preset allowlist by `identity.kind` + gate `tools/pre-execute` hook | `toolsForIdentity` + `preExecuteHook` |
| PAT resolve | P12 keychain `resolve(ref,{userId})` → `accessToken(value)` | `resolvePat`（服务端，不经 transport） |
| Client cert lifecycle | 内部 CA + 短命 cert + rotation（吊销靠过期） | `issueClientCert` + `mtlsAdmit` revoke/expire 分支 |

## Scenarios (all green = 决策流 holds)

- **S1** valid org cert + per-user login + allowed scope → allowed，business-user
  工具集，PAT 服务端 resolve。
- **S2** 无/不受信/吊销/过期客户端证书 → TLS 握手层拒（transport），**到不了 gate**。
- **S3** valid cert + 吊销/过期 access-link token → mTLS 过、gate 拒（fail-closed）。
  证 mTLS 不是 scope 边界。
- **S4** valid cert + valid login + scope 不在 allowedScopeIds → gate authz 拒
  （fail-closed，宁拒不错）。
- **S5** business-user 调 `bash` → preset allowlist 不含 + pre-execute hook 兜底拒
  （defense-in-depth）。
- **S6** admin → 全工具集（`bash` 允）。
- **S7** PAT 服务端 resolve：inbound 请求 + transport trace 均无 PAT 明文；
  per-user miss 回退全局 T1（G3 早期）。
- **S8** 短命 cert + rotation：过期即自动拒（吊销靠过期），re-issue 新 cert 恢复。

## Surfaced tensions / deferred（回填 ticket）

1. **跨网 / 多 host 部署形态**：前期 Mac 内网直接可达 → 无隧道。若业务用户跨网 /
   Mac 不可直接 bind → 须 chisel overlay 到 edge（additive 叠加在 Caddy 前）或
   P12b central backend（KMS/Vault）。**毕业 map 雾"内网穿透技术选型"→ 新雾
   "跨网/多 host 部署形态（chisel overlay / central backend），待跨网真需求"**。
2. **cert provisioning/distribution 工作流**：admin 如何把 org/device 客户端证书
   安全分发到设备（out-of-band，非经 transport）——部署期 ops 工作流，非 P10
   决策；设计定模型（内部 CA + 短命 + rotation），provisioning 工具留部署期。
3. **cert 立即吊销**：短命 + rotation = 吊销靠过期（前期够）；立即吊销需 CRL /
   custom verifier（Caddy `client_auth` verifier）——P12b 级生产硬化。
4. **per-phase 工具表**：P10 定 enforcement point（preset allowlist by identity
   + pre-execute hook 兜底）+ identity 标记；具体每阶段允许/禁用工具表在 P7
   四阶段 preset（并发 session 在做）落定时 wire。同时 resolve briefing deferred
   "disallowedTools:['AskUserQuestion'] minimal"——P10 使其 identity-scoped
   （business-user 禁 bash/file-write/etc.，非仅 AskUserQuestion）。
5. **client-cert subject 转发**：默认不转发 cert PEM（gate 身份独立于 transport）；
   可选转发 subject 给 P8 审计记 transport principal（非 authz）。

## Design notes

### Trust-boundary composition

```
inbound → Caddy(mTLS require_and_verify) → loopback webserver → P9 gate(单一信任边界)
                                                                        ↓
                                         identity.kind ← per-user 登录 / access-link→scope
                                                                        ↓
                                         P7 preset(allowlist by identity) + gate pre-execute hook
                                                                        ↓
                                         subagent-qoder: PAT 服务端 resolve(keychain)——不经 transport
```

### cert lifecycle（org/device，非 per-user）

- 内部 CA（admin 自签，`openssl` / `step` / `cfssl`）。
- 服务端 cert：内部 CA 签（内网 addr）。
- 客户端 cert：org/device 粒度（非 per-user），短命（默认 7d），admin 签发，
  out-of-band 分发。
- 吊销：短命 + rotation = 吊销靠过期（前期）；立即吊销 = CRL / custom verifier（P12b）。
  - **注**：Caddy native `client_auth require_and_verify` 只验 issuer+expiry，**不查 CRL/OCSP 吊销**（Go crypto/tls 默认）；已吊销证书在过期前仍可过 mTLS，除非部署 CRL/custom verifier（→P12b）。prototype `run.mjs` 的 `revoked` 分支是"假设有 verifier 时"的占位行为。
- 单一内部 CA = transport 层单点信任；CA 私钥离线保护/air-gap 签发；compromise blast radius 由 gate 第二层（per-user authn + scope authz）兜底，非全盘失守。
- Caddy 终结 TLS → 转发 webserver loopback 127.0.0.1 **明文段**；信任假设=单 host Mac 受信、无恶意本地进程嗅探 loopback/直连 gate 路由；多 host/跨网时需 mTLS 延伸到 sidecar 或 unix socket。
- per-user 身份不走 cert——走 gate 登录 / access-link token。per-user PAT 走 P12
  keychain（不变）。

### tool-gating wiring

- P9 gate 验后标 `session.identity.kind ∈ {business-user, admin, service}`。
- P7 preset 注册工具时按 `identity.kind` 裁：business-user = 显式 allowlist
  （`query`/`retrieval`/`semantic-layer`/`audit`，denied-by-default；新工具默认拒，避免 blocklist 漏更静默放行）。
- gate `tools/pre-execute` hook 兜底：dispatch 前再查 identity 的 allowlist，
  滑落即拒（catches preset misconfig）。
