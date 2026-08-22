# `@deepseek-ai/dsh-tool-critique-sql`

Model-facing `critique_sql_tool`: **folded-regex SQL critic (sqlSyntaxGate) over the phase-gate's per-agent critic context** for the data agent's `GENERATION` phase. The agent calls it to critique a SQL candidate (table in candidates / ds partition required / no SELECT * / GET_JSON_OBJECT field in event_params) before calling `query_data`.

This is the **(b) root-cause fix** — it makes F2 (the same-source gate) satisfiable: the tool returns `{ confidence, findings, sql }` where `sql` is the normalized critiqued SQL. The phase-gate's `captureToolData` captures `last_critique` from `confidence` AND `last_sql` from `sql`. So when the model re-critiques a corrected SQL (after a `TABLE_NOT_FOUND`), `last_sql` updates → F2 passes the corrected SQL → execution → rows.

It mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) for the [`@deepseek-ai/dsh-tools`](../../core/tools) registration shape (`defineTool` + `ctx.tools.register`).

## Status: registered + callable

The tool is registered by the data-agent preset (`tool-critique-sql` row, uncommented) and named in the phase-gate `GENERATION` whitelist. It probes `ctx.get('criticCtx')`: when the phase-gate is mounted it returns the per-agent `CriticCtx` (candidate tables, event params, partition cols harvested from `search_data_sources` / `load_*`); when no phase-gate is mounted (unit tests, a profile without the service) it degrades to empty sets — the honest "cannot verify table grounding" state (every table is flagged as not-in-candidates → low confidence).

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
