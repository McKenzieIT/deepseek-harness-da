# R5 — Object layer result cache 实现方案

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
**Blocked by**: 无（独立；上游 R6 已解 2026-09-02）
**Related**: [G1](G1-design-decisions.md)（D-arch: result data 在 object layer LRU cache 管理、折叠/展开不丢数据、inject callback 读写）、[R3](R3-dsh-client-rendering-patterns.md)（数据行从同 turn query_data TSV 扫描）、[R6](R6-result-store-server-side.md)（上游已解：server store = `ctx.resultCache` in-memory/session-scoped；cache-miss = `result.get` RPC；key = `result_id` `qr_`/`cr_`）、[R8](R8-data-display-optimization-plan.md)（host 侧 `ctx.resultCache` 已存在只差 client RPC）

## Question

`present_table` 渲染需要查询结果数据行。当前 v1 通过同 turn TSV 扫描 bypass 了正式缓存层。G1 决策 D-arch 确定了"object layer LRU cache"作为方向。需要明确：

1. **实现位置**：cache 放在 client runtime 内（`packages/client/runtime/` 的某个 store）还是独立 service 包（`packages/client/result-cache/`）？
2. **LRU eviction 策略**：TTL-based（过期时间）vs maxEntries-based（最大条目数）vs hybrid？
3. **cache key 设计**（R6 已解 2026-09-02）：`result_id`——`qr_<sha256(sql)>`（查询）/ `cr_<sha256(code+sourceResultId)>`（compute 衍生，一次写入不可变）；turn + tool_call_id 不必。
4. **内存上限**：单个结果可能几 MB（10000 行 × N 列）；总 cache 大小上限？
5. **与 server-side result store 的关系**（R6 已解 2026-09-02）：cache miss = 调 `result.get` RPC（apiproxy 一行，destination 工作；host 侧 `ctx.resultCache.get` 已存在）；**非 re-query**。T4 的 `parseQueryData` 同 turn TSV 扫描保留为未接入期 / cache-miss fallback。详见 [R6](R6-result-store-server-side.md)。

## Scope

- 调研：现有 client runtime 的 store 模式（projection-store 等）、内存 profile（R6 已收窄上游，无需再调研 server store）
- 决策（grilling）：位置 + eviction 策略 + 内存上限（key 与 cache-miss 路径已由 G1 / R6 定）

## Resolution

决议于 2026-09-03（grilling + 2026-H2 前沿研究核验；全程 dsh-plugin-development 合规）。

### 决议（四点 + 一跳过）

1. **location = B**：单包 `packages/client/result-cache/`（Mode 3 Repository Package；SD+Provider 同包——client 无后端 swap 故事，不 split，契合 dsh-plugin-development 拓扑规则「single-purpose stays one package」；session-scoped Cordis service `ctx.results`，镜像 host `ctx.resultCache` 放置但合二为一）。**不内联进 `runtime`**——避免与 runtime 工作面的 upstream merge 撞车（runtime `index.ts`/`apply()` 是热点公开面）+ 契合「永久能力→Mode 3 包」farming。研究排除了复用 `projection-store`（那是 push-model；result cache 是 pull-model，是同层兄弟非复用）。
2. **失效 = (a) 事件驱动**：client 观察到一次新的 `query_data` 完成且 `result_id=R` → invalidate `cache[R]`（新取重 `result.get` RPC 拿 host 最新）。`cr_` 不可变，永不失效（gen 只在 `query_data` 完成时触发，`cr_` 天然不触发，无需特判）。fresh-vs-folded 由失效发生的**时序**自然处理（失效后渲染的新表 miss 重拉；失效前重展开的旧表命中快照）。契合 G1 D2/D6「retry=re-fetch」与 2026 TanStack/SWR/Apollo 共识。
3. **eviction = byte-bounded LRU，无 TTL**：`lru-cache`（isaacs）进 `dependencies`，配 `maxSize`/`sizeCalculation`/`maxEntrySize`/`updateAgeOnGet`。`quick-lru`/`mnemonist` 只 count-only 不用；TanStack cache 是 time-based 无 size cap 不当有界热缓存。无 TTL（`cr_` 不可变→TTL 浪费；`qr_` 持快照→TTL 有害；事件驱动管正确性）。研究纠正了原 count-based 倾向——count-based 在变长多 MB 条目下保护不了内存。
4. **bound = `maxEntrySize ~8MB` / `maxSize ~64MB` / `max ~64` / `updateAgeOnGet true`**：`maxEntrySize` ~8MB 容下 10000 行表（G1 D7 的昂贵 memoization 场景；研究给的 ~2MB 会把 10000 行表拒之门外、打败 cache 目的，故本 app 上调）；>8MB 超大结果不缓存、按需 fetch。四值落成 `Config` 字段可 `cordis.yml` 调（No-hardcoded-tunables），按真实结果尺寸后续校准。
5. **generation-token = v1 跳过**：不做 client 侧 key 世代号（`qr_R#genN`）硬化。理由：本系统事件交付可靠（Session 后台持续吃帧 + 重连 resync 重放），missed-event 竞态窄；defer 升级廉价（cache 内部局部改动，`fetchResult(R)` 签名不变、gen 不外露，无 API 破）；G1 轻量。**Known Limitation**：若 `query_data` 完成事件漏/迟到，`cache[R]` 可能短时吐旧值到 LRU 淘汰；咬到再加 generation-token（同事件触发改为 key 轮转，关闭 missed-event 竞态）。

### 不采用（研究核验排除）

IndexedDB spill（session 级 + host 是 source of truth，recoverability 非目标）、WeakRef/FinalizationRegistry（无容量控制、GC 时机不保证）、tag/CDN 式失效（错层）、HTTP `stale-while-revalidate` 指令（浏览器支持参差）、命中时 `structuredClone`（共享引用 + 标注不可变即可）。

### 实现路径（→ [T9](T9-result-cache-package-impl.md)，blocked-by [T8](T8-result-get-rpc.md)）

**前置依赖（→ [T8](T8-result-get-rpc.md)）**：host 侧 `result.get` RPC 四件——`ResultsApi` 接口 + `results.schema.ts`（`{ resultId }` → `ResultEntry | not-found`）；`RpcMethodMap` 加 `'result.get'` 行；`IApiClient.results.get` + `UNARY_VALUE_SCHEMAS` 一项；host handler 包 `ctx.resultCache.get(rid)`，not-found 走 `RpcError`（`result-not-found` 码）。未接入期：T4 `parseQueryData` 同 turn TSV 扫描留作 cache-miss fallback。

**client 包（Mode 3）**：
- `packages/client/result-cache/`：`package.json`（`@deepseek-ai/dsh-client-result-cache`，`dsh.client` manifest，`lru-cache` 进 `dependencies`）+ `tsconfig.json`（references runtime）+ `src/client/{index.ts,service.ts,...}` + `README.md`（Model Experience + Known Limitations）。
- 三个注册面（AGENTS.md new-package checklist）：`tsconfig.client.json` references 行 + `packages/bundle/web-app/cordis.patch.yml` `dsh.client` 行 + `packages/bundle/web-app/package.json` dep 行。
- service：`ctx.results`（session-scoped），`get(rid)` 做 cache→miss→`result.get` RPC；`lru-cache` 实例持 `Map<rid, ResultEntry>`，`sizeCalculation` 按序列化字节估；`Config` 字段（`maxEntrySize`/`maxSize`/`max`/`updateAgeOnGet`）从 `cordis.yml` 注入。
- 失效订阅：inject `sessions`/`conversationEvents`，订阅 `query_data` tool_result 完成 → 提取 `result_id` → `cache.delete(rid)`（`cr_` 天然不触发）。
- inject face（供 `ui-present-table` 等消费）：`inject: (sessionId) => ({ fetchResult: (rid) => ctx.results.get(rid) })`（参 `ui-suggest-followups` 的 `submit` face 模式；组件不见 ctx）。
- `ui-present-table` 改：inject 加 `fetchResult`；`args.result_id` → `fetchResult(rid)` → 全量 rows；TSV 扫描降级为 cache-miss fallback（T4 已修的 `parseQueryData` 留作兜底）。
- retry = 重发 `result.get`（G1 D2/D6 自然成立）。

### dsh-plugin-development 合规

Mode 3 Repository Package（永久能力、他包依赖）；拓扑规则——single-purpose 单包（SD+Provider 同包，roles 不独立演化）；No-hardcoded-tunables（bound 落 `Config`）；registrations-as-effects（失效订阅、inject face 经 `ctx.effect`/register）；explicit-over-implicit at boundaries（`fetchResult` face 显式）；Agent Note 同 PR 记决议（repo-wide rule）。

### 资产

- 前沿研究笔记（2026-H2，带引用 + 可落地建议，核验 (a) + 纠正 count→byte-bounded + generation-token 评估）：[research/R5-object-layer-result-cache.md](../research/R5-object-layer-result-cache.md)
- 上游：[R6](R6-result-store-server-side.md)（host store + `result.get` RPC 通路）、[G1](G1-design-decisions.md) D-arch（object-layer LRU、折叠/展开不丢数据、inject callback）

### 移交

R5 决策面已尽；实现 → [T9](T9-result-cache-package-impl.md)（blocked-by [T8](T8-result-get-rpc.md)）——当前项目开发依赖票推进，故从 destination handoff 拉进 ticket。无新 grilling/决策票。前沿：T6 blocked-by [T7](T7-chart-type-implementation.md)（R4 图表接入）；`result.get` RPC 四件 → [T8](T8-result-get-rpc.md)；「查询理解↔table KPI 互认 + 改口径回流」雾已部分毕业（[R10](R10-decomposition-table-metric-identity.md) research + [P2](P2-decomposition-revision-prototype.md) prototype），残留=下游 grilling。
