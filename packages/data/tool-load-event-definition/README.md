# `@deepseek-ai/dsh-tool-load-event-definition`

English | [中文](README.zh.md)

Model-facing `load_event_definition` tool: **load a validated event (埋点) definition from the semantic-layer substrate** for the data agent's `UNDERSTANDING`/`GENERATION` phase. The agent calls it to ground SQL in the real event schema (params_fields, metrics, disambiguation, external dimension references) before writing or critiquing a query over an event ODS table.

This is the **P6b deferred follow-up** ("load_* 接入") — the model-facing wrapper over the [`ctx.schema`](../semantic-layer) `loadEventDefinition` substrate (shipped in P6b, commit 88524504f8). It mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) (P13b commit 0e1a0fdf25) and [`@deepseek-ai/dsh-tool-load-table-definition`](../tool-load-table-definition) for the [`@deepseek-ai/dsh-tools`](../../core/tools) registration shape (`defineTool` + `ctx.tools.register`).

## Status: registered + callable; ctx.schema mount pending

The tool is registered by the data-agent preset (`tool-load-event-definition` row, uncommented) and named in the phase-gate `UNDERSTANDING`/`GENERATION` whitelist, so the model can call it in those phases. It probes `ctx.get('schema')`: when the `@deepseek-ai/dsh-semantic-layer` service is mounted it returns the projected definition on a hit; when no provider is mounted (a profile without the service, or the unit tests) it returns an honest `found: false` "not mounted" result — callable but unwired, not a broken mount (the same thin-default state `tool-search-data-sources` uses before its retrieval provider mounts).

The `ctx.schema` bundle service row (`packages/bundle/data-agent/cordis.patch.yml`, `semantic-layer`) is a **deferred follow-up**: it was held back from this ship because a concurrent session was actively editing the bundle patch + lockfile (collision-avoidance). Uncommenting that row + adding the `dsh-semantic-layer` bundle dep (which needs a `pnpm install` to keep the lockfile in sync) mounts `ctx.schema` and wires this tool to the real substrate; until then it returns "not mounted". With the default empty `semanticRoot`, a mounted substrate scans no `events/` dir and returns `null` (not-found, no crash); a real substrate directory is configured at the profile/runtime level.

The `event_name` parameter is model input (untrusted). P6b code-review #5 deferred a definition-name path-traversal guard to "load_* 接入"; this tool validates the name at the boundary (rejects `/`, `\`, `..`, NUL) for intranet-security-first defense-in-depth.

## Registration shape

Mirrors [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) and [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash):

```ts ignore-check
export const name = 'tool-load-event-definition'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'load_event_definition',
    description: '...',
    parameters: { event_name: { type: 'string', required: true, description: '...' } },
    output: { schema: { ... }, render: (_args, value) => [...] },
    async execute(args, exec) {
      const schema = ctx.get('schema') as SemanticLayerService | undefined
      return loadEventDefinitionResult(schema, args.event_name)
    },
  }))
}
```

Registration is effect-based (disposing the plugin fiber unregisters the tool); the schema flows into system-prompt assembly automatically. `execute` returns one canonical JSON value (`{ found, event?, message? }`); `output.render` turns it into model-facing text. See [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md).

## Config

No knobs. The substrate owns the data (the `semanticRoot` + scope are configured on the `ctx.schema` service mount, not on this tool). The path-traversal name guard is unconditional.

## Verification

```sh
tsc -b packages/data/tool-load-event-definition/tsconfig.json
pnpm vitest run packages/data/tool-load-event-definition
pnpm verify-cordis-config
```

The preset row (`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, `tool-load-event-definition`) is uncommented once this package ships; the phase-gate guard's `UNDERSTANDING`/`GENERATION` whitelist already names `load_event_definition`, so registering it makes it callable in those phases.

## Model Experience

### The `load_event_definition` tool call

#### What the model sees

The `load_event_definition` tool schema (name, description, the `event_name` parameter, and the `found`/`event`/`message` output shape) flows into system-prompt assembly automatically once the plugin mounts, so the model discovers the tool alongside the rest of the `UNDERSTANDING`/`GENERATION`-phase whitelist. When the model invokes it, `execute` returns one canonical `{ found, event?, message? }` JSON value that `output.render` projects into model-facing text: a multi-line definition block (`event: <name>`, description, `event_filter`, `params_fields:` list, `metrics:`, `disambiguation:`, `external_refs:`) on a hit, or the single-line not-found / not-mounted / invalid-name message otherwise.

#### Token effect

The rendered definition text in the tool result is the only per-call token charge for this tool; the `load_event_definition` schema rides the system prompt rather than the turn payload. The text carries the SQL-grounding fields (params_fields, metrics, disambiguation, external dimension refs); workflow-state fields (confirmation / coverage) are omitted from the text though the JSON value carries the full validated definition. The cost scales with the event's params_fields/metric count.

#### KV Cache effect

Tool results are append-only: the definition text follows the reusable request prefix and does not invalidate prior cache entries. The tool schema is part of that stable system-prompt prefix across turns, so registering or calling the tool adds no prefix churn.

## Known Limitations and Deferred Work

- **ctx.schema bundle mount deferred** — the bundle's `semantic-layer` service row stays commented until a coordinated session uncomments it + adds the `dsh-semantic-layer` dep (collision-avoidance with a concurrent session editing the bundle patch + lockfile); until then this tool returns the honest "not mounted" result (callable but unwired, mirroring `tool-search-data-sources`). The preset row + phase-gate whitelist are already in place, so registering the service makes the tool wired.
- **Empty substrate (default `semanticRoot`)** — with the default empty root the substrate scans no `events/` dir and `loadEventDefinition` returns `null` (not-found, no crash). A real substrate directory is configured at the profile/runtime level; the tool's contract is unchanged.
- **Live-ODPS provider deferred (P6b Q3)** — `ctx.schema.discover`/`describe`/`sample` (live-ODPS schema) throw "no provider" until a real MaxCompute provider mounts (P6b follow-up). `load_event_definition` only reads the substrate definitions, so it is unblocked regardless.
- **Path-traversal guard is boundary-only** — the name guard lives in this tool (the untrusted model-input boundary). The substrate's `io.ts` read path matches by the event `name` field (not by filename), so traversal is not reachable through `load_*`; the guard is defense-in-depth against future substrate changes. `io.ts` writers (`writeEventYaml`/`writeTable`) do path `name` and remain guarded only for trusted internal callers (P6b #5/#6 follow-ups).
- **Substrate write-tier hardening deferred** — P6b code-review #4 (canonicalize-on-write) and #6 (`updateTableMeta` `withFileLock`) are deferred in `io.ts`; they do not affect this read-only tool, which calls only the validated readers.
