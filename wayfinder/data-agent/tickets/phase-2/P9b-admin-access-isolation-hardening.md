# P9b — admin + 访问隔离 生产硬化（per-user 登录 = Stratum B enabler）

**Type**: prototype（/prototype landing；HITL）
**Phase**: 2（生产）
**Status**: Unblocked（G3b resolved 2026-08-20，identity seam + P3/P8b 线程已落；P9 prototype resolved）
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
