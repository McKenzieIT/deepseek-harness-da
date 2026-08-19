# P4 — build defaults 二次确认（B/D/E/F/G 五项对照源码）

wayfinder ticket P4 · 中文报告 · 独立 subagent 二次确认。
主源：reverse-bi `core/protocol.py` / `core/guards/*` / `engines/maxcompute/*` / `registry.py` + rbi-mcp `execution.py` / `credentials.py`；harness `packages/credentials/*` / `packages/mcp/mcp-client/*` / `packages/shell/tool-bash`。
所有 `path:line` 为绝对路径或仓库内相对路径。INFERENCE 标注的是非源文直引的推断。

**背景**：父 agent 已锁定 A1-split（engine-wrapper 门 in `ctx.query.execute`、会话门 in `tool-query`）+ C1（tool-query 入参 = strict SQL）。本笔记**不重议**这两条，只独立对照源码二次确认 B/D/E/F/G 五项默认值。读源顺序：p4-guard-chain-placement.md + r2 笔记 + map + P4 ticket 定位 → B→D→E→F→G。

---

## §1. rbi `QueryEngine` 协议真实公开面 + 3-state 类型（B 的源码依据）

### 1.1 `QueryEngine` Protocol 的方法签名（protocol.py:521）

`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/core/protocol.py:521` `class QueryEngine(Protocol)`，模块 docstring（`:1`）明写"只有类型与协议声明，没有实现"。公开面（逐字直引签名）：

```python
# protocol.py:521
class QueryEngine(Protocol):
    name: str
    capabilities: EngineCapabilities

    async def execute(self, sql: str, *, database: str | None = None) -> QueryOutcome: ...
    async def estimate_cost(self, sql: str) -> CostEstimate | CostUnavailable: ...
    async def cancel(self) -> CancelResult: ...
    async def get_progress(self) -> ProgressReport: ...
    def health_check(self) -> bool: ...
```

**五个方法 + 两个属性**。模块 docstring（`protocol.py` E 节标题 `:518`）："async-only"——同步 `execute` 已从契约去掉（D2 ③），`health_check` 同步是有意的（"启动期与管理面调用，不在查询热路径"）。

**关键：Protocol 公开面没有 `attach`，也没有 `canceller_for`。** 这两个是 `OdpsExecutor` 的方法（见 §1.4），兑现能力矩阵的 `async_handle` / `cancel` 维度，但**不进 Protocol 签名**——它们的"存在性"由 `registry._DIMENSION_METHODS` 对账（§1.3），不在 Protocol 上声明。

### 1.2 3-state 类型（protocol.py:400）

`protocol.py:400` `type QueryOutcome = QueryCompleted | QueryPending | QueryFailed`（union，非"一结构 + 状态字段"）。各 frozen dataclass 字段（protocol.py 全文直引）：

- **`QueryCompleted`**：`columns: list[str]` / `rows: list[dict[str, Any]]` / `row_count: int` / `truncated: bool` / `sql: str` / `execution_meta: ExecutionMeta`
- **`QueryPending`**：`instance_id: str` / `engine_detail_url: str | None` / `elapsed_ms: int` / `stage: str` / `hint: str` / `cost_check: Literal[...] = "unavailable"`（缺省最诚实）/ `remaining_seconds: float | None = None`（仅 TimeoutGuard 填，续取路径 `None`）
- **`QueryFailed`**：`error: str` / `parse_failed: bool` / `timed_out: bool` / `instance_id: str | None` / `engine_detail_url: str | None` / `sql: str` / `failure_kind: FailureKind = "unknown"`（必填无缺省在 `reject()`）/ `estimated_bytes: int | None = None`
- **`ExecutionMeta`**：`duration_ms: int` / `engine_detail_url: str | None` / `cost_check: Literal["passed","exceeded","unavailable"]` / `timed_out: bool` / `instance_id: str | None`
- **`CancelResult`**：`success: bool` / `reason: str | None = None` / `instance_id: str | None = None` / `already_terminated: bool = False`
- **`CostEstimate`**：`input_bytes: int`；**`CostUnavailable`**：`reason: str`（三态之二，第三态"超阈"由 CostGuard 比阈值）
- **`ProgressReport`**：`elapsed_ms: int` / `stage: str` / `stalled: bool` / `engine_detail_url: str | None = None`（不做 0-100% 百分比）

`QueryOutcome` union 让"Pending 没有 rows""Failed 没有 execution_meta"由类型保证（`protocol.py:400` docstring）。与默认值 B 描述的"3-state QueryOutcome（Completed/Pending/Failed）"逐字一致。

### 1.3 `estimate_cost` 只被 CostGuard 调，非 seam consumer 直调

`core/guards/cost.py` `CostGuard` 类（p4 笔记引 `:163`，本文读全文确认：`name="cost"` / `priority=20` / `requires=("cost_estimate",)`）。`CostGuard._estimate` 方法体内（p4 笔记引 `:278`，本文直引）：

```python
# cost.py CostGuard._estimate
return await asyncio.wait_for(ctx.engine.estimate_cost(ctx.sql), timeout=bound)
```

`ctx.engine` 是 `pipeline.run_query_async` 钉进 `QueryContext` 的 per-query executor（§1.5）。**CostGuard 在 `ctx.engine` 上调 `estimate_cost`，是 engine-wrapper 链内部调用**，不是 orchestrator（`execution.py`）直调，也不是 seam consumer 直调。

`cost.py` 模块 docstring 的链序表：`SelectOnly(0) → Ambiguity(5) → RequiredPredicate(10) → ADR(15) → Cost(20) → Retry(30) → Timeout(40) → execute`。CostGuard priority=20 在 TimeoutGuard(40) 外层（`estimate_cost` 不受 `ctx.timeout` 覆盖，故自套 `wait_for` 并从 `ctx.timeout` 扣减，`cost.py` `_estimate` docstring 直引）。

**确认默认值 B 的"`estimate_cost` 是 CostGuard 内部调 provider、不进 seam 公开面"**：rbi 的 orchestrator `execution.py` 不直接调 `engine.estimate_cost`（它调 `run_query_async`，CostGuard 在链内调）。da 侧 `ctx.query.execute`（= `run_query_async` 对应）内部跑 CostGuard 调 provider.estimate_cost，consumer 不直调。

### 1.4 `attach` / `canceller_for` 在 OdpsExecutor 上，不在 Protocol 上

`engines/maxcompute/executor.py:316` `async def attach(self, instance_id: str) -> QueryOutcome`（grep 确认行号）。docstring 直引："把一个已提交的作业重新挂接到本进程，返回它**当前**的三态…挂接后本 executor 即接管该 instance —— 随后的 `cancel` / `get_progress` 作用于它"。

`registry.py` `_DIMENSION_METHODS`（全文直引）：

```python
# registry.py
_DIMENSION_METHODS = {
    "execute": ("execute",),
    "cost_estimate": ("estimate_cost",),
    "cancel": ("cancel", "canceller_for"),     # cancel 映射两个方法
    "progress": ("get_progress",),
    "async_handle": ("attach",),               # async_handle 映射 attach
    "partition_guard": (),
}
```

`async_handle` 维度的语义是"`execute` 能返回可续取的 `instance_id`（QueryPending）"（`registry.py` `_DIMENSION_METHODS` docstring："而「可续取」若没有一个把 instance 重新挂接回来的方法就是空话 —— `attach` 的存在与否是这条声明唯一可机械检查的落点"）。**`attach` 通过能力矩阵对账存在性，但不进 `QueryEngine` Protocol 签名。**

同理 `canceller_for`（`executor.py` `def canceller_for(self, instance_id) -> CancelFn | None`，兑现 `cancel` 维度的延迟绑定变体）也不在 Protocol 签名上。`executor.py:556` 附近 docstring（p4 笔记引）："一次 `query_data` 最多 3 次 `execute()` 打在同一个 executor 上…登记 `self.cancel` 这个 bound method 是错的…改用 `canceller_for`，由 executor 闭包捕获登记时刻的 instance 对象"。

**续取路径不经 Guard 链**：`protocol.py` `QueryPending` docstring 直引"续取路径（`check_query` → `attach()` → `_pending()`，不经 Guard 链）"。`attach` 是续取入口，直接调 provider.attach 返回三态。

### 1.5 registry seam 只暴露"取一个 executor"，pipeline 持有

`registry.py` `get_engine(name, scope_id) -> QueryEngine`（全文直引）：

```python
# registry.py get_engine
override = _OVERRIDES.get(key)
if override is not None:
    return override(scope_id)          # override 优先
...
engine: QueryEngine = _ENGINE_CLASSES[key].for_scope(scope_id)
return engine
```

`get_engine` **只返回一个 executor**，由调用方（`pipeline.run_query_async`）持有、钉进 `QueryContext(engine=executor)`、整链读 `ctx.engine`。**无独立 `getEngine`-without-scope 钩子**——`get_engine` 必收 `scope_id`（D4：scope 参与构造，国内/海外不同接入点），override 也收 `scope_id`（HARDENING-SPEC §5 修正）。

`get_engine` docstring 直引："override（`register_engine`）**优先于**内置构造：宿主注入的工厂自己知道怎么解析凭据…HARDENING-SPEC §5：override 现在**收到 `scope_id`**（旧签名无参，scope 不经注册表流动）"。

**确认默认值 B 的"不暴露 getEngine（A1-split 内部持 executor）"**：rbi 的 `registry.get_engine` 就是"取一个 executor"返回给 `pipeline.run_query_async` 持有；da 侧 A1-split 下 `ctx.query.execute` 内部取 executor 持有、链读它，consumer 不取 executor。与 rbi 一致。

### 1.6 3-state 构造点（executor.py）

`engines/maxcompute/executor.py` 全文确认 3-state 构造点（p4 笔记引 `_read_terminated`/`_pending`/`_failed`）：

- `_read_terminated(self, instance, sql, started) -> QueryOutcome`：instance 已终止 → 成功读行返 `QueryCompleted`（含 `ExecutionMeta`）/ 失败返 `QueryFailed`（含 `failure_kind`、收割场景 `timed_out=True`）
- `_pending(self, instance, started) -> QueryPending`：耐心阈值到期 → 交出句柄（`instance_id`/`engine_detail_url`/`elapsed_ms`/`stage`/`hint`/`cost_check`），**不取消**
- `_failed(self, error, sql, *, failure_kind, instance=None, timed_out=False) -> QueryFailed`：构造失败态（`parse_failed` 恒 False，`failure_kind` 必填）
- `_attach_failed(error, instance_id, *, failure_kind) -> QueryFailed`：attach 专用失败（`sql=""` 诚实，`instance_id` 用调用方给的）

字段与默认值 B 描述（3-state Completed/Pending/Failed）一致。

---

## §2. harness 包布局约定 + credentials 切分镜像（D 的源码依据）

### 2.1 包布局约定

根 `package.json`：`@deepseek-ai/dsh-root`，private，`workspaces: ["vendor/*", "packages/*/*", ...]`（两层嵌套 `packages/<group>/<pkg>`）。
`pnpm-workspace.yaml`：`packages/*/*` 确认两层嵌套。

**包名前缀 `@deepseek-ai/dsh-*`**（从 `dsh-credentials` / `dsh-credentials-local` / `dsh-tools` / `dsh-tool-bash` 等可见）。

### 2.2 credentials seam vs provider 切分

**seam 包** `packages/credentials/credentials/`（`@deepseek-ai/dsh-credentials`，package.json 直引 description："Abstract credential seam (ctx.credentials): settings carry references to secrets, providers own the values"）：

`src/index.ts` `CredentialProvider`（直引）：

```ts
// credentials/src/index.ts
export abstract class CredentialProvider extends Service {
  constructor(ctx: Context) { super(ctx, 'credentials') }
  abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>
  abstract describe(ref: CredentialRef): Promise<CredentialInfo>
  abstract set(ref: CredentialRef, value: string): Promise<void>
  abstract unset(ref: CredentialRef): Promise<void>
  protected notifyUpdated(ref: CredentialRef): void { ... }  // fan credentials/updated
}

declare module '@deepseek-ai/cordis' {
  interface Context { credentials: CredentialProvider }
}
```

`resolve` docstring 直引："Resolution is per call: consumers re-resolve at each operation and must not cache across operations — that per-operation read is what makes a changed credential reach the next operation without a restart"。peerDep `@deepseek-ai/cordis` + `dsh-brand` / `dsh-invariants`。**只声明契约，不实现。**

**provider 包** `packages/credentials/credentials-local/`（`@deepseek-ai/dsh-credentials-local`，description："File-backed credentials provider"）：

`src/index.ts` `LocalCredentialProvider`（直引）：

```ts
// credentials-local/src/index.ts
export class LocalCredentialProvider extends CredentialProvider {
  static Config: z<Config> = z.object({           // Schemastery Config
    path: z.string(), dshHome: z.string(),
    watch: z.boolean().default(true),
    debounceMs: z.number().min(0).default(100),
  })
  constructor(ctx: Context, public config: Config) { super(ctx) }
  async*[Service.init](): AsyncGenerator<...> { ... }  // Cordis Service 生命周期
  override resolve(ref): Promise<ResolvedCredential | undefined> { ... }
  ...
}
```

peerDep `dsh-credentials`（seam）+ `dsh-atomic-write` / `dsh-launch-environment` / `dsh-home-paths` / `dsh-invariants` / `cordis`；dep `chokidar` / `yaml` / `schemastery`。`reconcileFromDisk` + chokidar watcher 热发布外部编辑；`notifyUpdated(ref)` 在写入后 fan-out `credentials/updated`。

### 2.3 两种 Cordis plugin 形态

harness 并存两种 plugin 注册形态：

1. **Service class 形态**（credentials / credentials-local）：`class extends Service` + `static Config: z<...>`（Schemastery）+ `[Service.init]` async generator 生命周期。seam 是 abstract class，provider extends 它。
2. **apply function 形态**（mcp-client，`src/index.ts` 直引）：

```ts
// mcp-client/src/index.ts
export const name = 'mcp-client'
export const inject = ['tools']
export const Config = z.union([z.object({transport: z.const('stdio'), ...}), ...])
export async function apply(ctx: Context, config: Config): Promise<void> { ... }
```

`apply(ctx, config)` 内 `startConnection` + `ctx.effect(() => () => connection.dispose())` + `await connection.ready`。

### 2.4 defineTool 工具插件包惯例

`defineTool` 来自 `@deepseek-ai/dsh-tools`（`packages/core/tools/`，`src/schema.ts:545` `export function defineTool`）。工具插件是**独立包**，在 `packages/<group>/tool-<name>/` 下（grep `defineTool` in packages/ 确认）：

| 包 | 路径 | group |
|---|---|---|
| `@deepseek-ai/dsh-tool-bash` | `packages/shell/tool-bash/` | shell |
| `@deepseek-ai/dsh-tool-web` | `packages/web/tool-web/` | web |
| `@deepseek-ai/dsh-tool-skill` | `packages/skill/tool-skill/` | skill |
| `dsh-tool-terminal` / `dsh-tool-pwsh` / `dsh-tool-lsp` | `packages/terminal|shell|lsp/tool-*` | 各自 |

`tool-bash/package.json` peerDep `@deepseek-ai/dsh-tools` + `@deepseek-ai/cordis` 等。`ctx.tools.register(defineTool({...}))`。

**工具插件是独立包，不是 preset 内**（`tool-bash`/`tool-web`/`tool-skill` 各有 package.json + exports）。

### 2.5 三包切分镜像 credentials

默认值 D 的三包切分逐字镜像 credentials 的 seam/local-provider 切分：

| da 包 | 镜像 rbi | 镜像 harness | 形态 |
|---|---|---|---|
| `packages/query/query/` | `core/protocol.py`（QueryEngine 协议 + 3-state）+ `pipeline.py`（engine-wrapper 门 host）+ `registry.py`（seam） | `dsh-credentials`（seam） | Service class（abstract `QueryEngine` 协议 + `ctx.query` seam + engine-wrapper 门 in `execute`） |
| `packages/query/query-maxcompute/` | `engines/maxcompute/executor.py` + `connection.py`（dumb executor + per-scope 缓存） | `dsh-credentials-local`（provider） | provider：mcp-client sidecar 代理 + per-call `ctx.credentials.resolve` + `credentials/updated` 失效监听 |
| `packages/query/query-tool/` | `rbi_mcp/servers/execution.py`（`_query_data_impl` 会话门 consumer） | `dsh-tool-bash` 等（tool 插件） | tool-query consumer：`defineTool`，owns G1/G5/budget/near-dup/halt/cache/required_predicates |

**additive-only**：纯新增 `packages/query/` 下三包，不碰 core（harness core 在 `packages/core/`，credentials 切分是先例——seam + provider 两包叠加，core 不动）。确认。

---

## §3. 失效机制 rbi 双清 + mcp-client reconnect（E 的源码依据）

### 3.1 rbi 双清（credentials.py invalidate_credential）

`rbi-mcp/src/rbi_mcp/credentials.py` `invalidate_credential`（r2 笔记引 `:189-205`，本文读全文直引）：

```python
# credentials.py invalidate_credential
def invalidate_credential(scope_id: str) -> None:
    with _CACHE_LOCK:
        _CACHE.pop(scope_id, None)          # 清 rbi-mcp 凭据缓存（tier 0）
    try:
        from rbi_query.engines.maxcompute.connection import invalidate_scope_connection
        invalidate_scope_connection(scope_id)   # 清 rbi-query 连接缓存
    except Exception:
        logger.warning("rbi-query 侧连接缓存失效失败（scope=%s）", scope_id, exc_info=True)
```

docstring 直引："同时让 rbi-query 那侧的连接缓存失效 —— 只清这一半的话，下一次 `get_engine` 仍会复用已建好的 `ScopeConnection`（里面那个 `ODPS` 对象拿的是旧凭据），症状是「改了配置只有重启才生效」"。

### 3.2 rbi invalidate_scope_connection（connection.py，surgical）

`engines/maxcompute/connection.py` `invalidate_scope_connection`（r2 笔记引 `:332-335`，本文读全文直引）：

```python
# connection.py invalidate_scope_connection
def invalidate_scope_connection(scope_id: str) -> None:
    """丢弃该 scope 的连接缓存（配置热更后由 registry.invalidate 调用）。"""
    with _LOCK:
        _CONNECTIONS.pop(scope_id, None)
```

**surgical**：只丢该 scope 的 `ScopeConnection`（键 `scope_id`，`connection.py` `_CONNECTIONS: dict[str, ScopeConnection]`）。其他 scope 的连接缓存不受影响。

### 3.3 harness mcp-client reconnect 语义

`packages/mcp/mcp-client/src/connection.ts:28` `export interface ReconnectConfig`（grep 确认行号）：`enabled` / `initialDelayMs` / `maxDelayMs` / `maxAttempts`。`RECONNECT_DEFAULTS`（`:40`）：`enabled=true, initialDelayMs=500, maxDelayMs=30000, maxAttempts=10`。

`connection.ts` `startConnection`（`:115` 附近）+ `connectGeneration`（`:200` 附近）：

- **reconnect = `connectGeneration`**：`new Client(...)` + `createTransport(config)` + `generation.connect(...)` + `enqueueSync(generation)`（重新 syncTools 注册工具）。**每次 reconnect 新建 Client + 新 transport + 重连 sidecar 子进程。**
- **`dispose()`**（`:245` 附近）：`disposed=true` + 清 reconnectTimer + `current.close()` + `await settling` + `await syncChain` + `for (const dispose of disposers.values()) dispose()`（**unregister 所有工具**）。

`connection.ts` 模块 docstring（`:1`）直引："when the connection drops — restarts the configured server with bounded exponential backoff…Exhaustion unregisters the server's tools and stops; disposal (including HMR) is the only way back from that state"。

### 3.4 重启 sidecar 丢所有 scope 缓存 vs invalidate_scope surgical

**重启 sidecar 子进程 = sidecar 进程内 `_CONNECTIONS`（镜像 rbi `connection.py` 的 per-scope ODPS 连接缓存）全丢**。理由：sidecar 是独立子进程，其进程内存（`_CONNECTIONS` dict、`ODPS` 对象、`ScopeConnection`）随进程终止而消失。reconnect 起新 sidecar 子进程 = 空缓存起步，**所有 scope 的连接都要重新解析 + 重新构造 ODPS 对象**。

**`invalidate_scope` MCP 工具**（sidecar 暴露）= sidecar 内部调 `invalidate_scope_connection(scope_id)`，**只丢该 scope 的连接缓存**，其他 scope 复用既有连接。

### 3.5 R2 §5.2d 已述两种失效路径

R2 笔记 §5.2d 直引："失效钩子：da 侧监听 `credentials/updated` 事件 → 调 sidecar 暴露的 `invalidate_scope` 工具 **或** 重启 sidecar 进程（mcp-client `connection.ts` dispose+reconnect 已支持）"。

默认值 E 选 `invalidate_scope` 工具（surgical），不重启 sidecar。**确认更优**：
- `invalidate_scope` 工具 surgical（只丢该 scope），与 rbi `invalidate_scope_connection` 语义逐字一致。
- 重启 sidecar 过广（丢所有 scope 缓存，其他 scope 的在途查询受影响——`ODPS` 对象重建 + 重新握手）。
- reconnect 留作 sidecar 崩溃/不可达场景的兜底（不是凭证更新的常规失效路径）。

---

## §4. fake.py stub 模板 + /prototype 规则（F 的源码依据）

### 4.1 rbi FakeExecutor（可镜像 stub 模板）

`engines/maxcompute/fake.py` `FakeExecutor`（全文直引）。模块 docstring："满足新 `QueryEngine` 契约的测试替身…单独成文件…它是**测试基础设施**，与生产 executor 的变更理由完全不同"。

构造（`fake.py` `__init__`）：

```python
class FakeExecutor:
    def __init__(self, *, outcome=None, columns=None, rows=None, cost=None,
                 cost_unavailable=None, cost_raises=None, delay=0.0,
                 capabilities=None, cancel_result=None, name="maxcompute"):
        ...
        self.execute_calls: list[str] = []
        self.estimate_cost_calls: list[str] = []
        self.cancel_calls: int = 0
        self.canceller_requests: list[str] = []
```

方法表面（与 `OdpsExecutor` 一致，fake.py docstring："替身与真身的表面必须一致，否则测试测不到真实路径"）：

- `async execute(sql, *, database=None) -> QueryOutcome`：按 cue 返回（`outcome=` 或默认 `QueryCompleted`）
- `async estimate_cost(sql) -> CostEstimate | CostUnavailable`：按 `cost=`/`cost_unavailable=`/`cost_raises=` 返回
- `async cancel() -> CancelResult`
- `def canceller_for(instance_id) -> CancelFn | None`（fake.py docstring："声明 `cancel=SUPPORTED` 就必须有它"）
- `async get_progress() -> ProgressReport`
- `def health_check() -> bool`
- `capabilities` 可注入（默认 maxcompute 六维全 `SUPPORTED`）

**FakeExecutor 是 in-process Python 替身**：不起子进程、不经 mcp-client/stdio、不经 MCP 协议。da 侧若镜像它做 in-process fake，`ctx.query.execute` 直接调 FakeExecutor 对象。

### 4.2 /prototype 规则支持 stub sidecar

/prototype skill 规则（任务述）：throwaway、无持久化、one-command、无需基建。**stub sidecar 而非真 ODPS** 符合"无需基建"——不依赖真 ODPS 服务/真 DB/真配置中心。这一条无需读源确认（/prototype 规则就是不要基建）。

### 4.3 da 侧 stub 形态判断（in-process fake vs fake MCP server 子进程）

默认值 F 倾向 in-process fake（更 throwaway）。父 agent 同样倾向前者。但需判断：**mcp-client 的 `StdioConfig.env` 凭证注入这条 flow 要不要在原型里真演示？**

`mcp-client/src/index.ts:50` `export interface StdioConfig`（grep 确认行号），`env: Record<string, string>` 字段 docstring 直引："Extra env vars merged on top of scrubbed ambient env"。R2 §5.2c 定"凭证经 `StdioConfig.env` 注入 sidecar 子进程（合并 over scrubbed ambient）…不要把 `access_key` 放进工具 args"。

**这条 flow 只在有 sidecar 子进程时才演示得到**：
- in-process fake：da 进程内直接持 FakeExecutor，`ctx.query.execute` 直调它。**没有子进程、没有 stdio、没有 `StdioConfig.env` 注入、没有 MCP 工具注册、没有 reconnect 语义**。R2 §5.2c 的凭证注入 flow 演示不到。
- fake MCP server 子进程经 mcp-client 连：起一个 fake MCP server（用 `@modelcontextprotocol/sdk` 的 server + stdio transport），da 侧 mcp-client `StdioConfig` 连它。**真演示**：per-call `ctx.credentials.resolve` → `StdioConfig.env` 注入子进程 → sidecar 从 env 读凭证 → sidecar 暴露 `invalidate_scope` 工具 → da 监听 `credentials/updated` 调它。

**INFERENCE 判断：原型该用 fake MCP server 子进程经 mcp-client 连（而非纯 in-process fake）。** 理由：
1. R2 §5.2c 是 resolved 决策（凭证经 stdio env 注入 sidecar 子进程），原型若不演示这条 flow 等于不验证 R2 接线可行性——R2 的"per-call resolve + stdio env + sidecar per-scope 缓存 + credentials/updated 失效"是一条完整 flow，in-process fake 把它整个跳过。
2. map ⑤a 定"MaxCompute Provider 外置 sidecar（rbi-mcp）"——外置边界经 mcp-client，原型应演示这个边界（经 mcp-client 的 stdio transport + 工具注册 + reconnect）。
3. E 项的失效机制（监听 `credentials/updated` → 调 sidecar `invalidate_scope` 工具）也只在有 sidecar 子进程时才演示得到（in-process fake 直接调函数，没有"调 MCP 工具"这层）。
4. fake MCP server 子进程是 in-repo 的 throwaway 基建（一个 fake `server.ts` + stdio transport），**不依赖真 ODPS/真 DB**，符合 /prototype"无需基建"。

**但这与"更 throwaway"有张力，需用户裁定**：若原型严格只演示 guard 链 shape（A1-split 分层 + 三-execute + per-query executor + 3-state），in-process fake 可接受（这四项都是 da 进程内的，in-process fake 都能演示）；代价是 R2 接线 flow（stdio env 注入 + invalidate_scope 工具失效）不验证，留到后续 ticket。若原型目标是"验证 P4 整体 shape/flow 可行性"（含 R2 接线），则需 fake MCP server 子进程。

**修正建议**：fake MCP server 子进程经 mcp-client 连。fake server 用 `@modelcontextprotocol/sdk` server 实现 `execute/attach/cancel/get_progress/estimate_cost/invalidate_scope` 工具（内部用 FakeExecutor 逻辑按 cue 返回 3-state），da 侧 mcp-client `StdioConfig` 连它，per-call resolve 注入 env。这比 in-process fake 多一个 fake server 文件 + stdio transport，但仍 throwaway（无外部依赖、无持久化）。

---

## §5. gate 集 load-bearing 清单（G 的源码依据）

### 5.1 三-execute 模式是承重结构（确认）

`execution.py` 三处（grep 确认行号，p4 笔记直引准确）：

- `execution.py:790` `gate_reject = await quality_gate.pre_sampling_gate(sql, query_engine, session_id)`（**G1 前置采样门**，rbi-mcp 层，实现在 `rbi_mcp/quality_gate.py`）
- `execution.py:798` `count_clarify = await limit_gate.count_estimate_gate(sql, query_engine, session_id)`（**G5 COUNT 门**，rbi-mcp 层，实现在 `rbi_mcp/limit_gate.py`）
- `execution.py:823` `outcome: QueryOutcome = await run_query_async(sql, query_engine, scope_id=scope_id, ...)`（**主查询委派 rbi-query**，p4 笔记直引）

交叉印证（executor.py + registry.py docstring）：

- `executor.py` `canceller_for` docstring 直引："`execution.query_data` 体内**只构造一次** engine，却依次跑 G1 采样门 / G5 COUNT 门 / 主查询 —— **一次 `query_data` 最多 3 次 `execute()` 打在同一个 executor 上**，每次覆写 `self._instance`"。
- `registry.py` `get_engine` docstring 直引："`rbi_mcp.servers.execution.query_data` 体内**只调本函数一次**，然后在同一个 executor 上依次跑 **三次** `execute()`：1. G1 前置采样门 2. G5 明细行数预估门 3. 主查询"。

G1/G5 自己**内部调 `run_query_async`** 跑探针（`execution.py:786` 注释 "pre_sampling_gate 现在原生…内部走 run_query_async"；`:797` "count_estimate_gate 同样已 async-only 化，内部走 run_query_async"）。

**三-execute 是 A1-split 分层的承重结构**：G1/G5 在 tool-query 会话门层（调 `ctx.query.execute` 跑探针），主查询在 engine-wrapper 层（`ctx.query.execute` 跑 guard 链 + 委派 provider）。da 侧 tool-query 调 `ctx.query.execute` 三次（G1 探针 / G5 COUNT / 主查询），每次内部取独立 per-query executor——**反而优于 rbi 的"三 execute 共一 executor"**（da 侧每个 `ctx.query.execute` 只服务一条 query，`self._instance` 不被覆写，`canceller_for` 纪律更简单，无 rbi 的四重后果风险）。

### 5.2 必演示 vs 可省清单

**必演示（load-bearing，不演示看不出 shape）**：

1. **cost 门**（engine-wrapper 层代表）—— 演示 `estimate_cost` 调 provider + per-query executor 同实例（cost 门与主查询打同一 executor，镜像 `cost.py` `CostGuard._estimate` 的 `ctx.engine.estimate_cost`）。这是 A1-split 的 engine-wrapper 链核心纪律。
2. **timeout 门 + 3-state**（engine-wrapper 层）—— 演示 patience→Pending 交接 + `QueryPending`/`QueryCompleted`/`QueryFailed` 三态（镜像 `timeout.py` `TimeoutGuard` + `executor.py` `_pending`/`_read_terminated`）。3-state 是 da seam 的核心类型，不演示 Pending 交接看不出 seam 形态。
3. **G5 COUNT 门 + 三-execute**（会话门层代表）—— 演示 tool-query 调 `ctx.query.execute` 三次（G5 COUNT 探针 + 主查询，G1 可选）。三-execute 是 A1-split 分层的承重结构，不演示看不出"会话门探针 vs engine-wrapper 主查询"的分层。

**可省（shape 简单或非承重，用最简 stub 或省）**：

- **retry 门** —— `call_next` 重试，shape 简单（不像 cost/timeout 有远程调用/状态）。最简 stub。
- **orphan 收割** —— 异步收割循环（`core/orphans.py` `record_orphan`），原型不演示收割循环也能看 guard 链 shape。
- **G1 采样门** —— 与 G5 同层同形（探针门，内部调 `run_query_async` 跑探针），演示 G5 即可见三-execute shape，G1 可省或作 bonus。
- **select_only / ambiguity / required_predicates / ADR**（安全类门）—— shape 同 cost（链上检查后 `call_next`），可最简 stub 或省。其中 `required_predicates` 组装留 tool-query（p4 笔记 §4.2：D11 ④ required_predicates 是 MCP/会话级职责），但门**检查**在 engine-wrapper——原型可用最简 stub 演示"检查后 call_next"形态。

---

## §6. 逐项结论表

| 项 | 默认值 | 结论 | 一句话理由（file:line 依据） |
|---|---|---|---|
| **B** | `ctx.query` 暴露 `execute/attach/cancel/get_progress` + 3-state；`estimate_cost` 不进 seam；不暴露 `getEngine` | **确认**（带澄清） | rbi `QueryEngine` Protocol（`protocol.py:521`）= `execute/estimate_cost/cancel/get_progress/health_check` + `name/capabilities`，**无 `attach`**（attach 在 `executor.py:316`、经 `registry._DIMENSION_METHODS` 对账但不进 Protocol 签名）；da seam 暴露 `attach` 是续取入口的合理增补（镜像 rbi `check_query→attach`，续取不经 guard 链）；`estimate_cost` 确为 CostGuard 内部调（`cost.py` `CostGuard._estimate` 的 `ctx.engine.estimate_cost`）；`getEngine` 确不暴露（`registry.get_engine` 只返回 executor 给 pipeline 持有）。**澄清**：默认值未提 `health_check`（rbi Protocol 有，da seam 可选不暴露给 consumer，留管理面）。 |
| **D** | `packages/query/{query,query-maxcompute,query-tool}` 镜像 credentials 切分 | **确认** | harness 包布局 `@deepseek-ai/dsh-*` + `packages/<group>/<pkg>`（根 package.json + pnpm-workspace.yaml）；credentials seam（`dsh-credentials`，abstract `CredentialProvider extends Service`）vs provider（`dsh-credentials-local`，`LocalCredentialProvider extends CredentialProvider` + `static Config: z<Config>` + `[Service.init]`）切分逐字镜像；tool 插件是独立包（`dsh-tool-bash` 等，`ctx.tools.register(defineTool({...}))`）；三包切分 additive-only（纯新增，不碰 core）。 |
| **E** | 监听 `credentials/updated` → 调 sidecar `invalidate_scope` 工具，不重启 sidecar | **确认** | rbi `invalidate_scope_connection`（`connection.py` 末尾）= `_CONNECTIONS.pop(scope_id)` surgical；`invalidate_credential`（`credentials.py`）双清（`_CACHE.pop` + `invalidate_scope_connection`）；mcp-client reconnect（`connection.ts:28` `ReconnectConfig` + `connectGeneration`）重启 sidecar 子进程 = sidecar 进程内 `_CONNECTIONS` 全丢（过广）；`invalidate_scope` 工具 surgical，reconnect 留作 sidecar 崩溃兜底。 |
| **F** | stub sidecar（镜像 `fake.py`），原型问 shape/flow 非连通性 | **修正**：倾向 fake MCP server 子进程经 mcp-client 连 | rbi `FakeExecutor`（`fake.py`）是可镜像 stub 模板（`execute/estimate_cost/cancel/canceller_for/get_progress/health_check` + 按 cue 返回 3-state），但它是 **in-process Python 替身**，不起子进程、不经 mcp-client/stdio；R2 §5.2c 定凭证经 `StdioConfig.env`（`index.ts:50`）注入 sidecar 子进程是 resolved 决策，in-process fake 演示不了这条 flow；map ⑤a 定外置 sidecar 边界需经 mcp-client。**但属权衡**：若原型只演示 guard 链 shape（A1-split + 三-execute + per-query + 3-state），in-process fake 可接受，代价是 R2 接线 flow 不验证——需用户裁定。 |
| **G** | engine-wrapper 门 in `ctx.query.execute`，会话门 in tool-query，三-execute 必演示 | **确认** | 三-execute 承重：`execution.py:790`（G1）/`:798`（G5）/`:823`（主查询）+ `executor.py` `canceller_for` docstring + `registry.py` `get_engine` docstring 三处印证"一次 query_data 最多 3 次 execute"；必演示 cost 门（per-query executor 同实例）+ timeout 门（3-state Pending 交接）+ G5 COUNT 门（三-execute）；retry/orphan/G1/安全类（select_only/ambiguity/required_predicates/ADR）可省或最简 stub。 |

---

## §7. 关键路径索引

**rbi QueryEngine 协议 + 3-state 类型（B）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/core/protocol.py`（`:521` `class QueryEngine(Protocol)`、`:400` `type QueryOutcome`、`QueryCompleted`/`QueryPending`/`QueryFailed`/`ExecutionMeta`/`CancelResult`/`CostEstimate`/`CostUnavailable`/`ProgressReport`、E 节 `:518`）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/core/guards/_outcomes.py`（`reject`/`parse_rejection` 拒绝出口构造器）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/core/guards/cost.py`（`CostGuard` 类 priority=20、`CostGuard._estimate` 的 `ctx.engine.estimate_cost` 调用点）

**rbi OdpsExecutor + 3-state 构造点（B）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/executor.py`（`:316` `async def attach`、`execute`/`estimate_cost`/`cancel`/`canceller_for`/`get_progress`/`health_check`、`_read_terminated`/`_pending`/`_failed`/`_attach_failed` 构造点、`for_scope` per-query）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/fake.py`（`FakeExecutor` stub 模板，F 项）

**rbi registry seam + 能力矩阵（B）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/registry.py`（`get_engine(name, scope_id)` 优先 override、`_DIMENSION_METHODS` `async_handle→attach`/`cancel→canceller_for`、`EngineClass` Protocol `for_scope`/`invalidate_scope`、`verify_capability_claims` 启动期对账）

**rbi 失效机制（E）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`（`invalidate_scope_connection` = `_CONNECTIONS.pop(scope_id)` surgical、`get_scope_connection`、`resolve_connection` 三级、`ScopeConnection.acquire` 记忆化含失败）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py`（`invalidate_credential` 双清、`resolve_for_scope` TTL 300s、`install_credential_resolver` tier 0）

**rbi 三-execute（G）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/servers/execution.py`（`:790` `pre_sampling_gate` G1、`:798` `count_estimate_gate` G5、`:823` `run_query_async` 主查询、`:3` 模块 docstring 分层断言"决定查什么归本层，照单检查归 rbi-query"）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/quality_gate.py`（G1 实现）、`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/limit_gate.py`（G5 实现）

**harness 包布局 + credentials 切分（D）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/package.json`（`@deepseek-ai/dsh-root`、workspaces `packages/*/*`）
- `/Users/mckenzie/workspace/deepseek-harness-da/pnpm-workspace.yaml`（`packages/*/*` 两层嵌套）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/index.ts`（`CredentialProvider extends Service` seam、`resolve` per-call、`notifyUpdated` fan `credentials/updated`）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/package.json`（`@deepseek-ai/dsh-credentials`）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials-local/src/index.ts`（`LocalCredentialProvider extends CredentialProvider`、`static Config: z<Config>`、`[Service.init]` 生命周期、`reconcileFromDisk` watcher）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials-local/package.json`（`@deepseek-ai/dsh-credentials-local`，peerDep seam）

**harness mcp-client（E + F）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/index.ts`（`:50` `interface StdioConfig`、`env` 字段"Extra env vars merged on top of scrubbed ambient env"、`apply(ctx, config)`、`inject=['tools']`、`Config = z.union([...])` Schemastery）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/connection.ts`（`:28` `interface ReconnectConfig`、`startConnection`、`connectGeneration` 重启 sidecar、`dispose` unregister 所有工具）

**harness tool 插件惯例（D）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/shell/tool-bash/package.json`（`@deepseek-ai/dsh-tool-bash` 独立包、peerDep `dsh-tools`+cordis）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/core/tools/`（`defineTool` 来自 `@deepseek-ai/dsh-tools`、`src/schema.ts:545`）

**P4 背景笔记 + ticket**：
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p4-guard-chain-placement.md`（A1-split 决策依据、§1 rbi guard 链两层分层、§4 A1-split 推荐与 G1/G5 留 tool-query 修正）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/r2-maxcompute-cred-cache.md`（凭证缓存设计、§5.2 sidecar 凭证处理推荐、§5.2d 失效钩子"invalidate_scope 工具 或 重启 sidecar"）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/tickets/phase-2/P4-query-engine.md`（prototype ticket、per-call resolve + scope_id 显式 + stdio env + sidecar per-scope 缓存 + 监听 credentials/updated）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/map.md`（⑤a rbi-mcp 查询引擎混合决策、Not-yet-specified 雾区"3-state QueryOutcome / 服务端 cancel / per-query executor"）
