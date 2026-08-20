# 单链接单业务数据隔离 —— 两方案对比（primary-source 调查）

> 目标：`deepseek-harness-data-agent`（reverse-bi 迁移到 deepseek-harness-da 插件 harness 上）
> 要落实「单链接只能读取指定业务数据」。本文只依据源码下结论，推断标 INFERENCE。
> 所有 `path:line` 指向 primary source（源码 / ADR / README）。

---

## 0. 调查方法

只读两个仓库的源码与 ADR，不下任何外部文档：
- reverse-bi: `/Users/mckenzie/workspace/reverse-bi`
- harness (deepseek-harness-da): `/Users/mckenzie/workspace/deepseek-harness-da`

关键路径已逐文件读过：rbi-mcp 的 `credentials.py` / `request_scope.py` / `scope_authz.py` / `server.py`，
rbi-query 的 `pipeline.py` / `engines/maxcompute/connection.py`，rbi-web 的 `agent_mcp_gate.py` / `mcp_gate.py` /
`auth_service.py` / `scope_service.py` / `tenant_service.py` / `main.py`，harness 的 `packages/{interaction,
credentials,identity,session,api,mcp,fs,host,guard}` 全部 README。

---

## 1. reverse-bi 现状：scope_id + 每作用域凭证系统的真实状态

### 1.1 scope_id 端到端流向

1. 客户端发 `X-RBI-Scope` header（stdio 走 `RBI_SCOPE_ID` env）。
2. `request_scope.scope_id()`（`libs/rbi-mcp/src/rbi_mcp/request_scope.py:113`）解析：
   `bind()` 显式 > `get_http_headers()` > env fallback > 空。形式校验 `_SCOPE_ID_RE = ^[A-Za-z0-9_-]+$`
   （`request_scope.py:35`），含 `/` `\` `..` `,` 即抛 `InvalidScopeError`（fail-closed）。
3. `is_http_request()`（`request_scope.py:165`）以「有没有 `Request` 对象」判传输，**不是**按 header
   有没有内容——因为 fastmcp 的 exclude-list 会把 `host`/`accept`/`content-type` 等剥掉，恰好覆盖一个
   精简 MCP-over-HTTP 客户端发的全部头，旧 `bool(_http_headers())` 判据让任何 HTTP 客户端伪装成 stdio
   续取别人的查询结果（`request_scope.py:165-260` 的 docstring 详述了这个真实可利用洞）。
4. **D7 ④**：HTTP 上下文禁止进程级 env 回落（`request_scope.py:96-100`）——常驻网关多租户并发下会串到
   别人的 scope。
5. rbi-mcp 把 scope_id 显式传给 `run_query_async(scope_id=...)`（`libs/rbi-query/src/rbi_query/pipeline.py:169`）。
6. `run_query_async` 的 `scope_id` 是 keyword-only 必需参数（无默认值）。docstring 明写：「`scope_id`
   必需。参与引擎构造（MaxCompute 的 endpoint/project/凭据按 scope 不同）与配置 merge，不只是标签」
   （`pipeline.py:183-185`）。
7. `get_engine(name, scope_id)` 按 `(名, scope)` 构造引擎；`load_guard_config_merged(engine_name, scope_id)`
   三级配置合并；`QueryContext(scope_id=...)` 把 scope 带进 Guard 链。

**边界**：rbi-query **不自己发现** scope_id——由调用方（rbi-mcp）从 `request_scope` 取出后传入
（`pipeline.py` 模块 docstring）。理由是 rbi-eval 有一个不在任何请求上下文里的调用方
（`rbi_eval.adapters.sql.execute_case_sql`），所以 rbi-query 不能读 ContextVar。

### 1.2 三级凭据解析（两条链，会漂）

> ⚠️ **ERRATUM（2026-08-20，P9 ground-check）**：本节下文称 `odps_configs`「**per-scope** 因为 DB 行有 `domestic_*`/`overseas_*` 字段」是**事实错误**。`OdpsConfig` 是**单例行（id=1）**，`access_id`/`access_key` **全 scope 共享**；per-scope 差异**只在 region**（scope `config.yaml` `maxcompute.environment`）选 `domestic_*`/`overseas_*` 的 project/endpoint 字段，**非 per-scope 行**。证据：`apps/rbi-web/src/rbi_web/services/odps_config_service.py` docstring「singleton row (id=1)」、`get_config` filter `id==1`、`resolve_for_region` 返共享 access_id/key + 按 region 选 endpoint/project。不影响 Option 1 结论（scope_id 流 + per-scope 凭据解析 + token→scope 绑定均成立）。P9 prototype `prototypes/p9-admin-access-isolation/` S5 验单例 + region addressing。

**链 A —— rbi-mcp 侧 `credentials.py`**（`libs/rbi-mcp/src/rbi_mcp/credentials.py`）：
- `resolve_for_scope(scope_id)`（`credentials.py:166`）= 注册给 rbi-query 的 tier-0 resolver。
- 内部 `_resolve_uncached`（`credentials.py:155`）优先级：`_from_db` → `_from_config_file` → `_from_env`，
  与 `state.get_odps()` 逐字一致。
- `_from_db(scope_id, overseas)`（`credentials.py:82`）：读 DB `odps_configs`（web 配置中心）。**per-scope**
  因为 DB 行有 `domestic_*` / `overseas_*` 字段，`_region_of(scope_id)` 读 scope 的 `config.yaml` 选。
- `_from_config_file(scope_id)`（`credentials.py:107`）：scope `config.yaml` 的 `maxcompute.config_file`
  + `environment`。
- `_from_env()`（`credentials.py:131`）：`ODPS_*` env（`McpSettings`）。
- **per-scope TTL 缓存** `_CACHE: dict[str, tuple[OdpsCredential, float]]`（`credentials.py:50`），键是
  `scope_id`（**不是** `overseas` 布尔——同区域两游戏共用会让「查 A 的表拿到 B 的数据」，
  `credentials.py:65-70`），TTL=300s。解析在锁外做（`credentials.py:178-188`）。
- `invalidate_credential(scope_id)`（`credentials.py:195`）同时清本缓存 + rbi-query 侧
  `invalidate_scope_connection`。
- `install_credential_resolver()`（`credentials.py:215`）把 `resolve_for_scope` 注册为 rbi-query 的 tier 0。

**链 B —— rbi-query 侧 `connection.py`**（`libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`）：
- `resolve_connection(scope_id)`（`connection.py:262`）：tier 0（`_from_resolvers`，`connection.py:127`）
  → tier 1（`_from_config_file`，`connection.py:200`）→ tier 2（`_from_env`，`connection.py:230`）。都失败
  → `EngineNotConfigured`。
- `ScopeConnection`（`connection.py:167`）：持 `build` 工厂 + 惰性构造并复用的 `ODPS` 对象。
- per-scope 连接缓存 `_CONNECTIONS: dict[str, ScopeConnection]`（`connection.py:300`），
  `get_scope_connection`（`connection.py:304`）解析一次后缓存，
  `invalidate_scope_connection`（`connection.py:315`）丢弃。

### 1.3 关键诚实缺口：ScopeConnection 在生产上尚未接入

`connection.py` 模块 docstring（`connection.py:6` 及后续）逐字写明：

> **生产路径一次都不经过这里。** rbi-mcp 在启动期调
> `register_engine("maxcompute", _maxcompute_engine_factory)`，而 `registry.get_engine(name, scope_id)`
> **优先走注册的 override 工厂**——那个工厂签名无参、自己用 `state.get_odps()` 解析凭据。于是全局注册
> 在启动期就把 `get_engine` 的 per-scope 分支**短路**了：`OdpsExecutor.for_scope()` 不跑，本模块的
> `get_scope_connection` / `resolve_connection` 不跑，`registry.invalidate()` 与
> `invalidate_scope_connection` 的**生产调用点为 0**（全仓只有测试调）。
>
> 也就是说：**代码是对的、测试是绿的、生产走不到。**

`credentials.py` 模块 docstring（`credentials.py:7-20`）的红线也写明：「绝对不要『删 override 走 scope
分支』——会逐字重放 2026-08-05 五天全面停服」；`install_credential_resolver` 让内置路径**有能力**读到
DB 凭据，但 override **本批保留**——退休 override 是后续独立动作。

**INFERENCE**：所以「复用 reverse-bi 的 ScopeConnection per-scope 缓存」今天是一个**已写好但未接线**的
能力。生产实际跑的是 override 工厂，它每次查询重新解析凭据（per-executor 记忆化），**没有 per-scope
缓存也没有失效钩子**。但凭据**仍然是 per-scope 的**——因为 `odps_configs` DB 行按 scope 区分，
`state.get_odps()` 也按 scope 解析。

### 1.4 租户→scope 授权判据（唯一一份，但中间件未安装）

`scope_allowed_for_tenant(tenant_id, scope_id)`（`libs/rbi-mcp/src/rbi_mcp/scope_authz.py:55`）：
- `tenant_id` 空 → 放行（service-account / stdio / eval 常态）。
- `tenant_id` 有效 + `scope_id` 空 → 放行。
- 其余：`scope_id` 必须在该 tenant 的 `allowed_scope_ids`（JSON 列表）里。
- **fail-closed**：库不可达 / 查询异常 / tenant 不存在或停用 → 拒。

**关键**：`scope_authz.py` 模块 docstring 明写：「`TenantAuthMiddleware` 目前**没有被装到任何 server 上**
（全仓零安装点：`composite.py` 与 `mcp_gate.py` 的 `middleware=[...]` 里只有 `ScopeMiddleware`）。
所以本函数今天的实际保护面 = **显式调用它的那几处**，不要读成『租户隔离已由中间件全局兜住』」。

### 1.5 RetrievalIdentity —— 检索门的身份模型

`RetrievalIdentity`（`apps/rbi-web/src/rbi_web/services/auth_service.py:119`）：
```python
@dataclass(frozen=True)
class RetrievalIdentity:
    kind: str  # "tenant" | "service"
    tenant_id: str | None = None
    allowed_scope_ids: tuple[str, ...] = field(default_factory=tuple)
    is_admin: bool = False
    def can_access(self, scope_id: str) -> bool:  # auth_service.py:131
        if self.kind == "service" or self.is_admin: return True
        return scope_id in self.allowed_scope_ids
```
- `resolve_retrieval_identity`（`auth_service.py`）：token 优先；token + `X-RBI-Tenant` → 该 tenant 身份
  （降权）；token 无 tenant header → service 全权；无 token → session tenant。
- `authorize_game(identity, scope_id)`（`auth_service.py:175`）：`not can_access` → 403，「先授权后解析」。

### 1.6 两个门（/mcp-agent 与 /mcp/retrieval）

**/mcp-agent 门**（`apps/rbi-web/src/rbi_web/services/agent_mcp_gate.py`）：
- `AgentGateAuth(GateAuthASGI)`（`agent_mcp_gate.py:169`）：token 配置 → Bearer 匹配（`agent_mcp_token`）；
  未配置 + dev → localhost；其余 401。
- `_scope_header_reject`（`agent_mcp_gate.py:67`）：`tools/call` 缺 `X-RBI-Scope` 即 400。
- 挂载：`app.mount("/mcp-agent", _agent_mcp_gate.gate_asgi)`（`main.py:325`）。
- **关键**：token 是**共享** Bearer token（`agent_mcp_token`），**不是** per-scope；scope 是客户端经
  `X-RBI-Scope` 自报、仅形式校验。**一个持 token 的客户端可以发任意 `X-RBI-Scope` 读任意 scope。**

**/mcp/retrieval 门**（`apps/rbi-web/src/rbi_web/services/mcp_gate.py`）：
- `RetrievalGateAuth(GateAuthASGI)`：同款，`retrieval_token`。
- `_identity_from_headers`：`X-RBI-Tenant` → tenant 身份；无 header → service 全权。
- `_authorize`：`identity.can_access(scope_id)`。
- 挂载：`app.mount("/mcp", _mcp_gate.gate_asgi)`（`main.py:326`）。

### 1.7 数据模型（rbi-data）

- `Tenant`（`tenant_service.py`）：`name` / `username` / `password_hash`(bcrypt) / `allowed_scope_ids`(JSON 列表)
  / `is_active`。
- `ScopeRecord`（`scope_service.py`）：`scope_id` / `name` / `region` / `created_at` / `updated_at`。**没有
  `tenant_id` 字段**——映射在 `Tenant.allowed_scope_ids` 上（`scope_authz.py` 模块 docstring 的 errata MAJOR-6）。

### 1.8 ADR-0006 的关键决策（多游戏架构）

`docs/adr/0006-multi-game-architecture.md`：
- Game 是一等实体（DB 记录），由管理员注册；Tenant 经 `allowed_game_ids` 引用已注册 Game。
- **Session 不绑定 Game**——一个 ChatSession 可跨多个 game，game 上下文 per-query 决定（UI 选择器 +
  system prompt + session game card）。
- **MVP 不做跨 game 查询**——每条查询恰好指向一个 game。

**INFERENCE**：ADR-0006 的「session 不绑定 game」与「单链接单 scope」**不冲突**——后者是**链接（token）**
绑 scope，不是 session 绑 scope。但要注意：RBI 的 session 模型是多 game 的，迁移到 harness 上时若强行把
session 绑死单 scope，会改既有交互语义。

---

## 2. Option 1 —— 复用 reverse-bi scope_id + 每作用域凭证

### 机制

一条访问链接 = 一个 scope-bound token。admin 服务（一个 harness app）签发/吊销 token，token 服务端绑定
一个 `scope_id`（或绑定一个 `allowed_scope_ids = [scope_id]` 的 tenant）。数据 agent 的查询层在每条查询上
强制 scope_id（`run_query_async` 已必需 `scope_id`，`pipeline.py:169`）。单链接 = 单 scope = 自然隔离。

具体接线（INFERENCE，基于现有代码）：
- admin 服务新增一张 `link_token → scope_id`（或 `→ tenant_id`）表；签发时生成随机 token，吊销时删行。
- 门（`AgentGateAuth` / `RetrievalGateAuth`）扩展：验 token 后查表得绑定的 scope，**覆盖**客户端自报的
  `X-RBI-Scope`（或把 `RetrievalIdentity.allowed_scope_ids` 限制为 `[bound_scope]`）。
- 复用 `run_query_async` 的 scope_id 强制、三级凭据解析（`credentials.py` + `connection.py`）、
  `ScopeConnection` per-scope 缓存（**需先把 override 退休**，见 1.3）。

### 优点

1. **复用面极大**：scope_id 流（1.1）、三级凭据解析（1.2）、`RetrievalIdentity` + `can_access`
   （1.5）、`scope_allowed_for_tenant`（1.4）、`run_query_async` 必需 scope_id（1.6）、`Tenant`/
   `ScopeRecord` CRUD（1.7）全部已存在且已测。admin 服务只需加一张 token→scope 表 + 门里一段查表覆盖逻辑。
2. **隔离在数据层有兜底**：即使门被绕过，`run_query_async` 仍然按 scope_id 构造引擎 + 解析凭据，不同
   scope 拿到的 ODPS 对象/凭据天然不同（`pipeline.py:183-185`）。
3. **与既有 RBI 双门同构**：`/mcp-agent` 与 `/mcp/retrieval` 已是同一套 `GateAuthASGI` +
   `RetrievalIdentity` 模式（1.6），扩展 token→scope 是在同一处加逻辑，不引入新架构层。
4. **scope_id 形式校验已堵路径穿越**：`_SCOPE_ID_RE`（`request_scope.py:35`）封了 `..` `/` `\` `,`，
  不会出现 `X-RBI-Scope: A/../B` 读到别的 scope 的语义层目录（`request_scope.py` docstring 的实测洞）。

### 缺点

1. **「单链接单 scope」今天并不成立**：现有 `agent_mcp_token` / `retrieval_token` 是**共享** Bearer，
   scope 是客户端自报（1.6）。要落实「单链接单 scope」必须**新建 token→scope 绑定 + 服务端覆盖**逻辑——
   这部分是净新增，不是「复用」。
2. **ScopeConnection per-scope 缓存生产未接线**（1.3）：「复用 per-scope 缓存」今天是一个已写好但
   override 短路的能力。要么先退休 override（`credentials.py:7-20` 红线：曾致五天停服），要么接受生产
   走 override（凭据仍 per-scope，但无缓存无失效钩子）。
3. **`TenantAuthMiddleware` 未安装**（1.4）：`scope_allowed_for_tenant` 存在但不在请求路径上。「复用」它
   需要显式在门里调用，或装中间件——后者「会改变所有轨的失败模式，需独立评估」（`scope_authz.py`
   docstring）。
4. **token 签发/吊销是净新增**：RBI 的 admin 面今天有 `Tenant`/`ScopeRecord` CRUD（`tenant_service.py`/
   `scope_service.py`），但没有「link token」实体。

### 风险

1. **scope_id 伪造（若不覆盖）**：若门只验 token 不覆盖 scope，客户端仍可发任意 `X-RBI-Scope`。这是最
   严重的风险——必须在门里做「token→scope 查表后覆盖客户端 header」，不能只验 token。
2. **两条凭据链漂移**：`credentials.py`（rbi-mcp 侧）与 `connection.py`（rbi-query 侧）是两份解析链，
   docstring 明写「两份凭据解析链会漂，而漂的症状是『换了配置只有一半生效』」（`credentials.py:21-26`）。
   复用时必须确保 token→scope 绑定后两条链都走对。
3. **override 退休的回归风险**：`credentials.py:7-20` 红线明写删 override 走 scope 分支曾致五天停服。
   若要启用 `ScopeConnection` 缓存，退休 override 必须有独立验收（`test_credential_resolver.py::
   TestAcceptanceGate`）。
4. **内网穿透下 token 共享**：若一个 token 泄露，它能访问绑定的那个 scope 的全部数据。token 轮换、
   吊销传播、TTL 需配套（`_CACHE` TTL=300s，`credentials.py:48`，有 5 分钟窗口）。

### 与 harness·reverse-bi 的契合度

- **与 reverse-bi 契合度：高**。几乎全部机制（scope_id 流、凭据解析、身份模型、双门）都是 RBI 已有。
  净新增只有「token→scope 绑定表 + 门里覆盖逻辑」。
- **与 harness 契合度：中**。harness 的 `packages/mcp/mcp-client` 以 `streamable-http` + `headers` 桥接
  外部 MCP（见 3.3），token 与 `X-RBI-Scope` 作为 headers 注入即可；但 harness 不提供 token 签发/吊销/
  鉴权（见 3.1-3.2），这部分必须在 RBI 侧或一个 harness app 里建。

### 对内网穿透的适配

- **authn/authz 在 RBI 门**（即穿透的终点）：隧道只转发 TLS/ TCP，RBI 的 `AgentGateAuth`/`RetrievalGateAuth`
  在 ASGI 层验 token + 强制 scope。这与 `host/webserver` 的「fronting it with a real reverse proxy」
  建议一致（见 3.4）——RBI 门就是那个 reverse proxy 层。
- **token 不经 harness**：harness mcp-client 把 token 放 `headers`（`mcp-client/README.md`），隧道对它透明。
  authn/authz 的权威在 RBI 门，单一信任边界，无中转信任问题。

### 实现工作量估计（INFERENCE）

| 子项 | 工作量 | 说明 |
|---|---|---|
| token→scope 绑定表 + admin CRUD | 小 | 复用 `Tenant`/`ScopeRecord` 模式，加一张表 + 几个路由 |
| 门里 token→scope 查表 + 覆盖 `X-RBI-Scope` | 小 | 在 `AgentGateAuth`/`RetrievalGateAuth` 的 `_authenticated` 后加一段 |
| 装中间件 / 显式调 `scope_allowed_for_tenant` | 小-中 | 装中间件「会改变所有轨的失败模式」（`scope_authz.py`），需评估 |
| 退休 override 接 `ScopeConnection` 缓存 | 中-大 | 红线：曾致五天停服，需独立验收（可不做，接受 override 路径凭据仍 per-scope） |
| harness mcp-client 配 `headers` | 极小 | `cordis.yml` 一段配置 |
| **合计（不含 override 退休）** | **小-中** | 核心是 token→scope 绑定 + 覆盖逻辑 |
| **合计（含 override 退休）** | **中-大** | 退休 override 的回归风险拉高 |

---

## 3. Option 2 —— 前置独立网关层

### 机制

在数据 agent 前面放一个独立 access-control 网关，按 link/token 路由 + 过滤。网关验 token、解析绑定的
scope、把请求（带正确的 `X-RBI-Scope`）转发给 RBI 的 `/mcp-agent` 门。

### 3.1 harness 是否已有可复用的 access-control / permission / credential 机制

**结论：没有。** 以下是逐包核对：

- **`packages/interaction`**（`packages/interaction/README.md`）：`commands` / `user-approval` /
  `permission-presets` / `user-questions` / `tool-ask-user`。`permission-presets` 是**面向用户的 agent 工具
  权限预设**（model 能调哪些 tool），**不是**数据访问控制。
- **`packages/credentials`**（`packages/credentials/credentials/README.md`）：`ctx.credentials` 是**凭据引用
  解析**（`apiKeyEnv: DEEPSEEK_API_KEY` → 值），「configuration carries references to secrets, never the
  secrets」。是 secret 管理，**不是** authz。`credentials-local` 层是 env + `$DSH_HOME/.credentials.yaml`。
- **`packages/identity`**（`packages/identity/README.md`）：只有 `anonymous-user-id`（telemetry/feedback
  correlation）。「These values do not represent an authenticated account」。**不是**身份认证。
- **`packages/session`**（目录列举）：`session-persistence{,-jsonl,-sqlite}` / `session-projection{,-cache}`
  / `session-stats` / `session-telemetry{,-otel}` / `session-title*` / `session-checkpoint-policy`。全是
  持久化/投影/统计，**不是** auth。
- **`packages/api/gateway`**（`packages/api/gateway/README.md`）：`TypertGatewayService` 是 **Typert unary RPC
  分发器**（Host↔Client 业务方法调用），**不是** access-control 网关。有「trusted-host interceptor」但那是
  分发到 Gateway vs API Proxy 的路由，不是数据隔离 authz。
- **`packages/api/remotes`**（`packages/api/remotes/README.md`）：BFF，own Agent/Session identity policy。
  `createApiRemoteAgentResolver()` 复用 live Agent / resume cold session / subagent ownership fence。是
  Agent/Session RPC 身份，**不是**数据访问控制。
- **`packages/guard`**（`packages/guard/README.md`）：`repeat-tool-reminder` / `timeout-policy`。loop 卫生，
  **不是** access control。
- **`packages/fs`**（`packages/fs/README.md`）：`fs-sandbox` 是**文件系统** per-call mode + workspace root
  fence（read-only / workspace-write）。是 FS 隔离，**不是**数据访问隔离（类比可借鉴，但不是同构）。

**grep 证据**：在 `packages/` 全域 grep `bearer|authorize|access.?control|tenant|isolation` → **零命中**。
harness 代码里完全没有这些概念。

**明文证据**：
- `packages/host/webserver/README.md:21`：「**No TLS, auth, or origin policy** — binding a non-loopback
  address exposes the server to that network; deployment hardening (or fronting it with a real reverse proxy)
  is deliberately out of scope for the dev-facing v1.」
- `packages/host/apiproxy/README.md:81`：「the gateway is a **single-user local service**. A carrier that
  exposes it to multiple users must replace internal search details with a public-safe diagnostic.」

**INFERENCE**：harness 是单用户、本地、无 auth 的 dev-facing v1。它**明确把 auth 推给「a real reverse
proxy」**。Option 2 的「独立网关」就是 harness 文档里说的那个「real reverse proxy」——要从零建。

### 3.2 独立网关要从零建什么

| 要建项 | harness 能复用 | 备注 |
|---|---|---|
| token 签发/吊销/轮换 | 无 | harness 无此机制 |
| token→scope 绑定存储 | 无 | harness 无 tenant/scope 概念 |
| token 验证（验签/过期） | 无 | harness 无 auth |
| scope 强制（覆盖/限制 X-RBI-Scope） | 无 | harness 不懂 scope_id |
| 转发到 RBI `/mcp-agent` | `packages/mcp/mcp-client` 的 streamable-http transport | 但 mcp-client 是**客户端**桥，不是网关；网关是反向 |
| 审计/限流 | 无 | harness 无 |

### 3.3 harness 如何桥接外部 MCP server

`packages/mcp/mcp-client/README.md`：一个 plugin 实例对应一个 MCP server（`cordis.yml`），`transport:
streamable-http` + `url` + `headers`（如 `Authorization: Bearer ${MCP_TOKEN}`）。注册外部 server 的工具到
`ctx.tools`，名为 `mcp__<serverName>__<rawName>`。重连指数退避、per-outage 预算。

**关键**：harness mcp-client **只转发 headers**到外部 MCP server，**自身不做 access control**。access
control 在**外部 MCP server**（即 RBI 的 `/mcp-agent` 门）。所以 rbi-mcp 留外部时，access link 命中的是
RBI 门的端点。

### 3.4 对内网穿透的适配

- **Option 2 的网关是隧道终点**：authn/authz 在网关，然后转发给 RBI 门。RBI 门要么**信任网关**（跳过自己的
  auth，但那样 RBI 的 scope 强制被绕过，除非网关正确设 `X-RBI-Scope`），要么**重新验**（冗余，且两个信任
  边界）。
- **信任边界问题（INFERENCE）**：若 RBI 门信任网关（跳过 token 验），则网关必须**正确**地把绑定的 scope
  写进 `X-RBI-Scope`，RBI 的 scope 隔离变成**依赖网关的正确性**——一个被攻破或配错的网关 = 隔离失效。
  若 RBI 门不信任网关（仍验 token），则网关是**纯冗余跳**，不如直接让 RBI 门做。
- **harness 的明文立场**（`host/webserver/README.md:21`）：auth 是「out of scope for the dev-facing v1」，
  建议「fronting it with a real reverse proxy」。Option 2 的网关就是这个 reverse proxy，但 RBI 门**已经**
  是一个带 auth + scope 强制的 reverse-proxy 等价物（`AgentGateAuth` / `RetrievalGateAuth`）。

### 优点

1. **与 harness 解耦**：网关独立部署，可独立升级/轮换，不碰 RBI 内部。
2. **可扩展到多 agent**：若未来多个数据 agent（不只 RBI）要统一 access control，一个网关可复用。
3. **可加非隔离能力**：限流、配额、审计聚合、SSO/OIDC 集成——这些 RBI 门不原生支持。
4. **不动 RBI override 红线**：网关在 RBI 门之前，RBI 内部的 override/ScopeConnection 接线问题与网关无关。

### 缺点

1. **harness 无可复用 auth 机制**（3.1）：网关的 token 签发/验签/scope 绑定全部从零建。
2. **与 RBI 门功能重叠**：RBI 的 `/mcp-agent` 门**已经**做 Bearer 验 + scope 强制（1.6）。网关在它前面再加
   一层 = 两个 auth 层，要么冗余验两次，要么信任传递（引入新信任边界）。
3. **scope 强制的权威仍在 RBI**：即使网关解析了 scope，最终 `run_query_async` 的 scope_id 仍由 RBI 的
   `request_scope` 从 `X-RBI-Scope` 取。网关必须正确设这个 header，否则隔离失效——而 RBI 门本来就能自己做。
4. **多一跳延迟 + 多一个故障点**：网关宕 = 全部数据 agent 不可达。

### 风险

1. **信任传递错配**：网关验 token 后若 RBI 门仍要求自己的 token（`agent_mcp_token`），要么两套 token
   要对齐，要么 RBI 门要改成信任网关——后者扩大攻击面。
2. **scope 覆盖竞态**：网关设 `X-RBI-Scope` 后，若客户端也发了 `X-RBI-Scope`，谁是权威？`request_scope`
   的解析是 header 优先（`request_scope.py:96-100`），网关必须**覆盖**而非**追加**。
3. **`request_scope.is_http_request()` 的判据**（1.1）：它按「有没有 `Request` 对象」判 HTTP。若网关是
   反向代理且 RBI 门仍接收 HTTP 请求，判据成立、env 回落被禁（正确）。若网关把请求转成 stdio 调用 RBI，
   则 `is_http_request()` 返回 False，env 回落复活——多租户串味洞复活（`request_scope.py:165-260`）。
   **网关必须以 HTTP 转发，不能转 stdio**。

### 与 harness·reverse-bi 的契合度

- **与 harness 契合度：低**。harness 明文无 auth（3.1），网关要从零建全部 auth 机制，且 harness mcp-client
  只是客户端桥不是网关。
- **与 reverse-bi 契合度：低-中**。网关仍要把 scope 喂给 RBI 的 `request_scope`（经 `X-RBI-Scope`），RBI 的
  scope_id/凭据/`run_query_async` 机制仍被复用，但 RBI 门的能力被网关遮蔽或冗余。

### 实现工作量估计（INFERENCE）

| 子项 | 工作量 | 说明 |
|---|---|---|
| 网关服务骨架（HTTP 反代 + 路由） | 中 | 从零；harness 无可复用 auth 网关 |
| token 签发/吊销/验签/轮换 | 中 | 从零；含存储 |
| token→scope 绑定 + scope 覆盖逻辑 | 中 | 从零；要确保覆盖而非追加 `X-RBI-Scope` |
| admin 面（签发/吊销 UI/CLI） | 中 | 从零 |
| 与 RBI 门的信任模型对齐 | 中 | 要决定 RBI 门是信任网关还是重验 |
| 审计/限流（可选） | 中-大 | 可选但常被要求 |
| **合计** | **中-大** | 几乎全部从零，且与 RBI 门功能重叠 |

---

## 4. 对比表

| 维度 | Option 1（复用 RBI scope_id + 每作用域凭证） | Option 2（前置独立网关） |
|---|---|---|
| **隔离落点** | RBI 数据层 + RBI 门（双层） | 网关层（+ RBI 门若不信任则双层） |
| **复用 RBI 既有机制** | 极多：scope_id 流、三级凭据、`RetrievalIdentity`、`scope_allowed_for_tenant`、双门、`run_query_async` | 中：仍经 `X-RBI-Scope` 喂 RBI，但门能力被遮蔽 |
| **复用 harness 既有机制** | 仅 `mcp-client` 的 headers 转发 | 几乎无（harness 无 auth，`mcp-client` 是客户端不是网关） |
| **净新增** | token→scope 绑定表 + 门里覆盖逻辑 | 整个网关（骨架 + token + admin + 信任模型） |
| **scope 伪造风险** | 高（若不覆盖 header）；可由「门里覆盖」堵 | 中（网关设 header，但 RBI 仍按 header 取，覆盖竞态） |
| **`ScopeConnection` per-scope 缓存** | 已写好未接线（override 短路）；退休有红线风险 | 不相关（网关不碰此层） |
| **`TenantAuthMiddleware` 未装** | 需显式调或装中间件（改失败模式） | 不相关（网关自己做 authz） |
| **内网穿透 auth 位置** | RBI 门（隧道终点），单一信任边界 | 网关（隧道终点）→ RBI 门，两个边界或信任传递 |
| **多 agent 可扩展性** | 低（绑死 RBI） | 高（网关可统一多 agent） |
| **限流/配额/SSO** | 需另加 | 网关天然位置 |
| **工作量（核心）** | 小-中 | 中-大 |
| **与 ADR-0006「session 不绑 game」** | 兼容（链接绑 scope ≠ session 绑 scope） | 兼容 |
| **与 ADR-0014 凭据硬化** | 一致（SecretStr/allowlist/BaseSettings 已就） | 需在网关重做同等硬化 |

---

## 5. 推荐 + 理由

### 推荐：**Option 1（复用 reverse-bi scope_id + 每作用域凭证），但明确两件事**

1. **必须做「token→scope 服务端覆盖」**——这是 Option 1 成败的关键。现有 RBI 门只验共享 token + 信任
   客户端 `X-RBI-Scope`（1.6），「单链接单 scope」今天**不成立**。Option 1 的核心新增就是：token 签发时
   绑定 scope，门验 token 后**覆盖**（不是追加）客户端的 `X-RBI-Scope`，并把 `RetrievalIdentity.
   allowed_scope_ids` 限制为 `[bound_scope]`。复用 `RetrievalIdentity.can_access`（`auth_service.py:131`）
   是天然落点。

2. **不要为「复用 ScopeConnection 缓存」而退休 override**——`credentials.py:7-20` 红线明写曾致五天停服。
   接受生产走 override 工厂（凭据仍 per-scope，只是无缓存无失效钩子），把 override 退休作为独立动作另做。
   Option 1 的隔离不依赖 `ScopeConnection` 缓存——`run_query_async` 的 scope_id 强制 + per-scope 凭据解析
   已经给隔离兜底。

### 理由

- **复用面差距悬殊**：Option 1 复用 RBI 几乎全部既有机制（1.1-1.7），净新增只有 token→scope 绑定 + 门里
  覆盖；Option 2 几乎全部从零建（3.2），且 harness 明文「No TLS, auth, or origin policy」（3.1）。
- **与 RBI 门功能重叠**：Option 2 的网关与 RBI 的 `AgentGateAuth`/`RetrievalGateAuth`（1.6）做同一件事
  （验 token + 强制 scope），要么冗余要么信任传递——两者都不优。
- **内网穿透信任边界**：Option 1 的 auth 在 RBI 门（隧道终点），单一边界；Option 2 引入网关→RBI 的第二
  边界，要么 RBI 信任网关（扩大攻击面），要么重验（冗余）。
- **隔离的数据层兜底**：Option 1 即使门被绕，`run_query_async` 仍按 scope_id 构造引擎 + 解析 per-scope
  凭据（`pipeline.py:183-185`），不同 scope 拿不同 ODPS 对象——这是 RBI 已有的数据层隔离，Option 2 的
  网关不增强这层。

### 何时转 Option 2

若未来出现以下任一，再考虑加独立网关（且那时它补的是 RBI 门不做的能力，不是重做隔离）：
- 多个数据 agent（不只 RBI）要统一 access control；
- 需要 SSO/OIDC 集成、限流/配额、集中审计；
- 合规要求 auth 层与数据层物理分离。

---

## 6. 关键不确定点

1. **token→scope 绑定存哪里**：RBI 的 `odps_configs` DB 已在（`odps_config_service.py`），但无 link token
   表。是新建表，还是复用 `Tenant`（`allowed_scope_ids = [scope_id]`）+ 一个 per-tenant token 字段？
   后者复用 `scope_allowed_for_tenant`（`scope_authz.py:55`）更省，但 tenant 模型带 username/password，
   link token 是否适合复用 tenant 语义待定。
2. **override 退休的验收状态**：`credentials.py:215` 的 `install_credential_resolver` 已注册 tier-0
   resolver，但 override 仍在。`test_credential_resolver.py::TestAcceptanceGate` 是否已覆盖「只靠内置路径」
   的生产等价验收？docstring 说「能读到」与「已在真部署上验过可以只靠它」是两件事（`credentials.py:13-15`）。
3. **harness app 作为 admin 服务的形态**：deepseek-harness-da 是插件 harness，admin 服务是一个 harness app
   还是 RBI 的 rbi-web admin 面？前者要新建 admin UI，后者复用 `rbi-web/routers/admin.py` + `odps_config.py`。
4. **`X-RBI-Scope` 覆盖 vs 追加的 ASGI 实现**：`AgentGateAuth.__call__`（`agent_mcp_gate.py:140`）缓冲 body
   重放，要在重放前改 header 还是后改？`request_scope` 的 `_resolve`（`request_scope.py:96`）读 header，覆盖
   必须在 RBI 的 `request_scope` 读取之前。
5. **内网穿透的 TLS 终点**：RBI 门做 auth，但 TLS 在隧道还是在 RBI？`agent_mcp_gate.py` 的 `_authenticated`
   读 `Authorization` header，不校验 TLS。若隧道不卸 TLS，header 加密；若卸载，需 mTLS 或受信网络。
6. **rbi-mcp 留外部时的 mcp-client headers 注入**：`packages/mcp/mcp-client/README.md` 的 `headers` 支持
   `${ENV}` 展开，但 `X-RBI-Scope` 是自定义 header——需确认 harness mcp-client 是否允许自定义 header
   （README 示例只演示 `Authorization`）。

---

## 附：关键 path:line 索引

- `reverse-bi/docs/adr/0006-multi-game-architecture.md` — 多游戏架构（game 一等实体、session 不绑 game）
- `reverse-bi/docs/adr/0014-credential-hardening-basesettings.md` — 凭据硬化（SecretStr/allowlist/BaseSettings）
- `reverse-bi/docs/adr/0013-converge-agent-stacks.md` — qodercli stack 退场、rbi-agent 默认（迁移背景）
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:166` — `resolve_for_scope`（tier-0 resolver）
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:50` — `_CACHE` per-scope TTL
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:215` — `install_credential_resolver`
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:7-26` — 红线 + 双链漂移警告
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/scope_authz.py:55` — `scope_allowed_for_tenant`（+ 模块 docstring：
  TenantAuthMiddleware 未装到任何 server）
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/request_scope.py:35` — `_SCOPE_ID_RE` 形式校验
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/request_scope.py:165` — `is_http_request`（Request 对象判据）
- `reverse-bi/libs/rbi-query/src/rbi_query/pipeline.py:169` — `run_query_async`（scope_id 必需）
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:6` — 「生产上尚未接入」诚实缺口
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:167` — `ScopeConnection`
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:262` — `resolve_connection`（三级）
- `reverse-bi/apps/rbi-web/src/rbi_web/services/agent_mcp_gate.py:169` — `AgentGateAuth`（共享 `agent_mcp_token`）
- `reverse-bi/apps/rbi-web/src/rbi_web/services/agent_mcp_gate.py:67` — `_scope_header_reject`（缺 header 即 400）
- `reverse-bi/apps/rbi-web/src/rbi_web/services/mcp_gate.py` — `RetrievalGateAuth` + `_identity_from_headers`
- `reverse-bi/apps/rbi-web/src/rbi_web/services/auth_service.py:119` — `RetrievalIdentity`
- `reverse-bi/apps/rbi-web/src/rbi_web/services/auth_service.py:131` — `can_access`
- `reverse-bi/apps/rbi-web/src/rbi_web/services/auth_service.py:175` — `authorize_game`
- `reverse-bi/apps/rbi-web/src/rbi_web/main.py:325` — `app.mount("/mcp-agent", ...)`
- `reverse-bi/apps/rbi-web/src/rbi_web/main.py:326` — `app.mount("/mcp", ...)`
- `deepseek-harness-da/packages/host/webserver/README.md:21` — 「No TLS, auth, or origin policy」
- `deepseek-harness-da/packages/host/apiproxy/README.md:81` — 「single-user local service」
- `deepseek-harness-da/packages/mcp/mcp-client/README.md` — streamable-http + headers 转发
- `deepseek-harness-da/packages/credentials/credentials/README.md` — 凭据引用解析（非 authz）
- `deepseek-harness-da/packages/identity/README.md` — anonymous-user-id（非认证账户）
- `deepseek-harness-da/packages/interaction/README.md` — permission-presets（agent 工具权限，非数据访问）
- `deepseek-harness-da/packages/api/gateway/README.md` — Typert RPC 分发器（非 auth 网关）
- `deepseek-harness-da/packages/fs/README.md` — fs-sandbox（FS 隔离，非数据访问）
