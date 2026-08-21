# `@deepseek-ai/dsh-query-tool`

[English](README.md) | 中文

Model-facing `query_data` tool：data agent `EXECUTION` 阶段的**经 `ctx.query` 真实执行 SQL**。agent 调用它（传 SQL + per-game scope）在 MaxCompute 上跑该 SQL 并取回 rows——agent 跑它自己写的 SQL，而非 eval harness 重跑 canned 语句。

这是 **P4c(c)** tool — data-agent 工作中的第二个 model-facing tool 注册（继 `search_data_sources` P13b 之后），因此也把 [`@deepseek-ai/dsh-tools`](../../core/tools) 的 tool-registration API（`defineTool` + `ctx.tools.register`）扩展到 EXECUTION 阶段。镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../../data/tool-search-data-sources)：同样的 `inject: ['tools']` 插件探针式 `ctx.get('query')`（**非** `inject: ['query']`），因此 tool 在未挂 query provider 时仍可加载——未注册的白名单 tool 只是不可调用，不是挂载错误（phase-gate guard 的 EXECUTION 白名单已含 `query_data`）。

## 状态：maxc-backed EXECUTION (P4c)

query engine 是 [`@deepseek-ai/dsh-query-maxcompute`](../query-maxcompute) provider (P4c(a))：da 自持 raw MCP SDK `Client` 经 `maxc`-backed sidecar（shell 到真 MaxCompute CLI）返真 ODPS rows。provider 用 raw name 编程所有 sidecar 工具且**不**在 `ctx.tools` 注册，故控制工具（`set_credentials` / `invalidate_scope`）保持非 model-callable（A1-split）。3-state `QueryOutcome`（P4 decision B）即整个 EXECUTION 形态：completed→rows；pending→poll `getProgress` 至 settle（或 poll budget 用尽后诚实返 pending）；failed→surface。

guard chain（CostGuard `estimate_cost` / TimeoutGuard signal / RetryGuard / OrphanReaper）deferred 到 A1-split engine-wrapper 加固（P4c(b)）；本 tool 是 `ctx.query.execute` 之上的 dumb model-facing consumer。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../../data/tool-search-data-sources)（并经它 [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash)）：

```ts ignore-check
export const name = 'query-tool'
export const inject = ['tools']
export const Config: z<Config> = z.object({
  maxPolls: z.number().default(60),
  pollIntervalMs: z.number().default(2000),
  maxDisplayRows: z.number().default(50),
})

export function apply(ctx: Context, config: Config = {}): void {
  const cfg = resolveConfig(config)
  ctx.tools.register(defineTool({
    name: 'query_data',
    description: '…',
    parameters: { sql: {…}, scope_id: {…} },
    output: { schema: {…}, render: (_args, value) => […] },
    async execute(args, exec) {
      const query = ctx.get('query') // undefined -> helpful error (load without a provider)
      return executeQuery(query, args, exec, cfg) // 3-state: done/pending-poll/failed
    },
  }))
}
```

核心 EXECUTION 流（`executeQuery` / `projectOutcome` / `pollToSettlement`）以 pure function 导出，使 3-state 处理可对 stub `QueryEngine` 测试；P4c(c) smoke 对真 provider（maxc-backed sidecar→真 ODPS rows）调用它，证 tool 路径——非直 sidecar 调用。注册基于 effect（dispose plugin fiber 即注销 tool）；schema 自动流入 system-prompt 装配。见 [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md)。

## Config

| 字段             | 类型     | 默认  | 说明                                                                  |
| ---------------- | -------- | ----- | --------------------------------------------------------------------- |
| `maxPolls`       | `number` | `60`  | pending query 的最大 poll 次数，用尽后诚实返 pending。                |
| `pollIntervalMs` | `number` | `2000` | `getProgress` poll 间隔（ms）。                                       |
| `maxDisplayRows` | `number` | `50`  | 渲染进 model context 的最大行数（display cap）；engine row-cap deferred。 |

query engine **非** config 字段：它是 `ctx.query`（data-agent bundle 挂载的 MaxCompute provider）。`scope_id` 是 per-game access-isolation scope（信任边界）；生产加固从 `ctx.identity` 取，而非 model 传入。

## 验证

```sh
tsc -b packages/query/query-tool/tsconfig.json      # typecheck
pnpm vitest run packages/query/query-tool            # 3-state spec (stub engine)
pnpm verify-cordis-config                            # preset + bundle mounts resolve
node --import tsx/esm packages/query/query-tool/dev/query-tool-smoke.ts  # tool -> real ODPS (4336)
```

smoke boot 一个 cordis ctx + fake credentials + MaxCompute provider（maxc-sidecar），捕获插件注册的 `query_data` tool def，调其 `execute`（传 RBI case `eval_10000251_037` 的 expected SQL），断言结果重现 `expected.result_value`（dau=4336）——经 tool 路径，非直 sidecar 调用。preset 行（`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`，`tool-query-data`）随本包 ship 已解注释；phase-gate guard 的 EXECUTION 白名单已含 `query_data`，故注册即在相可调。

## Model Experience

### `query_data` 工具调用

#### What the model sees

`query_data` 工具 schema（name、description、`sql` 与 `scope_id` 参数，以及 3-state `output` 对象：completed 的 `state`+`columns`/`rows`/`rowCount`/`truncated`、pending 的 `instanceId`/`stage`/`elapsedMs`、failed 的 `error`/`failureKind`）在插件挂载后自动流入 system-prompt 装配，故 model 在 `EXECUTION` 阶段白名单中与之一同发现。model 调用时，`execute` 返回一个 canonical JSON value，由 `output.render` 投影为 model-facing 文本：completed 为 TSV 表（列头 + rows，display-capped 至 `maxDisplayRows` 并附 elision + 行数摘要）；pending（poll budget 用尽）为 `Query still running; instance <id>…` 单行；failed 为 `Query failed (<failureKind>): <error>`。

#### Token effect

渲染后的结果文本是 per-call token 成本；`query_data` schema 走 system prompt 而非 turn payload。completed 结果随 `maxDisplayRows`（默认 50）+ 列头缩放——display cap 限制了 agent 每次 query 的 token 支出，与 engine 返回多少行无关。engine row-cap（maxc `--max-rows`）deferred 到 engine-wrapper，故目前 tool 在显示层 cap 而非在源头截断。

#### KV Cache effect

Tool 结果是 append-only：渲染文本跟随可复用 request prefix，不失效既有 cache 条目。tool schema 是跨 turn 的稳定 system-prompt prefix 的一部分，故注册或调用不增加 prefix churn。pending 结果（poll budget 用尽）是短固定单行，故未 settle 的 query 在 agent 重发/attach 前仅增极小 token。

## Known Limitations and Deferred Work

- **guard chain deferred（P4c(b)）** — engine-wrapper 的 CostGuard（`estimate_cost`）、TimeoutGuard（signal）、RetryGuard（infra vs model attempt）、OrphanReaper（dispose async-job 清理）deferred；本 tool 是 dumb model-facing consumer，故失控 query 在显示层 cap，而非在源头 cost/row-gated。
- **`mode` 是 prototype-only knob** — `QueryRequest.mode`（`fast`/`slow`/`blocking`/`fail`）是 stand-in-sidecar 机制；maxc provider 从真 ODPS 执行派生 pending vs completed，不携 mode，故本 tool 不向 model 暴露它。
- **尚未全 runnable end-to-end** — preset 注册了 `query_data`（本包）与 `search_data_sources`，但 `load_table_definition` / `load_event_definition`（ctx.schema P6b）与 `present_*` INTERPRETATION delivery 工具 deferred，故 data-agent profile 尚非完整四相 run（G1c 追踪）。
- **pending polling 有界，非 push** — `ctx.query` 无 push notification（G4 HOLE-D）；pending query 经 `getProgress` poll 至 `maxPolls`，用尽后诚实返 pending（agent 重发；尚无 model-facing `attach` 工具）。
