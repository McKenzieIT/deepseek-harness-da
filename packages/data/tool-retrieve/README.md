# `@deepseek-ai/dsh-tool-retrieve`

English | [中文](README.zh.md)

Model-facing `retrieve` tool: **the on-demand retrieval escape-hatch** for the data agent. The pipeline prefetches data-source candidates in the `UNDERSTANDING` phase (`search_data_sources`); `retrieve` is the additive escape-hatch the agent calls when it detects the prefetch missed (an ambiguous question, or a business synonym the prefetch did not bridge). It returns ranked candidate data sources with `id`, `score`, and `description`.

This is the **D2c-impl** ship — the escape-hatch the D2c "keep (b)" decision commits to (per the retrieval-consumer-model prescription (c) *guided-agentic-hybrid*: (a) the deterministic prefetch is the default path; (b) `retrieve` is the additive escape-hatch plugin, NOT a parallel default). It mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) (the first model-facing tool, P13b) for the [`@deepseek-ai/dsh-tools`](../../core/tools) registration shape (`defineTool` + `ctx.tools.register`) + the D2e schema soft-fallback + cached enriched `Bm25Linker`.

## Status: shipped but DORMANT (opt-in, dormant-until-mount)

The tool **package** is shipped (registers `retrieve` via `defineTool` + `ctx.tools.register` when mounted), but the preset row that mounts it (`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, `tool-retrieve`) is **commented** — so default boot does NOT mount it, the `retrieve` tool is not registered, and the agent runs **pipeline-only** (the current state, no regression). This mirrors the D2e dormant-until-mount + P5b opt-in-seam pattern.

Activation (a separate, later gate — P7b / a follow-up) is three coordinated steps:
1. **Uncomment** the `tool-retrieve` preset row.
2. **Add `retrieve` to the phase-gate tool whitelist** (the phase-gate guard rejects non-whitelisted tools, so registering the package alone does not make it callable).
3. **Land the persona** (P7b) that teaches the model *"prefer the context already surfaced by `search_data_sources`; call `retrieve` only when the gap is obvious, with a refined query"* — to avoid double-retrieval redundancy (the agent re-fetching what the pipeline already surfaced).

Shipping is **additive/reversible** (the D2c asymmetric argument — keep is cheap + reversible; regress needs ≥85-90% strict + <15% ambiguity that only a real embedder reaches): unmount / unship if [D2c-revisit](../../../wayfinder/data-agent/tickets/phase-misc/D2c-revisit-regress-reeval.md) regresses.

## Soft-fallback chain (mirrors `search_data_sources`)

`retrieve` uses the **same** soft-fallback chain as `search_data_sources`, so its recall == `search_data_sources`'s recall (same linker, same corpus):

1. **`ctx.get('retrieval')`** (P5b seam) — when a user mounts `dsh-retrieval-inproc` + a real embedder, the async hybrid provider (`BM25 + vector + RRF`, `InferenceError` → BM25-only degrade) is used. `inject` stays `['tools']` (NOT `'retrieval'`) so the tool loads without a retrieval provider; `ctx.get('retrieval')` is the safe probe (`undefined` when no provider is registered).
2. **`ctx.get('schema')`** (D2e) — when the semantic-layer service is mounted, a cached enriched `Bm25Linker` (params_fields + terminology slang packed into `description`; NOT domain — see D2e) is built once per `ctx.schema` (`WeakMap` cache) and used.
3. **Empty `Bm25Linker`** — the Q1-thin default: callable but unwired (no corpus → no candidates), not a broken mount.

**No FakeHash, no default FakeReranker** (D2d constraints): the soft-fallback keeps the default on BM25-only (~41.9% real default; mounting FakeHash would regress prefetch 41.9%→32.3%, self-inflicted — D2d re-frame). The reranker peer stays injectable for a real cross-encoder a user self-deploys. The hybrid plane waits for a real embedder (D2c-revisit).

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources):

```ts ignore-check
export const name = 'tool-retrieve'
export const inject = ['tools']
export const Config: z<Config> = z.object({ topK: z.number().default(20) })

export function retrieve(linker: RetrievalLinker, query: string, topK: number): RetrieveHit[] {
  const hits = linker.retrieve(query, { topK, mode: 'bm25-only' })
  return hits.map(h => ({ id: h.id, score: h.score, /* +description? */ mode: h.mode }))
}

export function apply(ctx: Context, config: Config = {}): void {
  const defaultTopK = config.topK ?? 20
  const linker: RetrievalLinker = new Bm25Linker([])   // Q1-thin default
  ctx.tools.register(defineTool({
    name: 'retrieve',
    description: 'Retrieve relevant data-source context on demand — the escape-hatch …',
    parameters: { query: { type: 'string', required: true }, top_k: { type: 'number' } },
    output: { schema: { /* candidates[] */ }, render: (_args, value) => [...] },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('retrieve aborted before linking')
      const topK = args.top_k ?? defaultTopK
      const retrieval = ctx.get('retrieval') as RetrievalService | undefined
      if (retrieval !== undefined) { /* async hybrid */ }
      const schemaProbe = ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
      if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') {
        /* cached enriched Bm25Linker */
      }
      return { candidates: retrieve(linker, args.query, topK) }
    },
  }))
}
```

Registration is effect-based (disposing the plugin fiber unregisters the tool). `execute` returns one canonical JSON value (`{ candidates: [...] }`); `output.render` turns it into model-facing text (a ranked list, or `No matching data sources found.`).

## Config

| option | type | default | note |
|---|---|---|---|
| `topK` | `number` | `20` | Default candidate count when the call omits `top_k` (parity with `search_data_sources`; D2h raised 5→20). The agent may pass a higher `top_k` when re-searching a gap. |

## Verification

```sh
(cd packages/data/tool-retrieve && tsc --noEmit)
pnpm vitest run packages/data/tool-retrieve
```

12 specs (R1–R12) cover BM25 linking, the `top_k` cap, the empty thin-default, registration, the `ctx.retrieval` soft-fallback (R8), the `ctx.schema` enriched soft-fallback (R9), the abort guard (R10), the config `topK` default (R11), and the D2h 5→20 default raise (R12) — mirroring `tool-search-data-sources`'s S1–S9 + three retrieve-specific tests.

## Model Experience

### The `retrieve` tool call

#### What the model sees

The `retrieve` tool schema (name, description, the `query` and `top_k` parameters, and the `candidates` output array) flows into system-prompt assembly automatically once the plugin mounts (the preset row is commented by default — see Status), so a model whose bundle mounts the tool discovers it alongside the rest of its phase whitelist. When the model invokes it, `execute` returns one canonical `{ candidates: [...] }` JSON value that `output.render` projects into model-facing text: a numbered list (`1. <id> (score <score>) - <description>`) per ranked data source, or the single line `No matching data sources found.` when the corpus is empty (the Q1 thin default until `ctx.schema` mounts).

#### Token effect

The rendered `candidates` text in the tool result is the only per-call token charge for this tool; the `retrieve` schema rides the system prompt rather than the turn payload. With the empty Q1 corpus the result is one short line, and once `ctx.schema` mounts the enriched corpus the result scales with `top_k` (default 20).

#### KV Cache effect

Tool results are append-only: the `candidates` text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn.

## Known Limitations and Deferred Work

- **Dormant until mounted** — the preset `tool-retrieve` row is commented; default boot does not register the tool (pipeline-only, no regression). Activation = uncomment the preset row + add `retrieve` to the phase-gate whitelist + land the P7b persona that teaches when to call it (see Status). The package + its tests + typecheck ship now; the activation gate is the follow-up.
- **Recall == `search_data_sources`** — `retrieve` hits the same BM25 corpus + linker as `search_data_sources`, so no new measurement is needed: the D2e-audited floor (54.8% strict / 58.1% loose once `ctx.schema` mounts the enriched corpus; 41.9% on the empty thin-default) applies to `retrieve` too. Both are still << the 85-90% regress bar — the escape-hatch is the point (a cheap floor, not a regress-gate pass).
- **No real embedder** — the hybrid plane stays for a real embedder a user self-deploys (D2c-revisit). FakeHash is deliberately NOT mounted (D2d: self-regression); FakeReranker is NOT defaulted (D2d F2: harmful on implicit cases).
- **No dedicated corpus** — `retrieve` retrieves the same data-source corpus the prefetch uses. A broader context corpus (SQL examples, DDL) is a future data-quality extension, not this ship.
- **Persona not landed here** — the "prefer prefetch; call `retrieve` only on an obvious gap" guidance is a P7b deliverable, not bundled with this tool. Without it, mounting `retrieve` risks double-retrieval redundancy — the dormant-by-default ship avoids that regression.
