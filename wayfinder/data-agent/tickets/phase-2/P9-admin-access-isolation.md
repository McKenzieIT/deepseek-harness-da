# P9 — admin harness app + 访问隔离

**Type**: prototype
**Phase**: 2/生产
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder-session 2026-08-20
**Depends on**: G3（per-user PAT 自助形态）+ P12（per-user keychain 基建，PAT 自助面交付排序其后）+ R6/G4（stdio sidecar，scope_id per-call 程序参）+ P10（隧道终点 TLS 终结，门在其后）。
**Feeds**: P4b（per-scope 凭证寻址 (i)/(ii) 构建期定）、P10（门形态=隧道终点 server-resolved scope）。

**Question**: per-game scope/credential/access-link 颁发/吊销 + token→scope 绑定 + 门覆盖 `X-RBI-Scope` + 系统配置（方案 1）。

**Research**: → `../../research/access-isolation-options.md`（方案 1 vs 2 分析；⚠️ §1.2 OdpsConfig "per-scope 行" 事实错误，见 erratum + 下方 Design）。

**From G3（per-user PAT，2026-08-19）**：per-user 登录（账号+密码，**复用 RBI `Tenant`**）+ 端点/scope 绑定（同一 addr:port 多用户各有独立登录）+ PAT **自助** UI（用户登录后粘自己 Qoder PAT → 存 per-user keychain 槽，admin 不经手 PAT）。per-user 凭证存储依赖 **P12**（keychain provider + per-user 寻址）。详见 G3 Finding。

---

## Revision (2026-08-25) — re-scope the "忠实重实现 RBI" boundary

The original Resolution (below) drew the "faithfully re-implement RBI" boundary **too wide**: it re-implemented RBI's `OdpsConfig` **business customization** (singleton row + shared access_id/key + `domestic{...}`/`overseas{...}` two-region fields + scope picks region). That is RBI's *business* (its deployment has exactly two regions + one shared ODPS account), **not 取数核心**. dsh-data-agent re-implements RBI's **取数核心 + 如何更好取数** (NL→SQL pipeline, semantic layer, retrieval, query execution, guards, eval, self-evolution, ontology/critic) — NOT RBI's business customizations (deployment regions, specific game scope ids, shared-account assumption, specific ODPS projects like `ieu_cdm`/`hdyl_data_sg`).

**Supersedes** these parts of the original Resolution (kept below as historical record):

- **`OdpsConfig`** → generalized to **per-scope data-source**: each scope declares its ODPS endpoint/project/creds (arbitrary — no hardcoded `domestic`/`overseas` region names, no singleton, no shared-cred assumption). The query engine resolves the active scope's data-source + passes it to the sidecar per call (`set_credentials` per scope). **Adding a new project/region = register a scope (config), not a source-code change** (open-closed). The RBI singleton + two-region + shared-cred model is RBI business — not re-implemented.
- **per-scope credential addressing**: recommend **option (ii)** (per-scope 4-ref creds — `ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT` per scope, admin pre-resolves into P12 keychain by `{scopeId}`) — the *general* design. The original recommendation of **(i)** (global access_id/key + per-scope project/endpoint by region) was RBI-business-bound (shared account + two regions); superseded by (ii).

**Preserved** (取数核心-adjacent, not business — these ARE re-implemented): the `scope_id` per-scope data-source selection mechanism, `AccessLink` token→scope binding (server-resolved, client can't supply scope), fail-closed authz (`scope_allowed_for_tenant`/`can_access`), per-user login, the `Tenant`/`ScopeRecord`/`AccessLink`/`SystemConfig` models.

**Surfaced — P4c's single-config assumption is wrong under this revision**: P4c's "Blocked by P9——per-scope 凭证寻址…RBI eval 全 5 scope 同在 `ieu_cdm` project…单 config 覆盖" assumed all scopes share one ODPS project (the 5 RBI *eval* scopes happen to be in `ieu_cdm`). That does **not** hold generally — a scope's `config.yaml` may declare a different region/project (X63/10000334 declares `environment: overseas-prod` + `workspace: hdyl_data_sg`, not `ieu_cdm`). P4c's single-config resolution is therefore incomplete. → Graduates [P4e per-scope ODPS data-source resolution](P4e-per-scope-odps-data-source-resolution.md): implement the general per-scope data-source resolution in the query engine per this revised design.

## Resolution / Design（2026-08-20 resolved，/prototype + 2 subagent cited 调研 + grill）

**架构 = 单一 additive 插件 `@deepseek-ai/dsh-admin`**，承载 (a) 入站 access gate + (b) admin 管理面 + (c) per-user 登录，共享 `ctx.storageDomain` store + `Service`/`ctx.effect` 生命周期。**100% additive，不碰 core**——所需钩子全在：`ctx.webServer.register`（HTTP 路由，成熟 additive 模式——`client-connection`/`frontend-static`/`client/modules` 同款）、`ctx.storageDomain.open(defineDomain(spec))`（sqlite `u_<unit>_<table>`，自动建表无 DDL）、`ctx.effect`/`Service` 子类（生命周期 HMR 自动 unwind）、data-agent bundle `insert`（**已预留 `- id: admin` 占位**，`packages/bundle/data-agent/cordis.patch.yml`，P9 uncomment + 填 name）。storage 家族（`dsh-storage`/`sqlite`/`domain`）不在 base，须同 `insert` 三行。**不拆双 app**：共享 domain handle（重复 open 同名 domain 被拒）、共享登录态、webserver 路由表 composition 契约（重复 path 抛错）、合 map ⑤e + 占位。

**scope 强制（crux）= 服务端解析、客户端不可供给**：「门覆盖 `X-RBI-Scope`」在 stdio 框架下重解为**「scope 由构造服务端权威——非客户端可供给」**：门从 link token 解析 scope（`AccessLink.linkToken→scopeId`），da 把 `scope_id` 作 per-call **程序参**传 stdio sidecar（R6/G4），**客户端根本不提供 scope、无 header 可覆盖**。比 RBI HTTP header-override **更强**（RBI 共享 Bearer + 自报 scope 有「一 token 读任意 scope」洞；stdio 路径结构性消除），单信任边界（da→sidecar 调用点），合 intranet-security-first + R6/G4。**丢** RBI HTTP-gate 特有（header 解析 `_http_headers`/`_HEADER_KEYS`、`is_http_request()` Request-对象判据、D7 HTTP 上下文禁 env 回落、ASGI 中间件 `GateAuthASGI`/`ScopeMiddleware`、共享 Bearer `agent_mcp_token`/`retrieval_token`、`X-RBI-Tenant` header、两门 `app.mount`）——stdio 不需要。**保留**：`scope_id` 形式校验（`^[A-Za-z0-9_-]+$`，路径组件 + 缓存键 + `set_credentials` 参）、`scope_allowed_for_tenant`/`can_access` fail-closed 判据、`scope_id` 必传参（`run_query_async`）。

**数据模型（忠实重实现 RBI + net-new，TS）**：
- `Tenant`（忠实 `models.py:32-43`）：id(uuid4)/name/username(unique=登录名=工号)/passwordHash(bcrypt cost 12)/allowedScopeIds(JSON 默认 `[]`=拒)/isActive/时间戳。admin=`username∈adminUsernameSet`（配置 `RBI_ADMIN_USERNAMES`），**无 role 列**。
- `ScopeRecord`（忠实 `models.py:230-236`）：scopeId(PK `^[A-Za-z0-9_-]+$`)/name(unique)/region(domestic|overseas)/时间戳。**无 tenantId**（映射在 `Tenant.allowedScopeIds`）。**Scope 即 game**（ADR-0006 migration #35 全仓 rename game→scope；「session 不绑 game」→「不绑 scope」，与单链接单 scope 不冲突——后者是链接绑 scope）。
- `OdpsConfig`（**单例 id=1**，`odps_config_service.py` docstring「singleton row (id=1)」+ `get_config` filter id==1 + `resolve_for_region`）：accessId/accessKey **全 scope 共享** + domestic{Endpoint,OdsProject,DwProject} + overseas{...}；per-scope 只差 region（scope `config.yaml` `maxcompute.environment`）选 project/endpoint。`OdpsCredential={accessId,accessKey,project,endpoint}` 经 `set_credentials` 透传 sidecar。〔**research note §1.2 erratum**：原文「per-scope 因为有 domestic_*/overseas_* 字段」事实错误，实为单例共享 + region 选字段，不影响 Option 1 结论〕
- `AccessLink`（**net-new**，RBI 无 link_token 实体——共享 Bearer + 自报 scope 即 spoofing 洞）：linkToken(PK opaque `crypto.randomBytes(32).base64url`)/scopeId(FK)/ownerTenantId/label?/isActive/expiresAt?/createdAt/revokedAt?/rotatedFrom?。颁发（token 只显一次）、吊销（`isActive=false`→`resolveLinkScope` 返 null 拒、fail-closed、无长 TTL 绕过）、TTL/轮换（`rotatedFrom` 链）。**「单链接单 scope」落实点**——token 决定 scope，覆盖客户端自报。
- `SystemConfig`（net-new 单例）：defaultScopeId?/feature flags/model routing（RBI 无独立表，散在 `config.py` Settings + OdpsConfig）。
- `users`/`user_sessions`（**net-new**：harness 无 login 基建——`identity`=anon-id、`session`=agent 日志非登录）：per-user 登录 net-new additive（bcrypt + session token），复用 RBI `Tenant` 概念（G3）。
- per-user PAT：**不**建 PAT 明文表——经 P12 per-user keychain（`ctx.credentials.set(ref,value,{userId})`），`{userId}`⊥`{scopeId}` 正交。admin 不经手 PAT（G3 红线）。fallback 分期（早期 T1 全局、稳定 per-user 必填禁 fallback，G3）。

**authz（fail-closed，原样继承 RBI）**：`scope_allowed_for_tenant`（无 tenant→放行 stdio/service/eval；tenant 不存在/停用/DB 异常→**拒**；scope∈allowedScopeIds；空列表→拒「宁拒不错」）+ `RetrievalIdentity.can_access`（service/admin→true；else scope∈allowedScopeIds）。AccessLink 解析→构造 `allowedScopeIds=[boundScopeId]` identity 走同一闸门。统一拒文案（防枚举，`authorize_game` 既有纪律）。

**路由 + storage domain（单插件内）**：`/gate/login` `/gate/logout` `/gate/whoami`（per-user 登录：bcrypt + session token）；`/gate/link/:token`（隧道终点：验 link token→解析 scope→建 session↔scope 绑定）；`/admin/api/scopes`(=games) `/admin/api/scopes/:id/credentials`(存 ref 不存值，调 P12 `set`) `/admin/api/access-links`(颁发/吊销) `/admin/api/config`(系统配置) `/admin/api/me/pat`(per-user PAT 自助)；`/admin/*` SPA（prefix 路由，**不用** fallback——`frontend-static` 已占单 owner）。domain：`tenants`/`scopes`/`odps_config`(单例)/`access_links`/`users`/`user_sessions`/`system_config`/`scope_credential_refs`(ref only，永不存 PAT 明文)。

**信任边界 / TLS**：webserver dev-only/no-auth **不阻塞**（README 明写「No TLS, auth, or origin policy」+ `0.0.0.0` unsupported-until-auth 是显式留白非禁止）——TLS 由门前隧道/反代（P10）终结→转发 webserver loopback（`host:127.0.0.1`）；gate 插件 auth handler=**单一信任边界**。`/api` trust fence 仅 reachability 且只罩 `/api` path，gate/admin 走独立 path 自带 auth 绕过它。合 intranet-security-first。

**Prototype**：`../../prototypes/p9-admin-access-isolation/`（throwaway `node run.mjs`，零 npm 依赖仅 `node:crypto`；mirrors `ctx.webServer`/`ctx.storageDomain`/sidecar/P12 keychain **shapes** 非 true wiring）。**25/25 checks 全绿**——S1 issue+isolation+override-by-construction（客户端请求 scopeB、服务端解析 scopeA、sidecar 不见 scopeB、不可升权）/ S2 吊销 fail-closed 无长 TTL 绕过 / S3 fail-closed 六分支（unknown/expired/空 allowedScopeIds/inactive/不存在/db-error 全拒、绝不因读不到授权数据而放行）/ S4 per-user 登录+PAT 自助+`{userId}⊥{scopeId}`+at-rest（PAT 明文不在 admin store 只在 keychain、admin 不经手）/ S5 OdpsConfig 单例+region addressing (i) / S6 TTL/expiry。

**Deferred / surfaced tensions**：
1. **per-scope 凭证寻址 (i)/(ii)** → **P4b 构建期定**。R6 per-call resolve 4 ref（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`）vs OdpsConfig 单例共享 access_id/key。prototype 取 **(i)** 全局 ref 给 access_id/key + per-scope project/endpoint 按 region（合 RBI 单例现实）；(ii) per-scope 4-ref（admin 预解析入 keychain by `{scopeId}`，复用 P12 address 维度换 scopeId）备选。
2. **P12 PAT 自助面交付排序在 P12 后**：credentials 树无 `userId`（`credentials-local` 仍上游单文档 `set(ref,value)`）。P9 先交付 gate+scope/credential-ref/access-link/users/sys-config+登录，PAT 自助 stub（prototype 已验 seam shape），P12 就绪后接线。P3 MVP 仍用 T1 全局。
3. **per-user 登录 net-new + 硬化**：harness 无 login 基建，admin 插件自管小型 auth 子系统（token 轮转/expiry/CSRF/限流/审计）——类 P12b，待 P9 真建 + P10，作 map Not-yet-specified（不 premature ticket）。
4. **OdpsConfig 单例 erratum**：research note §1.2 须加 erratum（已回填）。

**解锁**：P9 访问隔离设计 + prototype 验证解锁——P10 门形态（隧道终点 server-resolved scope、单信任边界、TLS 在门前终结）；P4b per-scope 凭证寻址 (i)/(ii) 构建期定（P9 荐 (i)）；map Not-yet-specified「per-user 登录 + 端点→user→scope 绑定实现细节」毕业（P9 已定：复用 Tenant + AccessLink 绑定 scope）。
