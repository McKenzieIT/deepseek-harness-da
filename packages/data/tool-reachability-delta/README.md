# `@deepseek-ai/dsh-tool-reachability-delta`

Model-facing `reachability_delta` tool: **compute how many new asset pairs become newly reachable via joins if a proposed relation is added to the knowledge graph**. The agent calls it to assess the impact of adding a new relation before committing the edit.

It is a model-facing wrapper over the [`ctx.evidenceQuery`](../evidence-query) `reachabilityDelta` substrate (shipped with the `@deepseek-ai/dsh-evidence-query` service). It mirrors [`@deepseek-ai/dsh-tool-load-table-definition`](../tool-load-table-definition) and [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) for the [`@deepseek-ai/dsh-tools`](../../core/tools) registration shape (`defineTool` + `ctx.tools.register`).

## Status: registered + callable; ctx.evidenceQuery optional

The tool is registered by the data-agent preset and probes `ctx.get('evidenceQuery')`: when the [`@deepseek-ai/dsh-evidence-query`](../evidence-query) service is mounted it computes the delta against the live relation graph; when no provider is mounted (a profile without the service, or the unit tests) it returns an honest `ok: false` "evidenceQuery service not mounted" result — callable but unwired, not a broken mount (the same thin-default state the other `ctx.get`-probing tools use before their service mounts).

The `source_id`/`target_id`/`type`/`on` parameters are model input (untrusted). `execute` guards `exec.signal.aborted` before computing.

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-load-table-definition`](../tool-load-table-definition) and [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources):

```ts ignore-check
export const name = 'tool-reachability-delta'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'reachability_delta',
    description: 'Compute reachability delta: ...',
    parameters: { source_id, target_id, type, on },
    output: { schema: { ... }, render: (_args, value) => [...] },
    execute(args, exec) {
      if (exec.signal.aborted) throw new Error('reachability_delta aborted')
      const evidenceQuery = ctx.get('evidenceQuery')
      if (!evidenceQuery) return { ok: false, ..., message: 'evidenceQuery service not mounted' }
      const result = evidenceQuery.reachabilityDelta(proposed)
      return { ok: true, ...result }
    },
  }))
}
```

Registration is effect-based (disposing the plugin fiber unregisters the tool); the schema flows into system-prompt assembly automatically. `execute` returns one canonical JSON value (`{ ok, proposedRelation, newlyReachableCount, newlyReachable, message? }`); `output.render` turns it into model-facing text.

## Config

No knobs. The relation graph is owned by the [`ctx.evidenceQuery`](../evidence-query) service mount, not by this tool.

## Verification

```sh
tsc -b packages/data/tool-reachability-delta/tsconfig.json
pnpm vitest run packages/data/tool-reachability-delta
pnpm verify-cordis-config
```

## Model Experience

### The `reachability_delta` tool call

#### What the model sees

The `reachability_delta` tool schema (name, description, the `source_id`/`target_id`/`type`/`on` parameters, and the `ok`/`newlyReachableCount`/`message` output shape) flows into system-prompt assembly automatically once the plugin mounts, so the model discovers the tool alongside the rest of the phase whitelist. When the model invokes it, `execute` returns one canonical `{ ok, proposedRelation, newlyReachableCount, newlyReachable, message? }` JSON value that `output.render` projects into model-facing text: a `Proposed relation: <source> —[<type>]→ <target>` line, the optional join condition, a `Newly reachable pairs: N` line, then up to 20 `from ↔ to` pair lines (and a `... +M more` truncation marker), or the single-line not-mounted message when the service is absent.

#### Token effect

The rendered delta text in the tool result is the only per-call token charge for this tool; the `reachability_delta` schema rides the system prompt rather than the turn payload. The text scales with `newlyReachableCount` but is capped at 20 displayed pairs (the `+M more` marker summarizes the remainder). The full pair list is retained in the JSON value's `newlyReachable` array, but the model-facing text is bounded.

#### KV Cache effect

Tool results are append-only: the delta text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn.

## Known Limitations and Deferred Work

- **ctx.evidenceQuery optional (callable but unwired until mounted)** — the tool probes `ctx.get('evidenceQuery')` and returns an honest `ok: false` "evidenceQuery service not mounted" result when the [`@deepseek-ai/dsh-evidence-query`](../evidence-query) service is not mounted (a profile without the service, or the unit tests). Wiring the bundle's `evidence-query` service row is a bundle-level concern; this tool's contract is unchanged either way.
- **Display cap (20 pairs)** — only the first 20 newly-reachable pairs are rendered in the model-facing text; the remainder is summarized by a `... +M more` marker. The complete pair list is retained in the JSON value's `newlyReachable` array, so callers reading the value directly see all pairs. For very large deltas the model sees a bounded summary.
- **`type` cast at the boundary** — the `type` parameter is declared `string` in the schemastery schema and cast to the `ProposedRelation['type']` union (`joins` | `derived_from` | `related_to`) inside `execute`. Invalid type strings are forwarded to the substrate's `reachabilityDelta`; the tool does not enumerate-validate the union (the substrate governs behavior for unknown types).
- **Read-only (no Tier-2 audit)** — the tool computes a delta against a hypothetical relation and does not mutate the knowledge graph, so no Tier-2 audit write applies (unlike the `edit_definition`/`revert_edit` write tools).
- **Abort guard is pre-compute only** — `execute` throws `reachability_delta aborted` if `exec.signal.aborted` before computing; the substrate `reachabilityDelta` call is synchronous and is not itself interruptible mid-computation.
