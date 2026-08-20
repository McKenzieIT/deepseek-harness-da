# `@deepseek-ai/dsh-tool-search-data-sources`

Model-facing `search_data_sources` tool: **BM25 schema-linking over the semantic layer** for the data agent's `UNDERSTANDING` phase. The agent calls it to find which data sources (DWS tables / event ODS tables) match a natural-language question before it writes SQL.

This is the **P13b deferred sub-item** — the FIRST model-facing tool registration in the data-agent effort — so it also grounds the [`@deepseek-ai/dsh-tools`](../../core/tools) tool-registration API (`defineTool` + `ctx.tools.register`) for every later data-agent tool (`load_table_definition` / `load_event_definition` / `query_data` / `critique_sql` / `evaluate_sql_quality` / `present_*`).

## Status: Q1 thin default

Per **P13b grilling Q1**, the BM25 linker is the local `Bm25Linker` exported from [`@deepseek-ai/dsh-nl2sql-engine`](../nl2sql-engine) — the same building block the engine uses. `ctx.nl2sql` exposes only `getConventions` (no retrieval method), so the tool calls `Bm25Linker` directly. The corpus is **empty until the P6b `ctx.schema` substrate ships**; an empty corpus returns no candidates, which is an honest "callable but unwired" state, not a broken mount (the preset's own note: an unregistered whitelisted tool is simply uncallable).

Two additive swaps land later, both leaving this tool's contract unchanged:

- **P5b** ships `ctx.retrieval` → the engine's `RetrievalLinker` swaps to it; this tool may then call `ctx.retrieval` instead of the local `Bm25Linker`.
- **P6b** ships `ctx.schema` → the corpus is sourced from `ctx.schema.discover` instead of the empty default.

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash) (the production-grade tool example):

```ts
export const name = 'tool-search-data-sources'
export const inject = ['tools']
export const Config: z<Config> = z.object({ topK: z.number().default(5) })

export function apply(ctx: Context, config: Config = {}): void {
  const linker = new Bm25Linker([]) // Q1 thin default; swap to ctx.schema.discover (P6b)
  ctx.tools.register(defineTool({
    name: 'search_data_sources',
    description: '...',
    parameters: { query: {...}, top_k: {...} },
    output: { schema: {...}, render: (_args, value) => [...] },
    async execute(args, exec) { return { candidates: searchDataSources(linker, args.query, ...) } },
  }))
}
```

Registration is effect-based (disposing the plugin fiber unregisters the tool); the schema flows into system-prompt assembly automatically. `execute` returns one canonical JSON value (`{ candidates: [...] }`); `output.render` turns it into model-facing text. See [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md).

## Config

| field  | type     | default | notes                                                     |
| ------ | -------- | ------- | --------------------------------------------------------- |
| `topK` | `number` | `5`     | Default candidate count when the call omits `top_k`.      |

The data-source corpus is **not** a config field: it is the empty thin default now, swapped to `ctx.schema.discover` when P6b ships.

## Verification

```sh
tsc -b packages/data/tool-search-data-sources/tsconfig.json   # typecheck
pnpm vitest run packages/data/tool-search-data-sources         # spec
pnpm verify-cordis-config                                      # preset mount resolves
```

The preset row (`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, `tool-search-data-sources`) is uncommented once this package ships; the phase-gate guard's `UNDERSTANDING` whitelist already names `search_data_sources`, so registering it makes it callable in that phase.
