# W7 — Management Agent Preset Implementation Plan

## Context

G5 resolved that the semantic layer management UI = a management agent conversation face. W7 creates the `semantic-layer-management` agent preset so that a session can mount it and get the correct tools + persona. W8 (sidebar trigger) and W9 (core presenters) both depend on W7.

**Problem:** Of the 9 specified tools, only 2 exist as Cordis tool packages (`dsh-tool-discover-relations`, `dsh-tool-goal`). The other 7 need new packages. However, 4 of those 7 are trivial read-only wrappers around `ctx.schema` methods (10-50 LOC each), while the remaining 3 need infrastructure not yet available (query engine, audit UX, W3 eval runner).

## Approach

Create the preset + 4 thin read-only tool packages. Comment out the 3 infrastructure-dependent tools. This unblocks W8 (needs preset id) and W9 (needs search_schema, get_definition, get_coverage).

### Deliverables

1. **Preset directory**: `apps/cli/config/agent-presets/semantic-layer-management/`
   - `preset.yml` — metadata (name, description, order)
   - `agent.cordis.yml` — composition (persona + 6 active tools + 3 commented-out)

2. **4 new tool packages** (Mode 3 — Repository package, under `packages/data/`):
   - `tool-search-schema` — wraps `ctx.schema.loadRetrievalCorpusAll()` + Bm25Linker for management-context search
   - `tool-get-definition` — wraps `ctx.schema.loadTableDefinition/loadEventDefinition/loadMetricDefinition` (unified by name)
   - `tool-list-domains` — aggregates domains from all definitions (mirrors SchemaGateway.listDomains logic)
   - `tool-get-coverage` — aggregates coverage stats (mirrors SchemaGateway.getCoverageStats logic)

3. **Commented-out tools** (tracked for later):
   - `execute_metric` — needs query engine (`ctx.query.execute`); separate ticket
   - `edit_definition` — needs Tier-2 audit UX flow for agent-driven edits; separate ticket
   - `trigger_eval` — W3 dependency (eval evidence engine not yet shipped)

### File Structure per Tool Package

Following `tool-discover-relations` pattern:
```
packages/data/tool-<name>/
├── package.json        (peerDeps: cordis, schemastery, dsh-tools, dsh-semantic-layer)
├── tsconfig.json       (extends tsconfig.base.json, references vendor/* + core/tools + data/semantic-layer)
├── src/
│   └── index.ts        (export name, inject, Config, apply)
└── tests/
    └── <name>.spec.ts  (unit test with schema double)
```

### Preset Composition (`agent.cordis.yml`)

```yaml
# persona
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a semantic layer management agent...

# 4 new read-only tools (no service, loose rows)
- id: tool-search-schema
  name: '@deepseek-ai/dsh-tool-search-schema'
- id: tool-get-definition
  name: '@deepseek-ai/dsh-tool-get-definition'
- id: tool-list-domains
  name: '@deepseek-ai/dsh-tool-list-domains'
- id: tool-get-coverage
  name: '@deepseek-ai/dsh-tool-get-coverage'

# existing tools
- id: tool-discover-relations
  name: '@deepseek-ai/dsh-tool-discover-relations'
- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

# commented-out (infrastructure-dependent)
# - id: tool-execute-metric    # needs ctx.query (query engine)
# - id: tool-edit-definition   # needs Tier-2 audit UX
# - id: tool-trigger-eval      # W3 dependency
```

### Tool Implementation Details

**`search_schema`** — Parameters: `query` (string), `top_k?` (number). Injects `['tools', 'schema']`. Uses `ctx.schema.loadRetrievalCorpusAll()` to build a Bm25Linker, caches by corpus version, retrieves top_k hits. Returns `{ hits: [{id, score, description?}] }`.

**`get_definition`** — Parameters: `name` (string). Injects `['tools', 'schema']`. Tries loadTableDefinition → loadEventDefinition → loadMetricDefinition in order. Returns the full definition object or `{ found: false }`.

**`list_domains`** — No parameters. Injects `['tools', 'schema']`. Scans all definitions, aggregates unique domains with counts per kind. Returns `{ domains: [{name, table_count, event_count, metric_count}] }`.

**`get_coverage`** — No parameters. Injects `['tools', 'schema']`. Counts total assets by kind, by domain, by confirmation status. Returns `{ table_count, event_count, metric_count, domain_counts }`.

### Persona Text

```
You are a semantic layer management agent powered by {{model}}.
Your goal is to improve the semantic layer's quality: coverage, accuracy, and completeness of data asset definitions.

You work with eval evidence: use get_coverage to assess current state, search_schema and get_definition to explore assets, discover_relations to enrich the relation graph, and (when available) trigger_eval to measure progress.

You manage definitions and structure. The data agent serves user queries using the semantic layer you maintain. Your edits should be deliberate and evidence-driven.
```

### Key Patterns to Follow

- `defineTool` from `@deepseek-ai/dsh-tools` (parameters + output.schema + output.render + execute)
- `ctx.get('schema')` soft-resolve (returns undefined when unmounted → honest "not available" message)
- Input validation at model boundary (path traversal guard for name params)
- Bm25Linker cache pattern (from `tool-search-data-sources` — cache by corpusVersion)
- Pure `formatX(value)` for model-facing text render

### Workspace Registration

Each new package needs:
- Entry in root `pnpm-workspace.yaml` (already covers `packages/data/*`)
- `tsconfig.json` references wired
- No entry needed in any bundle (preset mounts directly by specifier)

## Verification

1. `pnpm install` succeeds (new packages resolve)
2. `npx tsc --build` clean (type-check all new packages)
3. Unit tests pass for each tool (schema double for ctx.schema)
4. Preset mounts in a session: `ctx.tools` lists 6 tools (search_schema, get_definition, list_domains, get_coverage, discover_relations, goal)
5. Each tool executes correctly with K11 seed data present

## Scope Boundary

**In scope:** Preset + 4 read-only tools + persona + tests
**Out of scope:** execute_metric, edit_definition, trigger_eval packages (tracked as future work); render intents / presenters (W9); sidebar trigger (W8)
