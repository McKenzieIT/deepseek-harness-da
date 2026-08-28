# `@deepseek-ai/dsh-tool-critique-sql`

Model-facing `critique_sql_tool`: **folded-regex SQL critic (sqlSyntaxGate) over the phase-gate's per-agent critic context** for the data agent's `GENERATION` phase. The agent calls it to critique a SQL candidate (table in candidates / ds partition required / no SELECT * / GET_JSON_OBJECT field in event_params) before calling `query_data`.

This is the **(b) root-cause fix** — it makes F2 (the same-source gate) satisfiable: the tool returns `{ confidence, findings, sql }` where `sql` is the normalized critiqued SQL. The phase-gate's `captureToolData` captures `last_critique` from `confidence` AND `last_sql` from `sql`. So when the model re-critiques a corrected SQL (after a `TABLE_NOT_FOUND`), `last_sql` updates → F2 passes the corrected SQL → execution → rows.

It mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) for the [`@deepseek-ai/dsh-tools`](../../core/tools) registration shape (`defineTool` + `ctx.tools.register`).

## Status: registered + callable

The tool is registered by the data-agent preset (`tool-critique-sql` row, uncommented) and named in the phase-gate `GENERATION` whitelist. It probes `ctx.get('criticCtx')`: when the phase-gate is mounted it returns the per-agent `CriticCtx` (candidate tables, event params, partition cols harvested from `search_data_sources` / `load_*`); when no phase-gate is mounted (unit tests, a profile without the service) it falls back to empty sets — with no candidate tables the critic flags every referenced table as `table_not_in_candidates`, so the confidence falls below the 0.6 floor and the critique BLOCKS `GENERATION` (fail-closed, not fail-open; the intended fail-open pass-through is deferred — see Known Limitations).

Phase 1: the tool calls the EXISTING nl2sql-engine `critiqueSql` (the folded regex critic) + `extractSqlCandidate` and returns a confidence derived from the findings (errors: -0.5 each, warnings: -0.15 each; the gate floor is 0.6). The full 3-layer critic (sqlglot AST + JSON-path + registry) is a later Phase 2 refinement.

## The criticCtx injection design

The critic guard context (`{candidateTables, eventParams, partitionCols}`) is the per-agent state the phase-gate harvested from `search_data_sources` / `load_*` (`captureToolData`). This tool reads it via `ctx.get('criticCtx')` — the `CriticCtxService` the phase-gate registers (`packages/data/phase-gate`). §2.3 (Consumer): the tool defines a structural `CriticCtxProvider` interface + probes `ctx.get` (soft — `undefined` when the phase-gate is not mounted), never importing the phase-gate Provider package. The Cordis `Service[symbols.filter]` check passes for non-isolated names (`criticCtx` is not in the isolate map, so both the registering isolate-realm ctx and the querying parent-realm ctx resolve `undefined` → `undefined === undefined` → visible).

## Registration shape

```ts ignore-check
export const name = 'tool-critique-sql'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'critique_sql_tool',
    description: '...',
    parameters: { sql: { type: 'string', required: true, ... }, question: { ... } },
    output: { schema: { ... }, render: (_args, value) => [...] },
    async execute(args, exec) {
      const provider = ctx.get('criticCtx') as CriticCtxProvider | undefined
      const agentId = exec.agent !== undefined ? String(exec.agent.id) : undefined
      const criticCtx = provider !== undefined && agentId !== undefined
        ? (provider.forAgent(agentId) ?? EMPTY_CRITIC_CTX)
        : EMPTY_CRITIC_CTX
      return critiqueSqlResult(args.sql, criticCtx)
    },
  }))
}
```

## Config

No knobs. The critic guard context is owned by the phase-gate's per-agent state (`criticCtx` service), not this tool.

## Verification

```sh
tsc -b packages/data/tool-critique-sql/tsconfig.json
pnpm vitest run packages/data/tool-critique-sql
pnpm verify-cordis-config
```

## Model Experience

### The `critique_sql_tool` tool call

#### What the model sees

The `critique_sql_tool` tool schema (name, description, the `sql` and `question` parameters, and the `{ confidence, sql?, findings }` output object) flows into system-prompt assembly automatically once the plugin mounts, so the model discovers the tool alongside the rest of the `GENERATION`-phase whitelist. When the model invokes it, `execute` returns one canonical `{ confidence, sql?, findings }` JSON value that `output.render` projects into model-facing text via `formatCritique`: a `confidence: <0.00-1.00>` line, the `sql: <normalized>` line (omitted when no SELECT was extracted), and a `findings:` block listing each `[severity] rule: message` (or `findings: none (SQL passed all critic checks)` when the SQL is clean).

#### Token effect

The rendered critique text in the tool result is the only per-call token charge for this tool; the `critique_sql_tool` schema rides the system prompt rather than the turn payload. The result is a small fixed-size block (one confidence line, one optional sql line, one line per finding), so it does not scale with SQL length.

#### KV Cache effect

Tool results are append-only: the critique text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn.

## Known Limitations and Deferred Work

- **No-grounding path blocks (fail-closed), not fail-open** — when the phase-gate is not mounted or the agent has no harvested critic state, the tool falls back to empty candidate tables; the table rule then flags every referenced table as `table_not_in_candidates`, driving confidence below the 0.6 floor and BLOCKING `GENERATION`. The intended fail-open pass-through (skip the table/partition/json rules on empty guard data and return a passing verdict) is deferred to a later phase. Mounting the tool inside the phase-gating isolate group (so `ctx.get('criticCtx')` resolves the per-agent state) is the supported configuration; no real-entry-path test yet covers that isolate resolution.
- **Phase 1 folded-regex critic only** — the tool calls the existing nl2sql-engine `critiqueSql` (folded-regex `sqlSyntaxGate`); the full 3-layer critic (sqlglot AST + JSON-path + registry) is a later Phase 2 refinement.
