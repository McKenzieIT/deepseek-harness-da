# P10 — 内网穿透安全加固

**Type**: prototype
**Phase**: 生产
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-session 2026-08-20
**Depends on**: G3（per-user 登录+mTLS 形态）+ P9（dsh-admin gate=单一信任边界、TLS 门前终结→转发 loopback、AccessLink token→scope、identity 标记）+ P12（keychain PAT 服务端 resolve）+ Q9（工具门禁：业务用户不得触达 bash）。
**Feeds / unblocks**: P12b（多 host backend 选型等拓扑——P10 定前期 single-host、多 host=P12b 生产 scope，依赖解除）；P7（工具门禁 enforcement point + identity 标记，per-phase 表 P7 落定时 wire）；P8（可选 transport principal 审计）。

**Question**: 隧道技术（frp/chisel/...）+ TLS 终止 + mTLS + token 轮换/吊销 + 单一信任边界（RBI 门）+ 业务用户工具门禁（不得触达 bash）。

**From G3（per-user 门禁，2026-08-19）**：caller 身份 = web UI per-user 登录（账号+密码，复用 RBI `Tenant`；非端点绑定——同一 addr:port 多用户各有独立登录）+ mTLS。内网 addr:port 由 admin 经 P9 分配。PAT 由用户在 web UI 提交一次（经 mTLS 入 P12 keychain），后续每调用 harness 服务端 resolve→`accessToken(value)`，**不每调用经隧道明文**、不进 process.env。详见 G3 Finding。

**From P9（gate=单一信任边界，2026-08-20）**：webserver dev-only/no-auth 是显式留白 → TLS 由门前隧道/反代（P10）终结→转发 webserver loopback `127.0.0.1`；gate 插件 auth handler=单一信任边界（门在其后）。gate 路由 `/gate/login`（per-user 登录 bcrypt+session）+ `/gate/link/:token`（link token→scope 绑定，fail-closed revoke/TTL/rotatedFrom）。P9 Feeds P10 门形态=隧道终点 server-resolved scope。

---

## Resolution / Design（2026-08-20 resolved，/prototype + grill 一问一答给推荐）

**Transport = Caddy 反代 + mTLS（无隧道）**。前期单 host：Mac 内网直接可达 admin 经 P9 分配的 addr:port；Caddy 终结 TLS+mTLS → 转发 harness webserver loopback `127.0.0.1:<port>`。最小暴露面、零隧道组件、信任边界单一在 gate。**`frp`/`chisel` 前期 ruled out**——map 雾"内网穿透技术选型（frp/chisel/...）"由此回答：前期不需要隧道（Mac 内网直接可达）；跨网/多 host 场景留作 additive 叠加（chisel overlay 到 edge 或 P12b central backend），待跨网真需求。Caddy `tls { client_auth { mode require_and_verify; trusted_ca_cert_file } }` 在 TLS 握手层验客户端证书（先于 HTTP）；**不**转发 cert PEM（gate 身份独立于 transport）。见 `Caddyfile`。

**mTLS = transport-only（非 per-user cert）**。org/device 客户端证书（单一内部 CA，admin 签发，短命默认 7d + rotation）；per-user 身份 + scope 全在 P9 gate（per-user 登录 or access-link token）。G3 "per-user 登录 + mTLS" 中的 mTLS 即此 transport 层。**关键区分**：mTLS 是 transport 硬化（证"受信设备/org"），**不是**信任边界；信任边界单一在 P9 gate（per-user authn + scope authz + identity 标记）。两层解耦：transport 挡未授信设备、gate 挡未授权 scope/用户；PAT 在 gate 后服务端解析、不经 transport per-call。per-user cert（更强 transport-binding-to-user）属 P12b 级生产硬化，前期不做。

**cert lifecycle（org/device，非 per-user）**：内部 CA（admin 自签 `openssl`/`step`/`cfssl`）+ 服务端 cert（内部 CA 签内网 addr）+ 客户端 cert（org/device 粒度、短命、admin 签发、out-of-band 分发）+ 吊销 = 短命+rotation=靠过期（前期够；立即吊销 CRL/custom verifier → P12b）。per-user 身份不走 cert（走 gate 登录/access-link）；per-user PAT 走 P12 keychain（不变）。

**工具门禁 = defense-in-depth**。P9 gate 验后标 `session.identity.kind ∈ {business-user, admin, service}` → P7 data-agent preset 按身份套受限 allowlist：business-user 去 `{bash, code-runtime-shell, file-write, str-replace-editor, AskUserQuestion-delegate}`；admin/service 全集。gate `tools/pre-execute` hook 兜底——dispatch 前再查 identity allowlist，滑落即拒（catches preset misconfig）。具体 per-phase 工具表在 P7 四阶段 preset（并发 session 在做）落定时 wire。**resolve briefing deferred "disallowedTools:['AskUserQuestion'] minimal"**——P10 使其 identity-scoped（business-user 禁 bash/file-write/etc.，非仅 AskUserQuestion）。

**token 轮换/吊销（两部分）**：① access-link link-token = P9 `AccessLink`（rotatedFrom 轮换链、TTL、`isActive=false`→resolveLinkScope 返 null fail-closed、无长 TTL 绕过）——P9 已落地，P10 确认其在 gate 单一信任边界内运作；② mTLS client cert 轮换/吊销 = 本 Design 的 cert lifecycle（短命+rotation）。PAT 轮换 = 用户 web UI 重粘（G3/P12 自助）。

**Prototype**：`../../prototypes/p10-intranet-tunneling/`（throwaway `node run.mjs`，零 npm 依赖仅 `node:crypto`；mirrors Caddy `client_auth` / P9 gate / P7 preset allowlist / P12 keychain **shapes** 非 true wiring）。**26/26 checks 全绿**——S1 valid cert+login+allowed scope→business-user 工具集+PAT 服务端 resolve / S2 无/不受信/吊销/过期 cert→TLS 握手层拒到不了 gate / S3 valid cert+吊销/过期 link→mTLS 过 gate 拒（证 mTLS 非 scope 边界）/ S4 scope 不在 allowedScopeIds→authz fail-closed 拒 / S5 business-user 调 bash→preset allowlist 不含+pre-execute hook 兜底拒 / S6 admin→全工具集 / S7 PAT 服务端 resolve（请求+transport trace 无 PAT 明文、per-user miss 回退全局 T1）/ S8 短命 cert+rotation（过期即拒、re-issue 恢复）。

**Deferred / surfaced tensions**：
1. 跨网/多 host 部署形态：前期无隧道；跨网/Mac 不可直接 bind → chisel overlay 到 edge（additive 叠加 Caddy 前）或 P12b central backend（KMS/Vault）——**毕业 map 雾 → 新雾"跨网/多 host 部署形态，待跨网真需求"**。
2. cert provisioning/distribution 工作流：admin 安全分发 org/device 证书到设备（out-of-band，非经 transport）——部署期 ops 工作流，非 P10 决策；设计定模型，provisioning 工具留部署期。
3. cert 立即吊销：短命+rotation 前期够；立即吊销需 CRL/custom verifier（Caddy `client_auth` verifier）→ P12b。
4. per-phase 工具表：P10 定 enforcement point + identity 标记；具体表在 P7 落定时 wire。
5. client-cert subject 转发：默认不转发；可选转发 subject 给 P8 审计记 transport principal（非 authz）。

**解锁**：P12b（多 host backend 选型等拓扑——P10 定前期 single-host、多 host=P12b 生产 scope，拓扑依赖解除）。map 雾"内网穿透技术选型"毕业（→ 新雾跨网/多 host）。
