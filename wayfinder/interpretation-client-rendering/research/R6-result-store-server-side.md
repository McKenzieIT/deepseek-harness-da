# R6: Result store server-side — what already exists, the RPC gap, and storage/GC

> 配套 ticket 见 [../tickets/R6-result-store-server-side.md](../tickets/R6-result-store-server-side.md)；下游 client cache 见 [R5](../tickets/R5-object-layer-result-cache.md)（本票是其上游）；审计 [R8](./R8-data-display-optimization.md) §B2 已识别"host 侧 `ctx.resultCache` 已存在只差 client RPC"。
> 证据来源：`packages/data/result-cache{,-memory}/`（SD + Provider 实现）、`packages/data/tool-compute/`（compute 消费者）、`packages/query/query-tool/`（result_id 注入点）、`packages/host/apiproxy/`（rpcId 双向协议）、`packages/bundle/data-agent/cordis.patch.yml`（bundle 挂载）、`packages/client/AGENTS.md`（client 纪律 + RPC note 引用）、`wayfinder/data-agent/` 的 result-cache-service / safe-compute-environment 票与研究笔记。

## 0. 结论速览

1. **host 侧 result store 已存在且已挂载**：`@deepseek-ai/dsh-result-cache`（Service Definition，`ctx.resultCache`）+ `@deepseek-ai/dsh-result-cache-memory`（in-memory Provider）已 ship 并挂载在 data-agent bundle。`get(resultId)` / `put(resultId, entry)` / `has(resultId)` 三方法，存 `{ columns, rows, metadata?: { sql?, truncated?, row_count? } }`。
2. **跨 turn 存储已覆盖**：session-scoped `Map`，同 session 内任意 turn 的 `result_id` 都可取回（与 event-window compaction 无关——cache 独立于 event log）。`qr_<sha256(sql)[0:12]>` 确定性键；同 SQL 重跑覆盖为最新行。
3. **compute 派生结果已覆盖**：compute tool 生成 `cr_<sha256(code+sourceResultId)[0:12]>`，通过 `ctx.resultCache.put()` 入库；`load_result` binding 是 `ctx.resultCache.get()` 的薄 facade。已实现、已测试。
4. **大结果分页（>10000 行）未覆盖**：`get()` 返回整个 `ResultEntry`（全量 columns + rows 数组），无 offset/limit/paging API。这是唯一的真实能力缺口——但它在设计上是 deferred 项（safe-compute 研究 open question #5 明确推迟），非回归。
5. **RPC gap 精确**：rpcId 双向协议（`packages/host/apiproxy`）已完整——`RpcMethodMap` 有 ~50 个方法，`IApiClient` 是 client 消费面，transport（POST `/api/<method>`、envelope、zod 解析、SSE）全部就绪。**缺的只是一个 `result.get`（或同名）方法行**：在 `RpcMethodMap` 加一行 + `IApiClient` 加一方法 + 一个 value schema + 一个 host handler 包装 `ctx.resultCache.get(rid)`。机械工作、低成本。
6. **存储后端 = 纯内存 `Map`**，无 JSONL / file-backed / 持久化。**GC = session-lifetime**（无 LRU、无 TTL；plugin context dispose 时 Map 随之释放）。设计如此——safe-compute 研究明确"session-scoped only; compute derivations are cheap to recreate"。
7. **R3 时代的"result_id 是模型自造"已过时**：`result_id` 现在是**系统生成**（post-execute hook 注入到 query_data tool value，render 成 TSV 首行 `result_id: qr_xxx`），模型从结果里读到再传给 `present_table`。R3 §3"方案 B（future: server-side result cache）"的 future 已落地为 present，只差 client 通道。

**结论**：无需新 grilling/决策票。现有 service + 一条薄 client RPC 即闭合 G1 架构（数据路径分离 + retry + 全量数据）。唯一需决策的开放项是"大结果分页是否 day-1 做"——但已有设计先例将其定为 deferred。R6 resolves as "no new decision — here's the path"。

## 1. 已存在的 host 侧 result store

### 1.1 两包结构（SD + Provider，遵循 SpillStore 模式）

| 包 | 角色 | 关键导出 |
|---|---|---|
| `packages/data/result-cache/`（`@deepseek-ai/dsh-result-cache`）| Service Definition | `abstract class ResultCache extends Service`，注册为 `ctx.resultCache`；`ResultEntry` / `ResultMetadata` 类型 |
| `packages/data/result-cache-memory/`（`@deepseek-ai/dsh-result-cache-memory`）| in-memory Provider | `MemoryResultCache extends ResultCache`；`tools/post-execute` hook；`generateQueryResultId(sql)` |

### 1.2 API surface（`packages/data/result-cache/src/index.ts:30-46`）

```typescript
abstract class ResultCache extends Service {
  constructor(ctx: Context) { super(ctx, 'resultCache') }
  abstract get(resultId: string): ResultEntry | undefined
  abstract put(resultId: string, entry: ResultEntry): void
  abstract has(resultId: string): boolean
}
```

`ResultEntry`（`packages/data/result-cache/src/types.ts:9-20`）：

```typescript
interface ResultEntry {
  readonly columns: string[]
  readonly rows: unknown[][]
  readonly metadata?: { readonly sql?: string; readonly truncated?: boolean; readonly row_count?: number }
}
```

三方法 + 三个字段，这就是全部 surface。无 paging、无 list、无 delete、无 stream。

### 1.3 Provider 实现（`packages/data/result-cache-memory/src/index.ts`）

- **存储**：`private readonly store = new Map<string, ResultEntry>()`（行 41）。纯内存 `Map`，无文件、无 JSONL、无持久化。
- **`get`**（行 43-45）：`this.store.get(resultId)`，missing 返回 `undefined`。
- **`has`**（行 55-57）：`this.store.has(resultId)`。
- **`put`**（行 47-53）：
  - `cr_` 前缀（compute 派生）：immutable-once-written——同 entry 幂等，不同 entry throw `cannot overwrite result_id ... with a different entry`。
  - `qr_` 前缀（query）：覆盖为最新行（同 SQL 重跑时数据可能变化——time-windowed/real-time 查询）。**不 throw**——post-execute hook 在 execute 的 outer try/catch 内，throw 会把成功查询变 isError 并让 stale 行残留。
- **key 生成**（`generateQueryResultId`，行 71-74）：`qr_<sha256(sql).slice(0,12)>`，确定性。
- **post-execute hook**（`apply(ctx)`，行 80-110）：
  - 仅处理 `exec.name === 'query_data'` 且 `decision.kind === 'accept'` 且 `!result.isError` 且 `value.state === 'completed'`。
  - 从 `value` 取 `columns / rows / sql / truncated / rowCount`，`cache.put(qr_<hash>, entry)`。
  - **augment tool value**：`return { kind: 'accept', value: { ...value, result_id: resultId } }`——这是 result_id 进入模型视野的注入点。
- **ignored**：failed / pending query_data、非 query_data 工具。

### 1.4 bundle 挂载（`packages/bundle/data-agent/cordis.patch.yml:225-226`）

```yaml
    - id: result-cache          # ctx.resultCache seam — in-memory session-scoped Provider; ...
      name: '@deepseek-ai/dsh-result-cache-memory'
```

挂在 data-agent bundle 顶层。注释自述"session-scoped Provider"——Cordis 中 session context fork 的 plugin 随 session dispose 而释放，`Map` 同生命周期。

### 1.5 result_id 流（system-generated，非 model-invented）

R3 §3 曾写"result_id 是模型自生成的语义引用；query_data 工具不生成 result_id"。**这在 result-cache-memory 落地后已过时**：

1. `query_data` execute 返回 `{ state, sql, columns, rows, rowCount, truncated }`（`packages/query/query-tool/src/index.ts:73-93`，`result_id?` 字段注释明写"Deterministic cache key injected by result-cache-memory post-execute hook"）。
2. post-execute hook（上 §1.3）生成 `qr_<hash>` 并 **augment value**——`result_id` 进入 tool result value。
3. `renderCompleted`（`packages/query/query-tool/src/index.ts:250-268`）把 `result_id` 渲染为 TSV 首行 `result_id: ${value.result_id}`，再加列名行、数据行（截断到 `maxDisplayRows` 默认 50）、`(... N more rows elided)` 标记、`(N rows)` 尾行。
4. 模型从 query_data 结果文本里读到 `result_id`，再作为 `present_table` 的 `result_id` arg 传回（`packages/data/tool-present-table/src/index.ts:62-67`：`result_id` required string，描述"The ID of the query result to present (from query_data execution)"）。

所以 `result_id` 是**系统生成的确定性引用**，模型只是中继。`present_table` execute（行 132-145）只回显 `result_id`，不校验、不查表——解析为真实数据是 client（或 compute）的责任。

### 1.6 compute 派生结果（已闭合）

`packages/data/tool-compute/src/index.ts`：

- `computeResultId(code, sourceResultId)`（行 24-27）= `cr_<sha256(code + sourceResultId).slice(0,12)>`。
- execute 流程（行 86-129）：校验 `ctx.resultCache.has(resultId)`（missing 则显式 throw）→ `load_result` binding 是 `ctx.resultCache.get(rid)` 的薄 facade（行 103-112）→ `ctx.codeRuntime.run()` → 校验输出 `{columns, rows}` → `ctx.resultCache.put(newResultId, entry)` → 返回 `{ computed, result_id, row_count, ... }`。

`inject = ['tools', 'codeRuntime', 'resultCache']`（行 6）。compute 既是 consumer（读 `qr_`）又是 producer（写 `cr_`）。**已 ship、已测试**（22 tests，compute-tool ticket §Resolution）。

### 1.7 覆盖矩阵（R6 三场景）

| 场景 | 已覆盖？ | 证据 |
|---|---|---|
| **跨 turn 引用**（earlier turn 的 result_id 仍可取） | ✅ 是 | session-scoped `Map`，独立于 event-window compaction；同 session 内 `get(rid)` 恒返回。safe-compute 研究 open-q #6："Cache is keyed by rid, survives compaction; only expires at session end" |
| **compute 二次计算**（新 result_id + 存储） | ✅ 是 | `cr_<hash>` + `ctx.resultCache.put()`，compute tool 已实现 |
| **大结果分页（>10000 行）** | ❌ 否 | `get()` 返回整个 `ResultEntry`，无 offset/limit。safe-compute 研究 open-q #5 明确 defer："Defer — start with full-load; add pagination if RLIMIT_AS triggers on real workloads" |

一个细节：cache 存的是 **query engine 返回的全量 rows**（`value.rows`，未截断），不是 render 后的 50 行 TSV。`maxDisplayRows` 只作用于 `renderCompleted`（展示给模型/client 的文本），不影响 cache 内容。所以 client 若走 RPC 取 cache，能拿到全量行——这正好闭合 R8 A3 的"50 行天花板"。但"全量"以 query engine 返回的行数为上限（transport 级 cap，非 cache 级）；cache 本身无行数 cap、无分页。

## 2. Client→host RPC 协议

### 2.1 现有 transport：rpcId 双向协议（`packages/host/apiproxy`）

四象限可辨识联合（`packages/host/apiproxy/src/api/rpc.ts`）：

| 消息 | 物理通道 | 用途 |
|---|---|---|
| `ClientRequest` | POST `/api/<method>` body | client 发起的方法调用 |
| `ServerResponse` | 该 POST 的响应体 | 回显 `rpcId`，承 `RpcResult<T>` |
| `ServerRequest` | SSE 帧（`/api/events.*`） | server 发起的交互（approval/question）或推送（session/event） |
| `ClientResponse` | POST `/api/respond` body | 对 ServerRequest 的回应 |

`RpcId` 是 initiator mint、responder echo 的 opaque token（`rpc.ts:16-28`）。`RpcMethodMap`（`packages/host/apiproxy/src/api/rpc-map.ts`）注册所有 client-request 方法名 → 签名；`RequestPayload<K>` / `ResponseValue<K>` 从 map 派生。当前 ~50 个方法：`session.*`、`subagent.*`、`host.*`、`workspace.*`、`skill.*`、`agentPreset.*`、`goal.*`、`settings.*`、`credentials.*`、`llm.*`。

`IApiClient`（`packages/host/apiproxy/src/fetch/client.ts:81-167`）是 client 消费面：payload-direct 方法（业务代码不 mint rpcId，carrier 层 mint）。`AbstractApiClient`（同文件）持有全部协议不变量：mint rpcId → wrap envelope → POST → envelope zod 解析 → verify echo → value 二级解析 → narrow。browser fetch 与 in-process handler 共用同一基类（`InProcessApiClient`）。

`packages/client/AGENTS.md:53` 明确定义纪律："rpcId is strictly bidirectional: the initiator mints, the responder echoes; business signatures see only `RpcRequest<P>`, minting stays in the carrier layer"。框架 note 在 `.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md`。

### 2.2 client plugin 今天如何调 host

两条路径，都有先例：

1. **inject face → session-scoped service**（`ui-suggest-followups` 模式，`packages/client/ui-suggest-followups/src/client/index.ts:29-44`）：
   ```typescript
   inject: ['slots', 'sessions', 'locale']
   // ...
   inject: (sessionId) => ({ submit: (text) => {
     const conversation = sessions.scope(sessionId)?.get('conversation')
     void conversation?.send(text)
   }})
   ```
   `IConversation.send(text)` 是 session-scoped 消息发送（R3 §5 确认 `ui-conversation/src/client/service.ts:42`）。组件只见 `submit` callback，不见 ctx——符合 AGENTS.md §"components never see ctx"。

2. **`IApiClient` unary 方法**（runtime 服务模式）：client runtime 的 `Sessions` / `Workspaces` manager 在构造时注入 `api: IApiClient`（`packages/client/runtime/src/client/sessions/manager.ts:168`、`workspaces/service.ts:66`），内部调 `api.sessions.prompt(...)` 等。这是 RPC 路径——payload-direct，carrier 处理 envelope。

无 "Typert Remote"——grep `Typert|typert` 全仓零命中（task lead 里的这个名词在本仓不存在；实际机制就是 apiproxy 的 rpcId 协议）。

### 2.3 RPC gap 精确

`RpcMethodMap` / `IApiClient` 里**没有 result-fetch 方法**。grep `result.*get|resultCache|cache.*get` 在 `packages/host/apiproxy/src/` 零业务命中（仅一处无关的 `imageAdmissionChains`）。host 侧 `ctx.resultCache.get(rid)` 存在但只对 host-side Cordis plugin 可见（compute tool 用了），browser client 触达不到。

**缺的具体件**（加一个 RPC 方法的标准件，rpc-map.ts 既是模板也是校验源——`UNARY_VALUE_SCHEMAS` 对 map key 编译期强制全覆盖）：

1. `packages/host/apiproxy/src/api/rpc-map.ts`：加一行 `'result.get': ResultApi['get']`。
2. `packages/host/apiproxy/src/api/`：新建 `results.ts`（`ResultApi` 接口）+ `results.schema.ts`（payload `{ sessionId, resultId }`、value `{ columns, rows, metadata }` 或 not-found 错误码）。
3. `packages/host/apiproxy/src/fetch/client.ts`：`IApiClient` 加 `results: { get(payload, signal?) }`；`AbstractApiClient` 加 `readonly results = { get: (p, s) => this.callUnary('result.get', p, s) }`；`UNARY_VALUE_SCHEMAS` 加对应行。
4. host handler 侧（`ApiProxy` impl）：`result.get` 路由到 `ctx.resultCache.get(resultId)`——一行包装。not-found 走 `RpcResult` error 分支（新增一个 error code 如 `result-not-found` 到 `RpcErrorDetailsMap`）或直接 `{ ok: true, value: null }` 让 client 决定。
5. `RpcErrorDetailsMap`（`rpc.ts:88-`）：若选 error 路径，加一行 `'result-not-found': { resultId: string }`。

transport（POST `/api/result.get`、envelope、zod、rpcId echo、超时、SSE）全部已就绪。这是机械工作，不涉及新协议、新 carrier、新纪律。client 侧消费既可走 `IApiClient`（runtime service 注入），也可折叠成 inject face callback（`inject: (sessionId) => ({ fetchResult: (rid) => api.results.get({ sessionId, resultId: rid }) })`）——后者更贴 AGENTS.md §"inject returns plain data and callbacks"。

### 2.4 retry 语义（G1 D2/D6）

G1 D2/D6 的"retry = 重新从 result store 拉取"在 RPC 落地后即自然成立：retry 按钮 = 重发 `result.get` RPC。cache miss（session 已 dispose 或 result_id 从未写入）→ `RpcResult` error → client 显示"数据已过期，无法恢复"（G1 D6）。无需额外 retry 协议——就是同一个 unary RPC 再发一次。

## 3. 存储后端 + GC

### 3.1 后端：纯内存 `Map`

`MemoryResultCache`（`packages/data/result-cache-memory/src/index.ts:41`）：`private readonly store = new Map<string, ResultEntry>()`。grep `jsonl|file-backed|persist|writeFile|readFile` 在两个 result-cache 包的 `src/` 零命中。**无文件后端、无 JSONL、无持久化**。

设计意图（safe-compute 研究 §3 + result-cache-service ticket §"Design decisions"）：
- "No persistence: session-scoped only (compute derivations are cheap to recreate)"
- "Session-scoped lifecycle (entries GC'd with session)"
- "No scope isolation (v1): single-user single-scope data-agent"

### 3.2 GC：session-lifetime，无 LRU / 无 TTL

无 LRU、无 max-entries、无 TTL。entry 在 plugin context dispose（session 结束）时随 `Map` 一起释放。`qr_` 同 SQL 重跑时覆盖（不累计）；`cr_` immutable（同 hash 不重复写）。safe-compute 研究 open-q #2 曾提"Start with 100k rows cap; add spill-to-disk later if needed"——**未实现**（无 cap、无 spill）。open-q #3 "compute results immutable or overwritable?" 已决：immutable（代码实现为 `cr_` 冲突 throw）。

### 3.3 何时释放

session context dispose → `MemoryResultCache` 实例 GC → `Map` 释放。无显式 `release(rid)` / `clear()` API（`ResultCache` abstract 无此方法）。无跨 session 残留（session-scoped 挂载，非 process-global）。

### 3.4 大结果的行为

cache 存 query engine 返回的全量 `rows`（无 display cap——`maxDisplayRows` 只在 render）。`get()` 一次性返回整个 `ResultEntry`。对中等结果（数千行）足够；对极大结果（>10000 行）：
- **无 paging API**——client 一次 RPC 拿全量数组。
- **无行数 cap**——cache 不拒绝大结果。
- safe-compute 研究 open-q #5 明确推迟分页："Defer — start with full-load; add pagination if RLIMIT_AS triggers on real workloads"。

这是唯一的真实能力缺口，但它在设计上就是 deferred 项，非回归。

## 4. 结论与建议

### 4.1 三个子问题的回答

1. **现有 host 侧 result cache 覆盖什么？** 跨 turn ✅（session-scoped Map，survives compaction）；compute 派生 ✅（`cr_` + put，已实现）；大结果分页 ❌（get 返全量，无 paging——deferred 项）。
2. **client 如何按 result_id 拉数据？** rpcId 双向协议（apiproxy）transport 已就绪；缺一个 `result.get` 方法行 + handler 包装 `ctx.resultCache.get(rid)`。无 "Typert Remote"（本仓不存在此名）。
3. **存储后端 + GC？** 纯内存 `Map`，无文件/JSONL；session-lifetime GC，无 LRU/TTL；无显式 release API。

### 4.2 是否需要新 grilling/决策票？

**不需要。** R6 resolves as "no new decision — existing service + a thin client RPC suffices"。理由：

- host 侧 service 设计已定（result-cache-service ticket resolved 2026-08-26，6 项设计决策已锁）。
- RPC transport 已定（rpcId 协议，apiproxy 已 ship，AGENTS.md 已纪律化）。
- GC/后端已定（session-scoped in-memory，设计意图明确）。
- 唯一开放项"大结果分页"已有设计先例将其定为 deferred——day-1 用全量 get，按需再加 paging（一条 `result.getPage` 方法 + `offset/limit` payload，同套机械件）。

落地路径（喂给 R5/实现票）：
1. host: `packages/host/apiproxy/src/api/` 加 `results.ts` + `results.schema.ts`；rpc-map 加 `result.get` 行；client.ts 加 `IApiClient.results.get` + `UNARY_VALUE_SCHEMAS` 行；`ApiProxy` impl 路由到 `ctx.resultCache.get(rid)`。
2. client: `ui-present-table` 注册 `inject: ['slots', 'sessions', ...]`，inject face 提供 `fetchResult(rid)` callback（闭包 `api` 或 session-scoped result service）。组件 `args.result_id` → `fetchResult(rid)` → 全量 rows；TSV 扫描降级为兼容 fallback（T4 已修的 `parseQueryData` 留作 cache miss 兜底）。
3. retry = 重发 `result.get`（G1 D2/D6 自然成立）。
4. 大结果：day-1 全量 get；若实测 hit 内存/延迟墙，再加 `result.getPage`（同套件，不破契约）。

### 4.3 对 R5（client cache）的含义

R5 问"cache miss 时 fallback 路径（当前无 server store → 只能 re-query）"。**server store 已存在**——R5 的 fallback 路径 = 这条 `result.get` RPC（miss = session 已 dispose，不可恢复，G1 D6 显示"数据已过期"）。R5 的 object-layer LRU cache 是 RPC 之上的 client 侧热缓存（折叠/展开不重发 RPC、跨 turn 不重拉），不是 fallback 的唯一来源。R5 的 open 项（LRU 位置/策略/key/上限）仍是 R5 自己的决策面，不受 R6 阻塞——R6 只确认"server 侧已就绪、RPC 路径已明确"。
