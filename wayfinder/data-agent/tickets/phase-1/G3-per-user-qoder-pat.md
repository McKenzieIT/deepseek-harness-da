# G3 — per-user Qoder PAT provisioning（业务自带 PAT）

**Type**: grilling（/grilling + /domain-modeling，HITL）
**Phase**: 1（P0-adjacent / 生产）
**Status**: Resolved (2026-08-19)
**Depends on**: P12（keychain provider + per-user 寻址，per-user 存储基建）

**Question**: 内网穿透让业务访问后，让业务用户自带各自 Qoder PAT 调 subagent-qoder（前期测试用开发者个人 PAT，稳定后换 per-user）；为未来留接口。per-user PAT 的供给/存储/身份/权限/fallback/审计怎么定？

**Finding**（2026-08-19 resolved，/grilling 一问一答收敛）:
- **单位**：per-individual business user（非 per-game scope）。凭证寻址 user-keyed，与 RBI per-scope 凭证分叉。
- **存储**：(a-keychain)——per-user PAT 存 credentials seam 的 **deferred OS-keychain/KMS provider**（agent/bash at-rest 不可读）。**自助**：用户登录后在自己 web UI 设置粘自己 Qoder PAT → 存其 per-user keychain 槽（**admin 不经手 PAT**）。填一次、跨浏览器。修订了先前 (c) client-side——web UI + data agent XSS 风险 + 跨浏览器需求 → 改服务端 keychain。
- **权限**：Qoder 侧强制——PAT 自带账号权限 + Credits、Qoder 强制（Credits 尽/PAT 失效即止）；harness **不建 per-user 权限模型**。
- **身份**：per-user 登录（账号+密码，**复用 RBI `Tenant`**（`username`+`password_hash`(bcrypt)+`allowed_scope_ids`，事实）——P9 建）→ 登录态 key per-user PAT 解析。+ P10 内网 addr:port/mTLS 门禁。**同一 addr:port 多用户各有独立账号密码**（非端点=身份）。
- **fallback（staged）**：早期——登录用户无 per-user PAT 时**回退 T1 全局个人 PAT**（"前期用我个人的"）；稳定——**禁用回退、per-user PAT 必填**。
- **留接口（concrete）**：P3 经 **caller-parameterized resolve** 取 PAT：`ctx.credentials.resolve(ref, { userId })` → keychain 返该用户 PAT → Qoder SDK `accessToken(value)`；无 per-user PAT 且 fallback 开 → T1 全局（flat `resolve(ref)`，T1 已落）；fallback 关且无 → 拒。换 provider/开关不改 P3 核心。早期 MVP 用 T1 全局（P3 现状），per-user 切片在 P12 落地后。
- **审计**：per-user Qoder subagent 调用全审计（谁/何时/哪个 PAT-scope/Credits）→ **P8**（session-event + tool-audit + `ctx.storage`）。
- **scope 正交性**：per-user PAT（Qoder 鉴权）⊥ per-scope（数据隔离）——PAT per-user、数据 per-scope 各按调用流；P3 委派 Qoder 时数据 scope 由 harness pipeline 持有不靠 PAT。（P3 构建期确认。）
- **PAT vs SAT**：per-individual-user → 个人 PAT（非 org 级 SAT），已隐含。

**依赖**：per-user 存储 = **P12**（keychain provider + per-user 寻址，per-user 维度，与 R2 per-scope 正交）。P12 未建前，per-user PAT 不落地（P3 MVP 用 T1 全局 fallback）。

**实现分布**：P3（caller-parameterized resolve + fallback 层）、P9（per-user 登录 + 端点/scope 绑定 + PAT 自助 UI）、P8（per-user Qoder 审计）、P10（per-user 门禁）。各票加 "From G3" 指针。

**Deferred（P3/P9 构建期）**：scope 正交性确认；keychain 后端选型（P12 内决）；per-user 登录表实现（复用 `Tenant` vs 新表——P9 决）。
