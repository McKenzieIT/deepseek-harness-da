# `@deepseek-ai/dsh-query-tool`

English | [中文](README.zh.md)

Model-facing `query_data` tool: **real SQL execution via `ctx.query`** for the data agent's `EXECUTION` phase. The agent calls it with SQL + a per-game scope to run that SQL via the query engine and get back rows — the agent running its OWN SQL, not the eval harness re-running a canned statement.

This is the **P4c(c)** tool — the SECOND model-facing tool registration in the data-agent effort (after `search_data_sources`, P13b), so it also extends the [`@deepseek-ai/dsh-tools`](../../core/tools) tool-registration API (`defineTool` + `ctx.tools.register`) to the EXECUTION phase. It mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../../data/tool-search-data-sources): the same `inject: ['tools']` plugin that probes `ctx.get('query')` (NOT `inject: ['query']`), so the tool loads without a query provider mounted — an unregistered whitelisted tool is simply uncallable, not a broken mount (the phase-gate guard's EXECUTION whitelist already names `query_data`).

## Status: maxc-backed EXECUTION (P4c)

The query engine is the [`@deepseek-ai/dsh-query-maxcompute`](../query-maxcompute) provider (P4c(a)): a da-self-held raw MCP SDK `Client` over the `maxc`-backed sidecar that shells to the real MaxCompute CLI and returns real engine rows. The provider programs ALL sidecar tools by raw name and registers NONE on `ctx.tools`, so control tools (`set_credentials` / `invalidate_scope`) stay non-model-callable (A1-split). The 3-state `QueryOutcome` (P4 decision B) is the whole EXECUTION shape: completed -> rows; pending -> poll `getProgress` to settlement (or the poll budget, then an honest pending); failed -> surface.

The guard chain (CostGuard `estimate_cost` / TimeoutGuard signal / RetryGuard / OrphanReaper) is deferred to the A1-split engine-wrapper hardening (P4c(b)); this tool is the dumb model-facing consumer over `ctx.query.execute`.

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../../data/tool-search-data-sources) (and through it [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash)):

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

The core EXECUTION flow (`executeQuery` / `projectOutcome` / `pollToSettlement`) is exported pure so the 3-state handling is testable against a stub `QueryEngine`, and the P4c(c) smoke calls it against the real provider (maxc-backed sidecar -> real engine rows), proving the tool path — not a direct sidecar call. Registration is effect-based (disposing the plugin fiber unregisters the tool); the schema flows into system-prompt assembly automatically. See [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md).

## Config

| field            | type     | default | notes                                                                                  |
| ---------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `maxPolls`       | `number` | `60`    | Max poll iterations for a pending query before returning the pending state honestly.   |
| `pollIntervalMs` | `number` | `2000`  | Delay between `getProgress` polls in ms.                                               |
| `maxDisplayRows` | `number` | `50`    | Max rows rendered into model context (display cap); the engine row-cap is deferred.   |

The query engine is **not** a config field: it is `ctx.query` (the query provider mounted by the data-agent bundle). `scope_id` is the per-game access-isolation scope (the trust boundary); production hardening sources it from `ctx.identity` rather than the model.

## Verification

```sh
tsc -b packages/query/query-tool/tsconfig.json      # typecheck
pnpm vitest run packages/query/query-tool            # 3-state spec (stub engine)
pnpm verify-cordis-config                            # preset + bundle mounts resolve
node --import tsx/esm packages/query/query-tool/dev/query-tool-smoke.ts  # tool -> real engine (4336)
```

The smoke boots a cordis ctx + fake credentials + the query provider (maxc-sidecar), captures the `query_data` tool def the plugin registers, and calls its `execute` with RBI case `eval_10000251_037`'s expected SQL, asserting the result reproduces `expected.result_value` (dau=4336) — through the tool path, not a direct sidecar call. The preset row (`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, `tool-query-data`) is uncommented now that this package ships; the phase-gate guard's EXECUTION whitelist already names `query_data`, so registering it makes it callable in that phase.

## Model Experience

### The `query_data` tool call

#### What the model sees

The `query_data` tool schema (name, description, the `sql` and `scope_id` parameters, and the 3-state `output` object: `state` + `columns`/`rows`/`rowCount`/`truncated` for completed, `instanceId`/`stage`/`elapsedMs` for pending, `error`/`failureKind` for failed) flows into system-prompt assembly automatically once the plugin mounts, so the model discovers the tool alongside the rest of the `EXECUTION`-phase whitelist. When the model invokes it, `execute` returns one canonical JSON value that `output.render` projects into model-facing text: a TSV table (columns header + rows, display-capped to `maxDisplayRows` with an elision + row-count summary) for completed, a `Query still running; instance <id>…` line for pending (poll budget exhausted), or a `Query failed (<failureKind>): <error>` line for failed.

#### Token effect

The rendered result text is the per-call token charge; the `query_data` schema rides the system prompt rather than the turn payload. A completed result scales with `maxDisplayRows` (default 50) plus the columns header — the display cap bounds the tokens the agent pays per query regardless of how many rows the engine returned. The engine row-cap (maxc `--max-rows`) is deferred to the engine-wrapper, so today the tool display-caps rather than truncates at the source.

#### KV Cache effect

Tool results are append-only: the rendered result text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn. A pending result (poll budget exhausted) is a short fixed line, so an un-settled query adds minimal tokens before the agent re-issues or attaches.

## Known Limitations and Deferred Work

- **Guard chain deferred (P4c(b))** — the engine-wrapper CostGuard (`estimate_cost`), TimeoutGuard (signal), RetryGuard (infra vs model attempt), and OrphanReaper (dispose async-job cleanup) are deferred; this tool is the dumb model-facing consumer, so a runaway query is display-capped, not cost- or row-gated at the source.
- **`mode` is a prototype-only knob** — `QueryRequest.mode` (`fast`/`slow`/`blocking`/`fail`) is stand-in-sidecar machinery; the maxc provider derives pending vs completed from real engine execution and carries no mode, so this tool does not expose it to the model.
- **Not fully runnable end-to-end yet** — the preset registers `query_data` (this package) and `search_data_sources`, but `load_table_definition` / `load_event_definition` (ctx.schema, P6b) and the `present_*` INTERPRETATION delivery tools are deferred, so the data-agent profile is not yet a complete four-phase run on its own (tracked by G1c).
- **Pending polling is bounded, not push** — `ctx.query` offers no push notifications (G4 HOLE-D); a pending query is polled via `getProgress` up to `maxPolls`, then an honest pending is returned (the agent re-issues; no `attach` model-facing tool yet).
