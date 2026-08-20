# P9b — admin + 访问隔离 生产硬化（per-user 登录 = Stratum B enabler）

**Type**: prototype（/prototype landing；HITL）
**Phase**: 2（生产）
**Status**: Decisions locked (2026-08-20 grill); package landing = follow-up (admin prod package + login baseline too large for one session)
**Assignee**: (unclaimed)
**Depends on**: P9（admin+访问隔离 prototype resolved）· G3b（ctx.identity seam + P3/P8b opportunistic 线程）· P10（mTLS 门禁）· G3c（keychain 作 ctx.credentials，per-user PAT 真存 keychain——G3c 落地后 P9b 自助 set 接 keychain）
**Blocks**: 真实 per-user PAT provisioning 闭环（identity 真值 + 自助 set + 必填 UX）

## Question

落 P9 生产包（`@deepseek-ai/dsh-admin`：admin+gate+per-user 登录+access-link+storage domain）——G3 stable Stratum B enabler。填 `ctx.identity` 真值（激活 G3b decision 2/6 的 per-user 线程）+ decision 3（per-user 自助 `set(ref,value,{userId})` 接 keychain）+ decision 5（per-user PAT 必填 vs lazy UX）。

## Context

- **P9 prototype**（`prototypes/p9-admin-access-isolation/`，25/25 green）已定设计：单一 additive 插件 `@deepseek-ai/dsh-admin`（gate+admin+登录共享 `ctx.storageDomain` + `Service`/`ctx.effect`）+ scope 服务端解析（AccessLink.linkToken→scopeId，非客户端可供给）+ 忠实 RBI 模型（Tenant/ScopeRecord/OdpsConfig 单例/AccessLink net-new/SystemConfig/users/user_sessions net-new）+ fail-closed authz + per-user PAT 自助经 keychain（`{userId}`⊥`{scopeId}`）+ per-user 登录 net-new（bcrypt+session）。
- **G3b 已落**：`ctx.identity` seam stub（`packages/identity/identity/`，`current()` 返 undefined）+ P3 `resolve(ref,{userId: ctx.identity.current()?.userId})` + P8b `resolveIdentity` 读 `ctx.identity`。**P9b 填 `ctx.identity.current()` 真值**（login 态 + AccessLink→scope）→ 激活 per-user。
- **G3b decision 3**：per-user 自助 `set(ref,value,{userId})` 接 keychain（P9 `/admin/api/me/pat` route → `ctx.credentials.set(ref,value,{userId})`）。须 G3c keychain 作 ctx.credentials 落地后（否则 ctx.credentials 仍 local，set 写 file 非 keychain）。
- **G3b decision 5**：per-user PAT 必填 vs lazy UX（登录后必填才用 Qoder vs 无 PAT 时拒/回退/提示填）。
- **P9 surfaced tensions（须 P9b 解）**：per-scope 凭证寻址 (i)/(ii)（P9 荐 (i) 全局 access_id/key + region）；per-user 登录硬化（token 轮转/expiry/CSRF/限流/审计，net-new auth 子系统，类 P12b）。

## Scope

- 落真 `packages/admin/`（或 `packages/data/admin/`）生产包（package.json/tsconfig/src/invariant/tests/README + tsconfig.host ref + bundle mount uncomment + dep）。
- ctx.identity 真值填充（P9b admin 包 override `IdentityService.current()` 或 mount 实 impl）。
- per-user 自助 set 接 keychain（decision 3，依赖 G3c）。
- per-user PAT 必填 vs lazy UX（decision 5）。
- per-user 登录硬化（token/expiry/CSRF/限流/审计）。
- P9 surfaced tensions（per-scope寻址 (i) 落地 / 登录硬化）。

## Risks

- per-user 登录 net-new auth 子系统（类 P12b 的 secret-to-protect 硬化）。
- 依赖 G3c（keychain 作 ctx.credentials）落地后自助 set 才接 keychain；G3c 未落则 P9b 自助 set 仍接 file。
- surgical 提交（并发活跃）。

## Design（2026-08-20 grill — 4 decisions locked；package landing spec'd for follow-up）

G3b 延后的 Stratum B（decisions ③⑤ + identity 真值填充激活 ②⑥）。4 tensions grill 定夺：

1. **per-scope ODPS 凭证寻址 = (i)**：全局 ref 给 ODPS_ACCESS_ID/KEY（OdpsConfig 单例共享 access_id/key）+ per-scope project/endpoint 按 region 从 `OdpsConfig.resolve_for_region`。合 RBI 单例现实；`query-maxcompute:266` 已 `resolve(ref)` 无 scopeId。admin 不须 per-scope 4-ref 预解析。（(ii) per-scope 4-ref 入 keychain by {scopeId} over-engineer under 单例共享事实，不取。）
2. **per-user 登录硬化 scope = 基线 now + 硬化 defer**：P9b 落 bcrypt+session 功能性登录基线（可登录、bind session↔user）；token 轮转/expiry/CSRF/限流/审计 等硬化延后（类 P12b secret-to-protect 硬化，map 雾「per-user 登录硬化」）。先交付能用的登录，硬化 follow-up。
3. **per-user PAT 必填 vs lazy UX = 必填 + 首次用 Qoder lazy 提示**：stable per-user PAT 必填（G3b decision 4 fallback off + per-user miss→undefined→P3 reject "not configured"）+ 首次用 Qoder 时 lazy 提示「set your PAT」（指向 `/admin/api/me/pat`）。必填是稳定态，提示是 UX 引导（不回退全局 T1）。
4. **identity 真值填充 = P9b admin 提供 real IdentityService + disable G3b stub**：P9b admin 包提供真实 IdentityService impl（subclass override `current()` 读 login 态 + AccessLink→scope）；data-agent bundle disable G3b identity stub + mount P9b real（类 credentials disable 模式）。G3b 的 P3 `resolve(ref,{userId})` + P8b `resolveIdentity` 线程自动激活 per-user（不改 P3/P8b）。

## Landing spec（follow-up session 执行；too large for this session）

落真 `packages/admin/`（或 `packages/data/admin/`，类 P12b 全套）：
- P9 prototype 已 locked 的设计（`prototypes/p9-admin-access-isolation/` 25/25 green）：单一 additive `@deepseek-ai/dsh-admin`（gate+admin+登录共享 `ctx.storageDomain` + `Service`/`ctx.effect`，100% additive 不碰 core；bundle `id:admin` 占位预留 + storage 3 行 insert）+ scope 服务端解析（AccessLink.linkToken→scopeId）+ 忠实 RBI（Tenant/ScopeRecord/OdpsConfig 单例/AccessLink net-new/SystemConfig）+ fail-closed authz + per-user PAT 自助经 keychain（`{userId}`⊥`{scopeId}`，admin 不经手）+ per-user 登录 net-new（bcrypt+session 基线）。
- **identity 真值填充**（decision 4）：P9b admin override `IdentityService.current()` → 激活 G3b ②⑥ per-user 线程。
- **decision ③ 自助 set 接 keychain**：`/admin/api/me/pat` route → `ctx.credentials.set(ref,value,{userId})`。**G3c 已落**（keychain 作 ctx.credentials via host opt-in + writable fallback）→ 自助 set 接 keychain 可行（G3c 解锁了此切片）。
- **decision ⑤ 必填+提示 UX**：fallback off（G3b decision 4）+ per-user miss→P3 reject；首用 Qoder lazy 提示。
- **登录基线**（decision 2）：bcrypt+session；硬化 defer。
- bundle mount uncomment（`id:admin`）+ dep + tsconfig.host ref + README。
- tests（port P9 25 scenarios + identity fill + 自助 set + 必填 UX）。

## Deferred

- **per-user 登录硬化**（token 轮转/expiry/CSRF/限流/审计）→ follow-up（net-new auth 子系统全硬化，类 P12b；map 雾「per-user 登录硬化」保持）。
- **G3c 解锁**：P9b 自助 set 接 keychain 切片不再 soft-dep G3c（G3c resolved 2026-08-20，keychain 作 ctx.credentials via host opt-in）。
