# R2 — MaxCompute 凭证缓存：override-factory 短路 vs 正经接 tier-0

wayfinder ticket R2 · ⑤a deep · 中文报告 · 主源：reverse-bi 源 + harness credentials seam。
所有 `path:line` 为绝对路径或仓库内相对路径。INFERENCE 标注的是非源文直引的推断。

---

## 1. 三层凭证解析 + per-scope 缓存机制

### 1.1 三层优先级（高 → 低）

`libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:277-310`（`resolve_connection`）逐级下落：

| tier | 来源 | 代码落点 |
|---|---|---|
| tier 0 | 宿主注入的 credential resolver（生产 = rbi-mcp 的 DB→config_file→env 链） | `connection.py:151-153`（`register_credential_resolver`）、`connection.py:174-200`（`_from_resolvers`） |
| tier 1 | scope `config.yaml` 的 `maxcompute.config_file` + `environment` | `connection.py:227-256`（`_from_config_file`） |
| tier 2 | `ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT` 进程环境变量 | `connection.py:259-274`（`_from_env`） |

tier 0 的返回型是 `OdpsCredential`（`connection.py:80-95`，纯字段、不持 `ODPS` 对象）；tier 1/2 只交出 `_OdpsFactory`（惰性构造 `ODPS`），`ScopeConnection.credential` 在这两层为 `None`（`connection.py:289-309`）。

生产侧 tier 0 resolver 在 `libs/rbi-mcp/src/rbi_mcp/credentials.py:142-167`（`resolve_for_scope`），它自己再跑一遍 **DB `odps_configs` → config_file → env** 三级（`credentials.py:97-138` `_resolve_uncached`），优先级与 `state.get_odps()` **逐字一致**（`credentials.py:97-101` 注释）。

### 1.2 per-scope 连接缓存

- `ScopeConnection`（`connection.py:98-129`）：一个 scope 的 `ODPS` 对象**惰性构造、复用、失败被记住并原样重抛**（`connection.py:117-129` `acquire`）。
- 模块级 `_CONNECTIONS: dict[str, ScopeConnection]`（`connection.py:312-313`），键**只是 `scope_id`**——不是 `overseas` 布尔，否则同区域两个游戏会共用一份凭据（`connection.py` docstring §5.5 第 2 条；测试 `tests/test_credential_resolver.py::TestCredentialCache::test_cache_key_is_scope_id_not_overseas_bool`）。
- `get_scope_connection`（`connection.py:319-329`）：取或首次解析，`setdefault` 让并发首解幂等。
- `invalidate_scope_connection`（`connection.py:332-335`）：丢弃该 scope 连接。
- **缓存的是连接，不是 executor**：`executor.py:for_scope`（`executor.py` 中 `@classmethod for_scope`）每次新建 executor——因为 `cancel()`/`get_progress()` 无参、语义是「取消我当前这个作业」，共享 executor 会让第二条查询覆写 `_instance`、TimeoutGuard 取消掉别人的作业（`connection.py` 模块 docstring「为什么缓存的是连接而不是 executor」；`registry.py:get_engine` 同义论证）。

### 1.3 rbi-mcp 侧的 per-scope TTL 凭据缓存（与 tier 0 同源）

`credentials.py:42-45` `_TTL_S = 300.0`、`_CACHE: dict[str, tuple[OdpsCredential, float]]` 键为 `scope_id`；`resolve_for_scope`（`credentials.py:142-167`）**锁外解析、锁内写**（MINOR-8，DB 调用慢，持锁会串行化所有 scope）；解析为 `None` **不写缓存**（一次 DB 抖动不该被记住整个 TTL）；`invalidate_credential`（`credentials.py:189-205`）同时清 rbi-mcp 凭据缓存 **和** rbi-query 侧 `invalidate_scope_connection`，否则会「改了配置只有重启才生效」。

---

## 2. 生产 override-factory 短路

### 2.1 短路在哪

`libs/rbi-mcp/src/rbi_mcp/servers/execution.py` 的 `register()` 在启动期执行：

```
credentials.install_credential_resolver()       # 装 tier 0
register_engine("maxcompute", _maxcompute_engine_factory)   # 装 override
```

`registry.get_engine(name, scope_id)`（`libs/rbi-query/src/rbi_query/registry.py` 的 `get_engine`）**优先走 override**：

```python
override = _OVERRIDES.get(key)
if override is not None:
    return override(scope_id)
```

于是 `OdpsExecutor.for_scope()` 不跑、`get_scope_connection`/`resolve_connection` 不跑、`registry.invalidate` 在生产**调用点为 0**（`registry.py` `invalidate` docstring 「⚠️ 生产调用点为 0」；`connection.py` 模块 docstring 同义）。`invalidate_scope_connection` 同样只有测试调（`connection.py` 模块 docstring）。

### 2.2 override 工厂做什么

`execution.py:_maxcompute_engine_factory(scope_id)` 构造 `OdpsExecutor(_state.get_odps)`——传的是**函数**而非 `ODPS` 对象，让 `state` 在每次查询时重新解析，也让测试 `monkeypatch.setattr(state, "get_odps", ...)` 生效（`execution.py` `_maxcompute_engine_factory` docstring）。`get_odps()` 走 DB→config_file→env 优先级链（`credentials.py` 同源注释）。

executor 内部的 `_acquire`（`executor.py`）做 **per-executor 记忆化**（含失败）：`self._odps = self._get_odps_fn()` 只调一次，失败被记住并原样重抛。`executor.py` docstring「丢掉之后每条查询多付多少」算过：一次 `query_data` 最多 6 次 `_acquire`（G1 采样门 / G5 COUNT 门 / 主查询，外加成本门），override 路径每次都付 `load_config()` + `rbi_data.engine.make_engine(db_path)` **新建 SQLAlchemy engine** + 查 `odps_configs` + 构造 `ODPS`。

### 2.3 短路的后果（直引）

`connection.py` 模块 docstring：

> **生产路径一次都不经过这里。** … 于是全局注册在启动期就把 `get_engine` 的 per-scope 分支**短路**了：`OdpsExecutor.for_scope()` 不跑，本模块的 `get_scope_connection` / `resolve_connection` 不跑，`registry.invalidate` 与 `invalidate_scope_connection` 的**生产调用点为 0**（全仓只有测试调）。
>
> 也就是说：**代码是对的、测试是绿的、生产走不到。**

`registry.py` `invalidate` docstring：「rbi-mcp 在启动期 `register_engine("maxcompute", ...)` 注册了一个 override 工厂，而 `get_engine` **优先走它** —— 于是 `OdpsExecutor.for_scope()` 与 `engines.maxcompute.connection` 的 per-scope 连接缓存在生产上根本不参与，本函数要失效的那个东西**在生产上不存在**。」

`registry.py:get_engine` docstring：override（`register_engine`）「**优先于**内置构造：宿主注入的工厂自己知道怎么解析凭据」；同时指出「凭据注入的**正确落点**是 tier 0 的 credential resolver … 不是整个 engine 工厂 —— 后者会把 `get_engine` 的 per-scope 分支整条短路（连接缓存、`invalidate`、scope 流动三件在生产上零执行）。本参数保留是为了**过渡**，不是为了长期共存。」

---

## 3. 退休 override 的 5 天停服红线

### 3.1 票据原文（多处直引）

- `execution.py` `_maxcompute_engine_factory` docstring：「🔴 **但本批不删这个 override。** 票据原文：『绝对不要『删 override 走 scope 分支』—— 会逐字重放 2026-08-05 五天全面停服（`8f169d91`）』。『内置路径有能力读到』与『已在真部署上验过可以只靠它』是两件事，后者要在有真 DB 与真 scope 配置的环境里验。退休它是后续独立动作，判据是那条验收在**生产形态**上也绿。」
- `credentials.py` 模块 docstring 🔴 红线：「票据原文：『**绝对不要『删 override 走 scope 分支』** —— 会逐字重放 2026-08-05 五天全面停服』。本模块让内置路径**有能力**读到 DB 凭据（验收用例在 `libs/rbi-query/tests/test_credential_resolver.py::TestAcceptanceGate`），但 `register_engine` 的 override **本批保留**。」
- `connection.py:8` 附近模块 docstring：「本票红线（2026-08-05 五天停服）」。
- `tests/test_credential_resolver.py` 模块 docstring：「票据原文：『**绝对不要『删 override 走 scope 分支』** —— 会逐字重放 2026-08-05 五天全面停服（`8f169d91`）』。原因是 `resolve_connection` 只有两级（scope config.yaml → `ODPS_*` env），而**生产凭据在 DB 里**，两级都读不到它。」

### 3.2 红线的两条同族形态

1. **删 override 走 scope 分支**：`resolve_connection` 只有两级，DB 凭据读不到 → 全面停服。`execution.py` `_maxcompute_engine_factory` docstring：「raw `os.environ` 在本部署中未设 —— 见 incident 2026-08-05」。
2. **resolver 异常穿出去**：`connection.py:184-186`（`_from_resolvers` 注释）「让异常穿出去等于『配置中心抖一下，全部查询失败』—— 那是本票红线（2026-08-05 五天停服）的同族形态」。所以 `_from_resolvers` **跳过抛异常的 resolver 并留痕**（`connection.py:174-200`，`try/except Exception: logger.exception(...); continue`），tier 1/2 继续兜底。

### 3.3 退休判据

`execution.py` `_maxcompute_engine_factory` docstring：退休判据 = 「那条验收在**生产形态**上也绿」（即 `test_credential_resolver.py::TestAcceptanceGate::test_with_resolver_get_engine_resolves` 在真 DB + 真 scope 配置的部署上复现）。`test_credential_resolver_wiring::test_override_factory_is_still_registered` 钉住它还在，防顺手清理。

---

## 4. 迁移选项：正经接 tier-0 vs 沿用 override-factory

### 4.1 选项 A — 正经接 tier-0 凭证解析（让内置路径 owns 缓存 + invalidate）

**已完成的部分**：`credentials.py:225-237` `install_credential_resolver()` 把 `resolve_for_scope` 注册为 rbi-query 的 tier 0「db」resolver；`execution.py:register()` 在 `register_engine` **之前**调它（注释：「先装它让『override 退休』那一天只需删下面一行」）。验收用例 `tests/test_credential_resolver.py::TestAcceptanceGate::test_with_resolver_get_engine_resolves` 在「PATH 无 maxc、零 `ODPS_*`、无 scope config.yaml」的环境里证明 `registry.get_engine("maxcompute", scope_id)` 经内置 `OdpsExecutor.for_scope` 拿到 `conn.origin.startswith("DB odps_configs")`、`conn.credential.project == "proj-db"`。

**收益**：per-scope 连接缓存、`invalidate`、scope 显式流动三件回到内置路径；`scope_id` 经注册表显式流动（`registry.py:get_engine` docstring「HARDENING-SPEC §5（票 P2-3）：override 现在**收到 `scope_id`** … 两条路因此**语义收敛**」）；hot-reload 可挂 `invalidate_credential`（`credentials.py:189-205` 已备好，预留 `odps_configs` 写入方调用）。

**代价/风险**：
- 必须在**生产形态**复现 `TestAcceptanceGate`（真 DB + 真 scope config），单测绿 ≠ 生产绿——这正是红线判据（`execution.py` docstring）。
- 两层缓存要协调失效：rbi-mcp 的 `_CACHE`（`credentials.py:42-167`）与 rbi-query 的 `_CONNECTIONS`（`connection.py:312-329`）。`invalidate_credential` 已双清（`credentials.py:189-205`），但**生产调用点为 0**——需挂 `odps_configs` 写入方（全仓 grep 不到，`credentials.py:42-45` 注释 Hard Constraint 2 实测结论）。
- resolver 抛异常须被 `_from_resolvers` 吞掉并留痕（已实现 `connection.py:174-200`），否则「配置中心抖一下全部查询失败」（同族红线）。

### 4.2 选项 B — 沿用 override-factory

**收益**：不碰红线；override 路径已稳定（`state.get_odps` 每查询重解析，`executor._acquire` per-query 记忆化把每查询代价压到 6 次一趟真代价）；`canceller_for`/孤儿收割依赖的 per-query executor 语义不变。

**代价/风险**（结构性，不是「忘了接」）：
- per-scope 连接缓存、`invalidate`、scope 显式流动三件**生产零执行**（`registry.py` `invalidate` docstring、「在生产上不存在」）。
- 配置热更无失效钩子（override 每查询重解析是真，但 `invalidate` 那条**无事可做也无处可调**）。
- `scope_id` 经注册表拿到却**不用于解析**：override 内部仍走 ambient `request_scope`（`execution.py:_maxcompute_engine_factory`：`ambient = request_scope.scope_id()`，参数只作对账日志，`scope_id != ambient` 时只 warning 不抛）。
- 与「凭据注入正确落点是 tier 0 resolver，不是整个 engine 工厂」这条已记录结论直接冲突（`registry.py:get_engine` docstring）。

### 4.3 推荐

**选项 A 为目标态，选项 B 为过渡保险**——这正是票 P2-3 的明确立场：tier-0 resolver 已装（`install_credential_resolver`），override **本批不删**，退休是「后续独立动作」，判据是生产形态验收绿。迁移应**正经接 tier-0**（已接线，验证生产形态即可），**不应把 override-factory 作为永久设计沿用**——它是三件零执行机制的文档化根因。退休前保留 override 作 belt-and-suspenders，退休后 `register_engine("maxcompute", _maxcompute_engine_factory)` 一行可删（`execution.py:register` 注释明示）。

INFERENCE：若 da 侧迁移时仍需 Python 侧 MaxCompute 执行，**不要新建第二份 override-factory**；直接调 `registry.get_engine("maxcompute", scope_id)`（已能经 tier 0 拿到 DB 凭据），让内置路径 owns 缓存/失效/scope 流动。

---

## 5. `query-maxcompute` Provider（外置 sidecar 经 mcp-client）凭证处理推荐

### 5.1 现状

harness `packages/` 下**无** `query-maxcompute` 或任何 maxcompute/odps 提供方（`grep maxcompute|odps|ODPS packages/` 0 命中）。已有的两块拼图：

- **凭证 seam**（`packages/credentials/credentials/src/index.ts`）：Cordis 服务 `CredentialProvider`，`resolve(ref) → {value, source}`。**每次调用都重新解析、禁止跨操作缓存**（`index.ts:60-65` docstring：「Resolution is per call: consumers re-resolve at each operation and must not cache across operations — that per-operation read is what makes a changed credential reach the next operation without a restart」）。`CredentialRef` 是 POSIX 标识符 brand（`types.ts`），配置面只见 ref、永不见值。
- **本地 provider**（`packages/credentials/credentials-local/src/index.ts`）：`env > $DSH_HOME/.credentials.yaml > <cwd>/.env > $DSH_HOME/.env` 层级（`index.ts` 模块 docstring）；0600 文件、chokidar watcher 热发布外部编辑（`credentials-local/src/index.ts` `reconcileFromDisk`）；`credentials/updated` 事件在写入后 fan-out（`credentials/src/index.ts:notifyUpdated`）。
- **mcp-client**（`packages/mcp/mcp-client/src/index.ts`）：连外置 MCP server，工具注册为 `mcp__<serverName>__<rawName>`（`tools.ts:publicToolName`）。`StdioConfig.env` = 「Extra env vars merged on top of scrubbed ambient env」（`index.ts` `StdioConfig`）；`StreamableHttpConfig.headers` 供 HTTP 注入。重连策略 `ReconnectConfig`（`connection.ts`，指数 backoff、`maxAttempts` 后放弃并注销工具）。

### 5.2 推荐（da 侧如何解析 + 传 scope_id + 凭证给外置 MaxCompute sidecar）

把 `query-maxcompute` 配成一个 mcp-client 实例（`serverName: "query-maxcompute"`），da 侧 per-call 解析凭证 ref、注入 sidecar；sidecar owns per-scope ODPS 连接缓存。

**(a) da 侧解析（per-call，不缓存）**：
对 4 个 ref（`ODPS_ACCESS_ID`、`ODPS_ACCESS_KEY`、`ODPS_PROJECT`、`ODPS_ENDPOINT`）调 `ctx.credentials.resolve(ref)`（`credentials/src/index.ts` 抽象方法）。**禁止跨调用缓存**——这是 seam 的硬规则（`index.ts:60-65`），也是 rbi-mcp `_resolve_uncached` 走 DB→config_file→env 逐字一致、不记忆的等价物。改凭证经 `credentials/updated` 事件（`credentials/src/types.ts`）到下一次 `resolve` 即生效，无需重启。

**(b) 传 `scope_id`（显式，不经 ambient）**：
`scope_id` 作为 MCP 工具的**显式入参**（工具 input schema 一格），**不用 ambient ContextVar**。镜像 rbi-query `core/context.py` 的分层边界（`pipeline.py` 模块 docstring：「rbi-query **不自己发现 scope** … 一旦从 ContextVar 里摸 scope，就变成只能跑在 rbi-mcp 的请求上下文里」）。`registry.py:get_engine` 收 `scope_id` 参与构造（MaxCompute endpoint/project/凭据按 scope 不同），da→sidecar 同理。

**(c) 传凭证（stdio env，不进 model context）**：
INFERENCE：优先 stdio transport，凭证经 `StdioConfig.env` 注入 sidecar 子进程（合并 over scrubbed ambient）。**不要把 `access_key` 放进工具 args**——那会把密钥塞进模型可见的 `tools/call` 参数（`tools.ts:createExecutor` 把 args 直发 `client.request({method:'tools/call', params:{name, arguments:args}})`）。streamable-http 则经 `headers` 注入。sidecar 从自己的 env/headers 读，永不 log。

**(d) sidecar owns per-scope 连接缓存 + 失效**：
INFERENCE：sidecar 内部复刻 `ScopeConnection` + `get_scope_connection`（`connection.py:98-129, 319-329`）——键 `scope_id`、惰性构造 ODPS、失败记住并重抛、`invalidate_scope_connection` 配置热更后丢弃。da 侧不缓存 ODPS 对象（seam per-call 规则），只缓存到 `OdpsCredential` 字段这一层（对应 rbi-mcp `credentials.py:_CACHE` 的 300s TTL）。失效钩子：da 侧监听 `credentials/updated` 事件 → 调 sidecar 暴露的 `invalidate_scope` 工具 或 重启 sidecar 进程（mcp-client `connection.ts` dispose+reconnect 已支持）。

**(e) 不要把 override-factory 模式搬进 sidecar**：
INFERENCE：sidecar 直接调 `for_scope(scope_id)`（等价于 `OdpsExecutor.for_scope`），不经任何「无参 override 工厂」。override-factory 是 rbi-mcp 的过渡产物（§4），da 侧迁移时不应复制——它会逐字重放「per-scope 缓存/invalidate/scope 流动三件零执行」的结构性缺陷（`registry.py:get_engine` docstring）。

### 5.3 与 rbi-mcp 的对应

| reverse-bi（rbi-mcp + rbi-query） | harness da 侧推荐 |
|---|---|
| `credentials.py:install_credential_resolver` 装 tier 0「db」resolver | da 不装 resolver，per-call `ctx.credentials.resolve(ref)` |
| `credentials.py:_CACHE` per-scope TTL 300s（凭据层） | da 侧可选：`OdpsCredential` 字段级缓存（per-call resolve 是 seam 规则，跨调用缓存禁） |
| `connection.py:_CONNECTIONS` per-scope ODPS 对象缓存 | **sidecar owns**，键 `scope_id` |
| `connection.py:invalidate_scope_connection` + `credentials.py:invalidate_credential` 双清 | da 监听 `credentials/updated` → 调 sidecar `invalidate_scope` 工具 或 重启 sidecar |
| override-factory `_maxcompute_engine_factory`（过渡，不删） | **不复制**——sidecar 直调 `for_scope(scope_id)` |
| `registry.get_engine` 优先 override、短路内置 | 无等价物——sidecar 唯一路径是 `for_scope(scope_id)` |

---

## 关键路径索引

- reverse-bi 3 层 + 缓存：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`
- override 短路点：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/registry.py`（`get_engine` 优先 `_OVERRIDES`、`invalidate` 生产 0 调用）
- override 工厂 + tier-0 装载：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/servers/execution.py`（`_maxcompute_engine_factory`、`register`）
- tier-0 resolver + TTL 缓存 + 双清失效：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py`
- 验收用例 + 红线原文：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/tests/test_credential_resolver.py`
- executor per-query 记忆化：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/executor.py`（`_acquire`、`for_scope`）
- harness 凭证 seam：`/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/index.ts`（`CredentialProvider.resolve` per-call）
- harness 本地 provider 层级 + watcher：`/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials-local/src/index.ts`
- harness mcp-client（sidecar 接线点）：`/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/index.ts`（`StdioConfig.env`）、`src/tools.ts`（`publicToolName`、`createExecutor` args 直发 wire）
