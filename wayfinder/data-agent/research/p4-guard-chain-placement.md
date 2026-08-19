# P4 — Guard chain 放在 da 哪一层：A1 / A2 / A3 对照

wayfinder ticket P4 · 中文报告 · 主源：reverse-bi `execution.py` / `pipeline.py` / `core/guards/*` + harness credentials/mcp-client seam。
所有 `path:line` 为绝对路径或仓库内相对路径。INFERENCE 标注的是非源文直引的推断。

---

## 1. rbi-mcp 真实 guard 编排：guard 链**分两层**，不是一层

这是本次调研最硬、父 agent 此前**未读到**的发现：rbi 的 guard 链**不在同一层**。
G1 采样门 / G5 COUNT 门在 **rbi-mcp 的 MCP orchestrator**（`execution.py`）里，
cost / timeout / retry / orphan 在 **rbi-query 的 engine-wrapper**（`pipeline.py:run_query_async` + `core/guards/*`）里。
"决定查什么"归 orchestrator，"照单检查"归 engine-wrapper——这是 `execution.py` 模块 docstring 自己写的分层断言。

### 1.1 orchestrator 层（rbi-mcp `execution.py`）拥有什么门

`execution.py:3` 模块 docstring 直引：

> rbi-mcp 薄壳：查询执行委托 rbi-query（Guard 链 + 引擎），本模块保留 MCP/会话级
> 职责——halt 检查、SQL 预算、近重复检测、fingerprint gate、G3 LIMIT 门、G5 行数
> 预估门、查询缓存（key 含 engine）、G1 采样门、G8 hh-between 告知、D6 引用传递，
> 外加 D11 ④ 的 ``required_predicates`` 组装（"决定查什么"归本层，"照单检查"归 rbi-query）。

`_query_data_impl` 体内逐门落地（同一函数、同一 `query_engine` 对象依次跑过）：

- `execution.py:790` —— `gate_reject = await quality_gate.pre_sampling_gate(sql, query_engine, session_id)`（**G1 前置采样门**，实现在 `rbi-mcp/src/rbi_mcp/quality_gate.py:72`，**在 rbi-mcp 不在 rbi-query**）
- `execution.py:798` —— `count_clarify = await limit_gate.count_estimate_gate(sql, query_engine, session_id)`（**G5 明细行数预估门**，实现在 `rbi-mcp/src/rbi_mcp/limit_gate.py:55`，**同样在 rbi-mcp**）
- `execution.py:823` —— `outcome: QueryOutcome = await run_query_async(sql, query_engine, scope_id=scope_id, ...)`（**主查询委派 rbi-query**，传的是**已解析的 engine 对象**不是名）

G1 / G5 自己**内部调 `run_query_async`** 跑探针（`quality_gate.py` / `limit_gate.py` 注释明写"内部走 run_query_async"）。也就是说 orchestrator 层的门是"会调 engine-wrapper 的探针门"——它住 MCP 层（需要 session_id / executed_sqls / cache key），但借 engine-wrapper 跑探针。

### 1.2 engine-wrapper 层（rbi-query `pipeline.py` + `core/guards/*`）拥有什么门

`pipeline.py:169` `run_query_async` 是 rbi-query 的唯一正式入口，体内：

- `pipeline.py:56` —— `from rbi_query.core.guards import build_chain`
- `pipeline.py:232` —— `chain = build_chain(executor.capabilities, guard_config, is_ambiguous_fn=..., progress_cb=...)`（按能力矩阵 + 三级配置**组装**链，注入式）
- `pipeline.py:261` —— `return await chain.run_async(ctx)`（链在 `ctx.engine` 上跑）
- 函数体先 `executor = get_engine(engine, scope_id) if isinstance(engine, str) else engine`（取/持**一个** executor），再 `ctx = QueryContext(sql=sql, engine=executor, scope_id=scope_id, timeout=..., ...)`（把 executor 钉进 `ctx.engine`）

链上各门**实现在 `core/guards/`（引擎无关），不在 `engines/maxcompute/`**：

| 门 | 类/函数 | 位置 | priority | 调 executor 的方式 |
|---|---|---|---|---|
| CostGuard | `class CostGuard` | `core/guards/cost.py:163` | 20 | `cost.py:278` `await asyncio.wait_for(ctx.engine.estimate_cost(ctx.sql), timeout=bound)` |
| RetryGuard | `class RetryGuard` | `core/guards/retry.py:157` | 30 | 经 `call_next` 重试 `execute` |
| TimeoutGuard | `class TimeoutGuard` | `core/guards/timeout.py:117` | 40 | `timeout.py:217` `cast("_JobBoundCancellable", ctx.engine).canceller_for(pending.instance_id)` + `await ctx.engine.cancel()` + `ctx.engine.get_progress()` |
| orphans 收割 | `def record_orphan` | `core/orphans.py:252` | — | 登记的 `CancelFn`（由 `canceller_for` 交出） |
| 链组装 | `def build_chain` | `core/guards/__init__.py:94` | — | 按能力矩阵注入 |

链序（`cost.py` 模块 docstring）：`SelectOnly(0) → Ambiguity(5) → RequiredPredicate(10) → ADR(15) → Cost(20) → Retry(30) → Timeout(40) → execute`。priority 越小越靠外，TimeoutGuard 在最内层（`wait_for` 只包 `execute`），CostGuard 在 TimeoutGuard 外层（`estimate_cost` 不受 `ctx.timeout` 覆盖，故自套 `wait_for` 并从 `ctx.timeout` 扣减，`cost.py:278`）。

**关键结构性事实**：guard 链在 `core/guards`（引擎无关），executor 在 `engines/maxcompute/executor.py`（dumb raw `execute/attach/cancel/get_progress/estimate_cost` + per-scope 连接缓存）。rbi **刻意把 guard 抽出引擎模块**——cost/timeout/retry/orphan 对 mysql/hologres 同样适用，不写进 `engines/maxcompute`。

### 1.3 per-query executor + canceller_for 纪律回顾

- `executor.py` `for_scope` classmethod（`@classmethod for_scope`）：**连接按 scope 缓存，executor 每次新建**。docstring 直引："SPEC §5.4 缓存的是 engine 对象…**这里有意不那么做**…`cancel()` / `get_progress()` 都**无参**，语义是「取消/查看**我当前这个**作业」，executor 因此天然持有 per-query 状态…共享 executor 会让第二条查询覆盖第一条的 instance，**取消掉别人的作业**"。
- `registry.py:get_engine`：`override = _OVERRIDES.get(key); if override is not None: return override(scope_id)`（override 优先），但同样"缓存的是连接不是 executor"。
- `executor.py:556` `def canceller_for`：docstring 直引"一次 `query_data` 体内**只调本函数一次**…依次跑 G1 采样门 / G5 COUNT 门 / 主查询 —— **一次 `query_data` 最多 3 次 `execute()` 打在同一个 executor 上**，每次覆写 `self._instance`…登记 `self.cancel` 这个 bound method 是错的…改用 `canceller_for`，由 executor 闭包捕获登记时刻的 instance 对象"。
- 纪律的硬核：**同一条 query 的 cost 门（`estimate_cost`）+ 主查询（`execute`）+ 延迟取消（`canceller_for`）必须打在同一个 executor 实例上**，否则 `self._instance` 被覆写后收割者停错作业。rbi 通过 `pipeline.run_query_async` 取**一个** executor 钉进 `ctx.engine`、整条链读 `ctx.engine` 来保证。

---

## 2. 三方案定义

（per 父 agent P4 ticket 草图）

- **A1**：`ctx.query.execute` 自己拥有 guard pipeline。seam 取到 provider（per-query executor）→ 跑**注入式可插拔** guard 链 → 委派 `provider.execute`。provider 是 dumb raw executor（只 `execute/attach/cancel/get_progress/estimate_cost` + sidecar 自有 per-scope 缓存）。
- **A2**：guard 烤进 query-maxcompute provider（provider 包住 sidecar 调用做 guard）。
- **A3**：`ctx.query` 保持 thin seam（镜像 harness `ctx.credentials` 的薄抽象，无编排），guard 是独立 in-process 组件包在 `ctx.query.execute` 外面。

---

## 3. 三方案 × 八维度 pros/cons 对照

### 3.1 对照表

| 维度 | A1（guard in `ctx.query.execute`） | A2（guard 烤进 provider） | A3（thin `ctx.query` + 独立 guard 组件） |
|---|---|---|---|
| rbi 保真度 | **中**：镜像"guard 引擎无关 + executor dumb"，但**合并** rbi 的 seam(registry) + guard host(pipeline) 为一层；G1/G5 若也放此层则**不镜像** rbi 的 orchestrator/engine-wrapper 分层 | **最低**：rbi 把 guard 抽进 `core/guards`（引擎无关），A2 把 guard 塞进 maxcompute provider（引擎专属）——**反向** | **高**：thin `ctx.query`≈registry seam，独立 guard 组件≈pipeline+core/guards，tool-query≈execution.py，**四层对四层**逐字镜像 |
| additive-only / 新增包 | **最少**：guard 在 `ctx.query` 内，无独立 guard 包 | **最少**（同 A1）：guard 在 provider 包内 | **多一个**：thin seam + provider + tool-query **+ 独立 guard 组件包** |
| 可插拔性 (a)引擎 (b)gate | (a) provider 可换、seam 引擎无关 ✓ (b) 注入式链 ✓ —— **两件都干净** | (a) **每加一引擎须重写 guard** ✗ (b) 换 gate 须改每个 provider ✗ —— **两件都脏** | (a) guard 组件包 thin seam，引擎无关 ✓ (b) guard 独立，gate 可插拔 ✓ —— **两件都干净** |
| per-query executor + canceller_for | **天然成立**：`ctx.query.execute` 取一个 per-query executor、钉进链上下文、整链读它（镜像 `pipeline.py` 的 `ctx.engine`） | **要靠 provider 实现自律**：每引擎 provider 各自正确实现"同 executor 跨 cost+main"，易错且跨引擎重复 | **成立但要 API**：guard 组件须从 thin `ctx.query` 取**一个** executor 持有（需 `ctx.query` 暴露 `getEngine` 而非只 `execute`），否则两次 `execute` 调用各取新 executor → 破坏纪律 |
| 凭证流正确性 | **一处 owns**：`ctx.query.execute` 内 per-call resolve + stdio env 注入 + 监听 `credentials/updated`，单点接线 | provider owns（provider 即 mcp-client host 侧）——单点但**耦合 maxcompute** | **有张力**：thin `ctx.query` 不 owns 编排，per-call resolve + sidecar env 注入须落在 guard 组件或独立 wiring，多一层协调 |
| sidecar dumb 度 | ✓ guard 在 da 进程内，sidecar dumb | ✓（若 provider 是 da 侧 wrapper）；但 guard 耦合引擎 | ✓ guard 在独立组件，sidecar dumb |
| prototype 适配 | **最干净**：单函数（取 provider → 跑链 → 委派）可被 throwaway 终端原型直接演示 | 可演示但 guard 与 sidecar 调用纠缠 | **两件套**（thin seam + guard 组件），原型多一个拼装步骤 |
| 耦合 / 可逆性 | **中**：guard 在 `ctx.query.execute`，日后搬出 = 瘦身 seam | **最高成本**：guard 烤进 provider，搬出 = 拆 provider、与 sidecar 调用解缠 | **最低**：guard 已是独立组件，搬动近乎零成本 |

### 3.2 逐维度论证

**(a) rbi 保真度——这是父 agent 未读 `execution.py` 前无法判的维度**

§1 已证：rbi 把 guard 链**分两层**。G1 / G5 在 `execution.py:790,798`（orchestrator，rbi-mcp），cost/timeout/retry/orphan 在 `pipeline.py:169` + `core/guards/*`（engine-wrapper，rbi-query）。两者**不同模块、不同包**。

- **A2 与 rbi 反向**：rbi 刻意把 guard 抽进 `core/guards`（`cost.py`/`timeout.py`/`retry.py`/`orphans.py` 全在 `core/`，**不在 `engines/maxcompute/`**），让它们对 mysql/hologres 同样适用。A2 把 guard 塞进 `query-maxcompute` provider = 引擎专属，**逐字违反**这条已落地的分层。`cost.py` 模块 docstring 的链序表把 `CostGuard` 写成引擎无关、按 priority 排序的链上一节——A2 会让"加 mysql 引擎"时复制整份 guard。
- **A1 部分镜像**：A1 的"guard in `ctx.query.execute`、provider dumb"镜像了"guard 引擎无关 + executor dumb"这半；但 `ctx.query` 同时是 seam **和** guard host，合并了 rbi 的 `registry.py`（seam，`get_engine`）与 `pipeline.py`（guard host，`run_query_async`）两层。若 A1 把 G1/G5 也放进 `ctx.query.execute`，则进一步**不镜像** rbi（rbi 的 G1/G5 在 orchestrator 不在 engine-wrapper）。
- **A3 最镜像**：thin `ctx.query`（≈`registry.get_engine`）+ 独立 guard 组件（≈`pipeline.run_query_async`+`core/guards`）+ tool-query（≈`execution.query_data`）+ provider/sidecar（≈`OdpsExecutor`+`connection.py`）——**rbi 的四层对 da 的四层**。INFERENCE：若 guard 组件只 owns engine-wrapper 门（cost/timeout/retry/orphan），G1/G5 留 tool-query，则 A3 逐字镜像 rbi 的分层。

**(b) additive-only**：A1 / A2 不新增 guard 包（guard 各自住 seam / provider 内）；A3 多一个独立 guard 组件包。对 additive-only 硬规则，A1 / A2 更省。

**(c) 可插拔性**：rbi 的 `build_chain`（`core/guards/__init__.py:94`）按 `executor.capabilities` + `guard_config` **注入**组装链——这本身是可插拔设计。A1 的"注入式可插拔 guard 链"直接镜像 `build_chain`。A3 的独立组件同样可插拔。A2 把 guard 绑死在 maxcompute provider，**每加一引擎重写一份 guard**——与 rbi 的引擎无关 `core/guards` 正面冲突。

**(d) per-query executor + canceller_for**：§1.3 已述纪律的硬核是"cost 门 + 主查询 + 延迟取消绑同一个 executor 实例"。rbi 靠 `pipeline.run_query_async` 取一个 executor 钉进 `ctx.engine`、整链读 `ctx.engine`（`cost.py:278` 读 `ctx.engine.estimate_cost`、`timeout.py:217` 读 `ctx.engine.canceller_for`）。A1 天然成立（`ctx.query.execute` owns 取 executor + 持有 + 链读它）。A3 也能成立，但前提是 thin `ctx.query` 须暴露 `getEngine(scope_id, engine)` 让 guard 组件**取一次、持有、跨 cost+main 复用**——若 `ctx.query` 只暴露无状态 `execute(sql)`，guard 组件两次调用各取新 executor，cost 门与主查询落不同实例，**纪律破坏**。INFERENCE：A3 的 `ctx.query` API 形态决定此维度成败。

**(e) 凭证流**：R2 已定 per-call `ctx.credentials.resolve(ref)` + stdio env 注入 + 监听 `credentials/updated`→失效 sidecar。A1 一处 owns（`ctx.query.execute` 内全套）。A2 provider owns（provider 即 mcp-client host 侧，但耦合 maxcompute）。A3 有张力：thin `ctx.query` 不 owns 编排，per-call resolve + env 注入 + 失效监听须落在 guard 组件或独立 wiring 层——多一层协调，但不破坏正确性。INFERENCE：`StdioConfig.env`（`mcp-client/src/index.ts` `StdioConfig`，"Extra env vars merged on top of scrubbed ambient env"）在子进程 spawn 时定，per-call 轮换靠重启 sidecar 或 sidecar 暴露 `invalidate_scope` 工具（R2 §5.2d 已述），与 guard 放哪层无关。

**(f) sidecar dumb**：三方案都能保 sidecar dumb（guard 都在 da 进程内）。A2 的风险不在 dumb 度，在耦合。

**(g) prototype 适配**：A1 最干净——单函数 `ctx.query.execute` 可被 `/prototype` LOGIC 分支直接演示。A3 两件套（thin seam + guard 组件）多一步拼装。A2 guard 与 sidecar 调用纠缠。

**(h) 可逆性**：A3 最低成本（guard 已独立）。A1 中等（搬出 = 瘦 `ctx.query.execute`）。A2 最高（拆 provider）。

---

## 4. 独立推荐

**推荐 A1，但带一条父 agent 未核的关键修正：`ctx.query.execute` owns 的 guard 链应**只含 engine-wrapper 门**（cost / timeout / retry / orphan，镜像 `pipeline.py:run_query_async` + `core/guards/*`）；G1 采样门 / G5 COUNT 门 / SQL 预算 / 近重复 / fingerprint / halt / 查询缓存 / required_predicates 组装应留 **`tool-query` consumer**（镜像 `execution.py:query_data` 的 MCP/会话级职责）。**

### 4.1 为什么同意父 agent 的 A1 倾向（而非 A3）

读 `execution.py` 后，A3 的"四层对四层"确比 A1 的"三层"更镜像 rbi 的**分层**。但 P4 是 **prototype ticket**，取舍权重落在：

1. **additive-only / 新增包**：A1 不新增 guard 包，A3 多一个独立 guard 组件包。prototype 阶段少一个包是真省。
2. **per-query executor 纪律的天然性**：A1 的 `ctx.query.execute` owns 取 executor + 持有 + 链读它，**逐字复刻** `pipeline.py` 的 `ctx.engine` 模式（`pipeline.py` 取一个 executor 钉进 `QueryContext(engine=executor)`，链读 `ctx.engine`）。A3 要成立须 `ctx.query` 暴露 `getEngine` API + guard 组件自律持有——多一处易错接口。
3. **prototype 适配**：A1 单函数可被 throwaway 终端原型直接演示；A3 两件套多一步拼装。
4. **凭证流单点**：A1 的 `ctx.query.execute` 一处 owns per-call resolve + env 注入 + 失效监听。

这四点在 prototype 语境下压过 A3 的分层保真度。**A3 是更镜像 rbi 的长期形态**，若 P4 后续硬化为生产设计，应重议 A3（尤其其可逆性优势）。

### 4.2 为什么必须带"G1/G5 留 tool-query"的修正

父 agent 的 A1 草图把 guard 链描述为"G1 采样门 / G5 COUNT 门 / cost 门 / timeout / retry / orphan 收割"——**整条放进 `ctx.query.execute`**。但 §1.1 已证 rbi 的 G1 / G5 在 `execution.py:790,798`（**orchestrator，MCP 层**），**不在** `pipeline.py`（engine-wrapper）。`execution.py:3` docstring 白纸黑字："决定查什么归本层，照单检查归 rbi-query"。

若 A1 把 G1/G5 也塞进 `ctx.query.execute`（=engine-wrapper 层），则：

- **不镜像 rbi**：rbi 的 G1/G5 是"会调 engine-wrapper 跑探针的 MCP 层门"（住 `quality_gate.py:72`/`limit_gate.py:55` in rbi-mcp，内部调 `run_query_async`），它们需要 `session_id`（缓存 key）、`executed_sqls`（近重复台账）、halt 状态——这些是**会话级**状态，天然属 tool-query（agent 调用边界），不属 engine-wrapper。
- **破坏会话状态归属**：G1/G5 的探针结果要进 turn 台账、近重复要记 `executed_sqls`、halt 要截断同 turn 后续调用——这些都是 `execution.py` 的 MCP/会话级职责（`execution.py:3` docstring 列举）。把它们下移到 `ctx.query.execute` 等于让 engine-wrapper 持有会话状态，破坏 rbi 已落地的"engine-wrapper 不认识 MCP 请求上下文"分层（`pipeline.py` docstring："rbi-query **不自己发现 scope**…一旦从 ContextVar 里摸 scope，就变成只能跑在 rbi-mcp 的请求上下文里"）。

**修正后的 A1 形态**（call it **A1-split**）：

| 层 | da 落点 | rbi 对应 | 拥有的门 |
|---|---|---|---|
| MCP/会话 orchestrator | `tool-query` consumer | `execution.py:_query_data_impl` | G1 采样、G5 COUNT、SQL 预算、近重复、G2 fingerprint、G3 LIMIT、halt、查询缓存、required_predicates 组装 |
| engine-wrapper guard host | `ctx.query.execute` | `pipeline.py:run_query_async` + `core/guards/*` | cost、timeout、retry、orphan 收割、required_predicate 检查、ambiguity（若有 `is_ambiguous_fn`） |
| seam | `ctx.query` Service Definition（含 `getEngine`/`execute`） | `registry.py:get_engine` | 取 per-query executor（连接按 scope 缓存、executor 每次新建） |
| dumb raw executor + per-scope 缓存 | `query-maxcompute` sidecar（经 mcp-client） | `engines/maxcompute/executor.py` + `connection.py` | `execute/attach/cancel/get_progress/estimate_cost` + 自有 per-scope ODPS 连接缓存 |

A1-split 让 `tool-query` 调 `ctx.query.execute` 三次（G1 探针 / G5 COUNT / 主查询），每次 `ctx.query.execute` 内部取一个 per-query executor、跑 engine-wrapper 链（cost+main 同一 executor）、返回三态。G1/G5 探针与主查询各用独立 executor——这**反而优于** rbi 的"三 execute 共一 executor"（rbi 因此有 `canceller_for` 覆写风险，`executor.py:556` docstring 述其四重后果）；da 侧每个 `ctx.query.execute` 只服务一条 query，`self._instance` 不被覆写，canceller_for 纪律**更简单**。

### 4.3 为什么排除 A2

A2 把 guard 烤进 `query-maxcompute` provider。§1.2 已证 rbi 把 guard 放 `core/guards`（**引擎无关**），executor 放 `engines/maxcompute`（dumb）。A2 = guard 进引擎专属 provider = **与 rbi 反向**。后果：每加 mysql/hologres 引擎须复制整份 guard；换 gate 须改每个 provider；per-query 纪律靠每引擎 provider 各自正确实现。map ⑤a 已定"ODPS 可插拔（未来 mysql/hologres 引擎）"——A2 直接阻碍这条决策。

### 4.4 与父 agent A1 倾向的异同

**一致**：选 A1 不选 A2/A3。理由重合点：additive-only 包最少、per-query 纪律天然、prototype 干净。

**分歧/修正**：父 agent 草图未区分 G1/G5（MCP 层）与 cost/timeout/retry/orphan（engine-wrapper 层），倾向整条 guard 链进 `ctx.query.execute`。读完 `execution.py:3,790,798,823` 后，**必须把 G1/G5 留 tool-query**——否则破坏 rbi 已落地的"MCP/会话级 vs engine-wrapper"分层与会话状态归属。这是父 agent 未读源码前无法给出的修正。

---

## 5. 与 map ⑤a / Not-yet-specified 的关系

- **map ⑤a**（`map.md` Decisions so far）："rbi-mcp 查询引擎 (⑤a)：混合——`ctx.query` seam + `tool-query` + Guard 进程内（da 掌控可插拔点），MaxCompute Provider 外置 sidecar（rbi-mcp），保 ADR-0028 D3、ODPS 可插拔。" 本笔记**细化**"Guard 进程内"的**具体落点**：engine-wrapper 门 in `ctx.query.execute`、MCP/会话门 in `tool-query`，两者**都进程内、da 掌控**，与 ⑤a 一致。A1-split 不违反 ⑤a 的任何一条（seam ✓ / tool-query ✓ / Guard 进程内 da 掌控 ✓ / MaxCompute Provider 外置 sidecar ✓ / ODPS 可插拔 ✓——guard 引擎无关保可插拔）。
- **map R2 行**（resolved）：per-call resolve + stdio env + sidecar per-scope 缓存 + credentials/updated 失效。A1-split 的 `ctx.query.execute` 是 per-call resolve 的调用点，与 R2 无冲突。
- **map Not-yet-specified**（雾区）："查询引擎深度子组件（3 层凭证解析细节、每作用域缓存策略、3-state `QueryOutcome`、服务端 cancel、per-query executor）。" 本笔记**收窄雾区**：guard 链分层（§1）+ per-query executor/canceller_for 纪律（§1.3）已从源码落地，不再是雾；3-state `QueryOutcome` 构造点（`executor.py` `_read_terminated`/`_pending`/`_failed`）、服务端 cancel（`executor.py:556` `canceller_for`）均已定位。仍雾：da 侧 `ctx.query` 的具体 API 形态（`getEngine` vs `execute` 入参）、guard 链注入的具体 Cordis Service 形状、sidecar `invalidate_scope` 工具契约。

---

## 6. 关键路径索引

- rbi orchestrator（G1/G5/budget/near-dup/halt/cache 所在层）：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/servers/execution.py`（`:3` 模块 docstring 分层断言、`:790` G1、`:798` G5、`:823` 委派 `run_query_async`）
- G1 / G5 实现（rbi-mcp，不在 rbi-query）：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/quality_gate.py:72`、`/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/limit_gate.py:55`
- rbi engine-wrapper guard host（cost/timeout/retry/orphan 所在层）：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/pipeline.py`（`:169` `run_query_async`、`:232` `build_chain`、`:261` `chain.run_async`）
- guard 链组装（引擎无关）：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/core/guards/__init__.py:94`（`build_chain`）
- 各门实现（全在 `core/`，不在 `engines/`）：`core/guards/cost.py:163`（`CostGuard`，`:278` 调 `ctx.engine.estimate_cost`）、`core/guards/timeout.py:117`（`TimeoutGuard`，`:217` 调 `ctx.engine.canceller_for`）、`core/guards/retry.py:157`（`RetryGuard`）、`core/orphans.py:252`（`record_orphan`）
- dumb executor + per-scope 缓存：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/executor.py`（`for_scope` per-query、`:556` `canceller_for`）、`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`（`ScopeConnection`/`_CONNECTIONS`/`invalidate_scope_connection`）
- seam（registry，override 优先 + per-query）：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/registry.py`（`get_engine`、`invalidate` 生产 0 调用）
- harness credentials seam（thin 镜像模板）：`/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/index.ts`（`CredentialProvider.resolve` per-call、`notifyUpdated`）
- harness mcp-client（sidecar 接线点）：`/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/index.ts`（`StdioConfig.env`、`apply`）
- harness guard 包（确认非查询 guard host）：`/Users/mckenzie/workspace/deepseek-harness-da/packages/guard/`（仅 `repeat-tool-reminder` + `timeout-policy`，agent-loop 工具调用 guard）
- P4 ticket：`/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/tickets/phase-2/P4-query-engine.md`
- R2 笔记（sidecar 凭证设计模板）：`/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/r2-maxcompute-cred-cache.md`
