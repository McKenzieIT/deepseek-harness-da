# `@deepseek-ai/dsh-tool-search-data-sources`

English | [中文](README.zh.md)

Model-facing `search_data_sources` tool: **BM25 schema-linking over the semantic layer** for the data agent's `UNDERSTANDING` phase. The agent calls it to find which data sources (DWS tables / event ODS tables) match a natural-language question before it writes SQL.

This is the **P13b deferred sub-item** — the FIRST model-facing tool registration in the data-agent effort — so it also grounds the [`@deepseek-ai/dsh-tools`](../../core/tools) tool-registration API (`defineTool` + `ctx.tools.register`) for every later data-agent tool (`load_table_definition` / `load_event_definition` / `query_data` / `critique_sql` / `evaluate_sql_quality` / `present_*`).

## Status: soft-fallback retrieval

Per **P13b grilling Q1**, the base linker is the local `Bm25Linker` exported from [`@deepseek-ai/dsh-nl2sql-engine`](../nl2sql-engine) — the same building block the engine uses. `ctx.nl2sql` exposes only `getConventions` (no retrieval method), so the tool calls `Bm25Linker` directly as the Q1 thin default. The shipped `execute` soft-probes four additive swap paths (all additive; none changes the tool's contract):

- **P5b `ctx.retrieval`** (shipped) — when the `ctx.retrieval` seam is registered (the bundle mounts `dsh-retrieval-inproc`), the async hybrid provider is used instead of the sync local `Bm25Linker`.
- **D2e `ctx.schema` enriched corpus** (shipped) — when the semantic-layer `ctx.schema` provider is mounted, an enriched `Bm25Linker` is built and cached over the schema corpus (events' params_fields + terminology slang packed into the indexed description), with **D2f `corpusVersion()` cache-invalidation** that rebuilds the linker after a mid-session write instead of staying stale until reboot.
- **Graph expansion** (shipped) — `applyGraphExpansionAndJoins` adds 1-hop `joins`/`derived_from` neighbors via `ctx.schema.getRelationGraph()` and emits join constraint strings, soft-falling back to the original candidates when no graph is available.
- **P15a LLM query expansion** (shipped) — `expandQuery` rewrites the question for BM25 recall via `ctx.llm` (config: `queryExpansion`/`expansionProvider`/`expansionModel`), gracefully degrading to the original query when no LLM is mounted or on any error.

With no `ctx.schema`/`ctx.retrieval` provider mounted, the corpus is the empty Q1 thin default; an empty corpus returns no candidates, which is an honest "callable but unwired" state, not a broken mount (the preset's own note: an unregistered whitelisted tool is simply uncallable).

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash) (the production-grade tool example):

```ts ignore-check
export const name = 'tool-search-data-sources'
export const inject = ['tools']
export const Config: z<Config> = z.object({
  topK: z.number().default(20),
  queryExpansion: z.boolean().default(true),
  expansionProvider: z.string().default('aga'),
  expansionModel: z.string().default('qwen-flash'),
})

export function apply(ctx: Context, config: Config = {}): void {
  const linker = new Bm25Linker([]) // Q1 thin default; swapped to ctx.schema (D2e) / ctx.retrieval (P5b) when mounted
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

| field               | type      | default      | notes                                                          |
| ------------------- | --------- | ------------ | -------------------------------------------------------------- |
| `topK`              | `number`  | `20`         | Default candidate count when the call omits `top_k` (D2h: raised 5→20). |
| `queryExpansion`   | `boolean` | `true`       | Enable LLM query expansion before BM25 retrieval (P15a).      |
| `expansionProvider` | `string`  | `aga`        | LLM provider route for query expansion (P15a).                |
| `expansionModel`   | `string`  | `qwen-flash` | LLM model id for query expansion (P15a).                       |

The data-source corpus is **not** a config field: it is the empty Q1 thin default when no `ctx.schema`/`ctx.retrieval` provider is mounted, sourced from `ctx.schema` (D2e enriched corpus) or `ctx.retrieval` (P5b) when those providers mount.

## Verification

```sh
tsc -b packages/data/tool-search-data-sources/tsconfig.json   # typecheck
pnpm vitest run packages/data/tool-search-data-sources         # spec
pnpm verify-cordis-config                                      # preset mount resolves
```

The preset row (`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, `tool-search-data-sources`) is uncommented once this package ships; the phase-gate guard's `UNDERSTANDING` whitelist already names `search_data_sources`, so registering it makes it callable in that phase.

## Model Experience

### The `search_data_sources` tool call

#### What the model sees

The `search_data_sources` tool schema (name, description, the `query` and `top_k` parameters, and the `candidates` output array) flows into system-prompt assembly automatically once the plugin mounts, so the model discovers the tool alongside the rest of the `UNDERSTANDING`-phase whitelist. When the model invokes it, `execute` returns one canonical `{ candidates: [...] }` JSON value that `output.render` projects into model-facing text: a numbered list (`1. <id> (score <score>) - <description>`) per ranked data source, or the single line `No matching data sources found.` when the corpus is empty (the Q1 thin default when no schema/retrieval provider is mounted).

#### Token effect

The rendered `candidates` text in the tool result is the only per-call token charge for this tool; the `search_data_sources` schema rides the system prompt rather than the turn payload. With the empty Q1 corpus the result is one short line, and once `ctx.schema` (D2e) or `ctx.retrieval` (P5b) populates the corpus the result scales with `top_k` (default 20).

#### KV Cache effect

Tool results are append-only: the `candidates` text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn.

## Known Limitations and Deferred Work

- **Empty corpus when no provider mounts (Q1 thin default)** — the base `Bm25Linker` corpus is empty when neither `ctx.schema` (D2e) nor `ctx.retrieval` (P5b) is mounted; an empty corpus returns no candidates (honest "callable but unwired" state). Mounting either provider populates the corpus.
- **No `ctx.nl2sql` retrieval method** — `ctx.nl2sql` exposes only `getConventions`, so the base path calls `Bm25Linker` directly rather than through the seam; the `ctx.retrieval`/`ctx.schema` swap paths bypass this.
- **Vector store backends deferred** — sqlite-vec / Qdrant vector-store substrates are not yet wired; the `ctx.retrieval` path currently resolves to the in-process hybrid retriever (`dsh-retrieval-inproc`) when that provider is mounted.
