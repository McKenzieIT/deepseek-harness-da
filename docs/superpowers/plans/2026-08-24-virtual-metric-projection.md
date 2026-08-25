# Virtual Metric Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the semantic-layer metric model from 3916 standalone metric YAMLs + a registered `metric-kind` plugin into runtime virtual projection — metrics derived at retrieval time from table/event embedded `metrics:` blocks, with `execute_metric` + Level 2.5 deterministic path removed (M1b: actively wrong on `_df` snapshot SUM metrics).

**Architecture:** Single source of truth = table/event YAML (with embedded `metrics:` blocks). `loadRetrievalCorpusAll` runs a derivation pass: for each table/event corpus item, derive one virtual metric `CorpusItem` per embedded metric (with `kind:'metric'` payload + description for BM25 recall). `metric-kind.ts` is deleted — schema moves to `types.ts`, `relations`/`toCorpusItem` move to `metrics.ts` pure functions, dead code (`toPromptContext`/`toExecutableRule`/`toCriticContext`/`getId`) removed. `execute_metric` tool + engine Level 2.5 branch deleted; metrics route through Level 2 `buildMetricContext` injection. `caliber_variants` carried in derived `MetricDefinition` (M1c: restores planner Type B disambiguation signal).

**Tech Stack:** TypeScript, zod, vitest, Cordis (vendored), dsh semantic-layer + nl2sql-engine + phase-gate packages.

**Decisions (M1 grilling, resolved 2026-08-24):** 1=A virtual projection · 2=B derivation pass · 3=C delete metric-kind · 4=A loadMetricDefinition contract unchanged · 5=B delete execute_metric+L2.5 (M1b) · 6=A retest all (project rule) · 7=A carry caliber_variants (M1c) · 8=A delete metrics/ dir.

---

## File Structure

**Modified:**
- `packages/data/semantic-layer/src/types.ts` — add `MetricDefinitionSchema` + `MetricDefinition` + `CaliberVariantSchema` (moved from metric-kind.ts; add `caliber_variants` field)
- `packages/data/semantic-layer/src/metrics.ts` — import schema from types.ts; `toMetricDefinition` carries `caliber_variants`; add pure `projectMetricCorpusItem` + `deriveMetricRelations`; `loadMetricDefinitions` derives from table/event (no `metrics/` dir read)
- `packages/data/semantic-layer/src/index.ts` — drop `metricKindPlugin` import/register; `getRelationGraph` derives metric nodes; drop `loadByStorageDir('metrics')` branch; `loadMetricDefinition(name)` derives from host; `loadRetrievalCorpusAll` runs derivation pass
- `packages/data/nl2sql-engine/src/engine.ts` — delete Level 2.5 branch (lines ~165-210); keep `buildMetricContext` Level 2 injection
- `packages/data/nl2sql-engine/src/metric-engine.ts` — delete `buildExecutableSQL`; `routeMetric` returns `'level-2' | null` only
- `packages/data/phase-gate/src/phase-gate.ts` — delete `execute_metric` from UNDERSTANDING prompt (METRIC SHORTCUT)
- `packages/data/phase-gate/src/types.ts` — delete `'execute_metric'` from `UNDERSTANDING_TOOLS`
- `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` — delete `tool-execute-metric` row (lines 104-105)
- `apps/cli/package.json` — drop `@deepseek-ai/dsh-tool-execute-metric` dep (if present)
- `packages/data/semantic-layer/src/index.ts` exports — drop `metricKindPlugin`, keep `MetricDefinition`/`MetricDefinitionSchema` from types.ts

**Deleted:**
- `packages/data/semantic-layer/src/kinds/metric-kind.ts` (entire file — schema moved, methods moved, dead code removed)
- `packages/data/tool-execute-metric/` (entire package — tool + tests + package.json)
- `examples/k11-semantic-layer/metrics/` (3916 files — pure mechanical projection, zero information loss per M1c)
- `packages/data/semantic-layer/src/metrics.ts` `seedMetrics` (no longer writes standalone YAMLs)

**Tests:**
- `packages/data/semantic-layer/tests/metrics.spec.ts` (new or extend) — derivation pure functions
- `packages/data/semantic-layer/tests/registry.spec.ts` — remove metricKindPlugin tests
- `packages/data/nl2sql-engine/tests/metric-engine.spec.ts` — drop L2.5 assertions
- `packages/data/nl2sql-engine/tests/metric-comparison.spec.ts` — fold into single L2 eval or delete

---

### Task 1: Add MetricDefinition schema + CaliberVariant to types.ts

**Files:**
- Modify: `packages/data/semantic-layer/src/types.ts` (after existing `MetricDefSchema` ~line 118)

- [ ] **Step 1: Add CaliberVariantSchema + MetricDefinitionSchema to types.ts**

Append after the `MetricDef` type (the embedded-block schema stays; this is the derived standalone-metric schema):

```typescript
/** A caliber variant (id + description + default flag); mirrors RBI CaliberVariant. */
export const CaliberVariantSchema = z.object({
  id: z.string(),
  description: z.string().default(''),
  default: z.boolean().default(false),
}).loose()

/** Inferred type of {@link CaliberVariantSchema}. */
export type CaliberVariant = z.infer<typeof CaliberVariantSchema>

/** Metric computation metadata (derived from the embedded metric's expression). */
const MetricComputationSchema = z.object({
  sql: z.string().default(''),
  metadata: z.object({
    aggregation: z.string().default(''),
    field: z.string().default(''),
    source: z.string().default(''),
    time_grain: z.string().default(''),
  }).loose().default({ aggregation: '', field: '', source: '', time_grain: '' }),
}).loose()

const MetricRelationSchema = z.object({
  type: z.enum(['joins', 'derived_from', 'related_to']),
  target: z.string(),
  on: z.string().optional(),
  description: z.string().default(''),
}).loose()

/**
 * The derived MetricDefinition — produced at retrieval time from a table/event
 * embedded `metrics:` block (NOT loaded from a standalone YAML file). Carries
 * `caliber_variants` (M1c: planner Type B disambiguation signal).
 */
export const MetricDefinitionSchema = z.object({
  kind: z.literal('metric').default('metric'),
  name: z.string(),
  description: z.string().default(''),
  domains: z.array(z.string()).default([]),
  computation: MetricComputationSchema.default({ sql: '', metadata: { aggregation: '', field: '', source: '', time_grain: '' } }),
  relations: z.array(MetricRelationSchema).default([]),
  caliber_variants: z.array(CaliberVariantSchema).default([]),
}).loose()

export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/mckenzie/workspace/deepseek-harness-da && pnpm tsc -b packages/data/semantic-layer/tsconfig.json --noEmit 2>&1 | grep -E "types\.ts" || echo "types.ts clean"`
Expected: "types.ts clean" (existing metric-kind.ts still defines its own MetricDefinitionSchema — a temporary duplicate; resolved in Task 4)

- [ ] **Step 3: Commit**

```bash
git add packages/data/semantic-layer/src/types.ts
git commit -m "refactor(semantic-layer): add MetricDefinitionSchema + CaliberVariant to types.ts"
```

---

### Task 2: metrics.ts — carry caliber_variants + derivation pure functions + loadMetricDefinitions derives

**Files:**
- Modify: `packages/data/semantic-layer/src/metrics.ts`
- Test: `packages/data/semantic-layer/tests/metrics-derivation.spec.ts` (new)

- [ ] **Step 1: Write failing test for derivation + caliber carry**

Create `packages/data/semantic-layer/tests/metrics-derivation.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { toMetricDefinition, projectMetricCorpusItem, deriveMetricRelations } from '../src/metrics.ts'

describe('metric derivation (M1 virtual projection)', () => {
  const mdef = { expression: 'COUNT(DISTINCT account_id)', description: 'DAU', caliber_variants: [] }
  const md = toMetricDefinition('dws_acc_di', 'dau', mdef, ['用户生命周期'])

  it('carries caliber_variants from host block (M1c: restores Type B signal)', () => {
    const withCaliber = { expression: 'SUM(x)', description: 'r', caliber_variants: [{ id: 'by_total', description: 'total', default: true }] }
    const r = toMetricDefinition('t', 'win_rate', withCaliber, [])
    expect(r.caliber_variants).toHaveLength(1)
    expect(r.caliber_variants[0].id).toBe('by_total')
  })

  it('projectMetricCorpusItem produces a kind:metric CorpusItem with description', () => {
    const item = projectMetricCorpusItem(md)
    expect(item).not.toBeNull()
    expect(item!.id).toBe('dws_acc_di__dau')
    expect(item!.description).toContain('DAU')
    expect((item!.payload as { kind: string }).kind).toBe('metric')
  })

  it('deriveMetricRelations returns derived_from edge to source', () => {
    const rels = deriveMetricRelations(md)
    expect(rels).toHaveLength(1)
    expect(rels[0].type).toBe('derived_from')
    expect(rels[0].target).toBe('dws_acc_di')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mckenzie/workspace/deepseek-harness-da && pnpm vitest run packages/data/semantic-layer/tests/metrics-derivation.spec.ts`
Expected: FAIL — `projectMetricCorpusItem` / `deriveMetricRelations` not exported; `caliber_variants` not carried.

- [ ] **Step 3: Update metrics.ts — import from types.ts, carry caliber, add pure functions**

In `packages/data/semantic-layer/src/metrics.ts`:

Change the import (line ~23):
```typescript
import { MetricDefinitionSchema, type MetricDefinition } from './types.ts'
```
(was `from './kinds/metric-kind.ts'`)

In `toMetricDefinition` (~line 79), carry `caliber_variants`:
```typescript
export function toMetricDefinition(
  source: string,
  key: string,
  def: MetricDef,
  domains: readonly string[],
): MetricDefinition {
  const { aggregation, field } = inferAggregation(def.expression)
  return {
    kind: 'metric',
    name: metricName(source, key),
    description: def.description,
    domains: [...domains],
    computation: {
      sql: def.expression,
      metadata: { aggregation, field, source, time_grain: '' },
    },
    relations: [{ type: 'derived_from', target: source, description: `机械提取自 ${source} 的 metrics 块（key=${key}）` }],
    caliber_variants: [...(def.caliber_variants ?? [])],
  }
}
```

Add the two pure functions (after `toMetricDefinition`):
```typescript
/** Project a derived MetricDefinition to a kind:metric CorpusItem for BM25 indexing. */
export function projectMetricCorpusItem(def: MetricDefinition): { id: string; description: string; payload: MetricDefinition } | null {
  const parts: string[] = []
  if (def.description) parts.push(def.description)
  if (def.computation.metadata.aggregation) parts.push(def.computation.metadata.aggregation)
  if (def.computation.metadata.field) parts.push(def.computation.metadata.field)
  return {
    id: def.name,
    ...(parts.length > 0 ? { description: parts.join(' ') } : {}),
    payload: def,
  }
}

/** Derive relation edges for a metric (derived_from → source; plus any explicit). */
export function deriveMetricRelations(def: MetricDefinition): { type: string; target: string; on?: string; description?: string }[] {
  return def.relations.map(r => ({
    type: r.type, target: r.target,
    ...(r.on ? { on: r.on } : {}),
    ...(r.description ? { description: r.description } : {}),
  }))
}
```

Change `loadMetricDefinitions` to derive from table/event blocks (no `metrics/` dir read). Find the current function (reads `metrics/*.yaml`) and replace its body to derive:
```typescript
export function loadMetricDefinitions(semanticLayer: string): MetricDefinition[] {
  return extractMetricsFromTables(semanticLayer)
}
```
(`extractMetricsFromTables` already iterates tables + events — verify it covers events; if `extractMetricsFromTables` only does tables, ensure it also calls `extractMetricsFromEvent` for events per the existing code at ~line 146-155.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mckenzie/workspace/deepseek-harness-da && pnpm vitest run packages/data/semantic-layer/tests/metrics-derivation.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/data/semantic-layer/src/metrics.ts packages/data/semantic-layer/tests/metrics-derivation.spec.ts
git commit -m "refactor(semantic-layer): metrics.ts derivation pure functions + carry caliber_variants"
```

---

### Task 3: index.ts — drop metricKindPlugin, wire derivation pass + derive loadMetricDefinition + getRelationGraph

**Files:**
- Modify: `packages/data/semantic-layer/src/index.ts`
- Test: `packages/data/semantic-layer/tests/service-wiring.spec.ts` (extend)

- [ ] **Step 1: Write failing test — loadMetricDefinition derives from host + loadRetrievalCorpusAll emits virtual metric items**

Add to `packages/data/semantic-layer/tests/service-wiring.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
// (use the existing Service wiring harness; these are additional cases)
describe('M1 virtual metric projection', () => {
  it('loadMetricDefinition(name) derives from host table metrics block', () => {
    // SEED = examples/k11-semantic-layer (existing fixture)
    const md = service.loadMetricDefinition('dws_10000251_acc_summary_di__daily_active_account_uv')
    expect(md).not.toBeNull()
    expect(md!.computation.metadata.source).toBe('dws_10000251_acc_summary_di')
    expect(md!.computation.sql).toContain('COUNT(DISTINCT account_id)')
  })

  it('loadRetrievalCorpusAll emits virtual metric CorpusItems with kind:metric', () => {
    const corpus = service.loadRetrievalCorpusAll()
    const metricItems = corpus.filter(c => (c.payload as { kind?: string } | undefined)?.kind === 'metric')
    expect(metricItems.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mckenzie/workspace/deepseek-harness-da && pnpm vitest run packages/data/semantic-layer/tests/service-wiring.spec.ts -t "virtual metric projection"`
Expected: FAIL — `loadMetricDefinition` still reads standalone files; `loadRetrievalCorpusAll` doesn't emit virtual items.

- [ ] **Step 3: Modify index.ts**

(a) Drop metricKindPlugin import + register:
- Delete `import { metricKindPlugin, type MetricDefinition } from './kinds/metric-kind.ts'` (~line 64)
- Change export line (~138): `export { metricKindPlugin, type MetricDefinition } from './kinds/metric-kind.ts'` → `export type { MetricDefinition, MetricDefinitionSchema } from './types.ts'`
- Delete `metricKindPlugin` from the register loop (~line 203): `for (const p of [eventKindPlugin, tableKindPlugin, metricKindPlugin])` → `for (const p of [eventKindPlugin, tableKindPlugin])`
- Add imports at top: `import { projectMetricCorpusItem, deriveMetricRelations, toMetricDefinition } from './metrics.ts'` and `import { MetricDefinitionSchema, type MetricDefinition } from './types.ts'`

(b) `getRelationGraph` (~line 238-243): replace the `loadMetricDefinitions` + `metricKindPlugin.relations` block:
```typescript
// derive metric nodes from table/event embedded metrics blocks
for (const t of loadTables(this.semanticRoot)) {
  const r = TableDefinitionSchema.safeParse(t.raw)
  if (!r.success) continue
  for (const m of extractMetricsFromTable(r.data)) {
    entries.push({ sourceId: m.name, relations: deriveMetricRelations(m) })
  }
}
for (const e of loadEvents(this.semanticRoot)) {
  const r = EventDefinitionSchema.safeParse(e.raw)
  if (!r.success) continue
  for (const m of extractMetricsFromEvent(r.data)) {
    entries.push({ sourceId: m.name, relations: deriveMetricRelations(m) })
  }
}
```
(Add `import { extractMetricsFromTable, extractMetricsFromEvent } from './metrics.ts'`.)

(c) `loadByStorageDir` (~line 270-287): delete the `if (dir === 'metrics') return loadMetricDefinitions(...)` branch (metrics no longer a storage dir).

(d) `loadMetricDefinition` (~line 448-450): replace to derive from host:
```typescript
loadMetricDefinition(name: string): MetricDefinition | null {
  const sep = name.lastIndexOf('__')
  if (sep <= 0) return null
  const host = name.slice(0, sep)
  const key = name.slice(sep + 2)
  // try table host, then event host
  const table = loadTableDefinitionFromLayer(this.semanticRoot, host)
  if (table !== null) {
    const m = table.metrics[key]
    if (m !== undefined) return toMetricDefinition(host, key, m, table.domains)
  }
  const event = loadEventDefinitionFromLayer(this.semanticRoot, host)
  if (event !== null) {
    const m = event.metrics[key]
    if (m !== undefined) return toMetricDefinition(host, key, m, event.domains)
  }
  return null
}
```

(e) `loadRetrievalCorpusAll` (~line 256-263): after the existing per-kind loop, add a derivation pass that emits virtual metric items:
```typescript
// M1 derivation pass: emit one virtual metric CorpusItem per embedded metric
for (const plugin of this.registry.allPlugins()) {
  for (const def of this.loadByStorageDir(plugin.storageDir)) {
    // table/event hosts: derive metric items
    const metrics = plugin.kind === 'table'
      ? extractMetricsFromTable(def as TableDefinition)
      : plugin.kind === 'event'
        ? extractMetricsFromEvent(def as EventDefinition)
        : []
    for (const m of metrics) {
      const item = projectMetricCorpusItem(m)
      if (item) out.push(item)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mckenzie/workspace/deepseek-harness-da && pnpm vitest run packages/data/semantic-layer/tests/service-wiring.spec.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm tsc -b packages/data/semantic-layer/tsconfig.json --noEmit 2>&1 | grep "index.ts" || echo "index.ts clean"
git add packages/data/semantic-layer/src/index.ts packages/data/semantic-layer/tests/service-wiring.spec.ts
git commit -m "refactor(semantic-layer): wire virtual metric projection in Service"
```

---

### Task 4: Delete metric-kind.ts + fix registry.spec.ts

**Files:**
- Delete: `packages/data/semantic-layer/src/kinds/metric-kind.ts`
- Modify: `packages/data/semantic-layer/tests/registry.spec.ts`

- [ ] **Step 1: Delete metric-kind.ts**

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
rm packages/data/semantic-layer/src/kinds/metric-kind.ts
```

- [ ] **Step 2: Remove metricKindPlugin tests from registry.spec.ts**

Delete the `// ── metricKindPlugin — G2 aligned ───` section (~line 171 onward: schema parses / getId / toCorpusItem / toPromptContext / toExecutableRule tests) and the `reg.register(metricKindPlugin)` + `getKind('metric')` assertions (~line 34-37).

- [ ] **Step 3: Typecheck + run tests**

```bash
pnpm tsc -b packages/data/semantic-layer/tsconfig.json --noEmit 2>&1 | grep -E "kinds/metric-kind|registry" || echo "clean"
pnpm vitest run packages/data/semantic-layer/tests/registry.spec.ts
```
Expected: clean + PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/data/semantic-layer/
git commit -m "refactor(semantic-layer): delete metric-kind.ts (schema moved to types, methods to metrics.ts)"
```

---

### Task 5: nl2sql-engine — delete Level 2.5 branch

**Files:**
- Modify: `packages/data/nl2sql-engine/src/engine.ts` (~line 165-210)
- Modify: `packages/data/nl2sql-engine/src/metric-engine.ts` (delete `buildExecutableSQL`, change `routeMetric` return type)
- Test: `packages/data/nl2sql-engine/tests/metric-engine.spec.ts`

- [ ] **Step 1: Modify metric-engine.ts**

- Delete `buildExecutableSQL` function (~line 108-132)
- Change `routeMetric` return type to `'level-2' | null` and remove the `level-2.5` arm:
```typescript
export function routeMetric(candidates: readonly RetrievalHit[]): 'level-2' | null {
  const metricHits = candidates.filter(isMetricHit)
  if (metricHits.length === 0) return null
  return 'level-2'
}
```

- [ ] **Step 2: Modify engine.ts — delete the Level 2.5 branch**

Delete the `if (route === 'level-2.5') { ... }` block (~line 165-210, the block that calls buildExecutableSQL + executeMetric). Keep the Level 2 `buildMetricContext` injection block (~line 215-235) and the `route === 'level-2'` guard around it. Update the `route` computation comment.

- [ ] **Step 3: Fix metric-engine.spec.ts — drop L2.5 assertions**

In `packages/data/nl2sql-engine/tests/metric-engine.spec.ts`: delete tests asserting `route === 'level-2.5'` and any `buildExecutableSQL` tests; change `llm.callCount === 0` assertions to `> 0` (Level 2 always calls LLM).

- [ ] **Step 4: Run tests**

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
pnpm vitest run packages/data/nl2sql-engine/tests/metric-engine.spec.ts packages/data/nl2sql-engine/tests/metric-comparison.spec.ts
```
Expected: PASS (or delete metric-comparison.spec.ts if it compares L2.5 vs L2 — fold into single L2 eval)

- [ ] **Step 5: Commit**

```bash
git add packages/data/nl2sql-engine/
git commit -m "refactor(nl2sql-engine): delete Level 2.5 deterministic path (M1b: wrong on _df)"
```

---

### Task 6: Delete tool-execute-metric package + preset row + phase-gate whitelist/prompt

**Files:**
- Delete: `packages/data/tool-execute-metric/` (entire package)
- Modify: `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` (lines 104-105)
- Modify: `packages/data/phase-gate/src/types.ts` (line 160)
- Modify: `packages/data/phase-gate/src/phase-gate.ts` (lines 86, 91)
- Modify: `apps/cli/package.json` (drop dep if present)

- [ ] **Step 1: Delete the tool package**

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
rm -rf packages/data/tool-execute-metric/
```

- [ ] **Step 2: Delete preset row**

In `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`, delete lines 104-105:
```yaml
- id: tool-execute-metric        # UNDERSTANDING (P4: deterministic Level 2.5 metric query; called after search_data_sources returns metric hit)
  name: '@deepseek-ai/dsh-tool-execute-metric'
```

- [ ] **Step 3: Delete execute_metric from phase-gate whitelist + prompt**

In `packages/data/phase-gate/src/types.ts` line 160: delete `'execute_metric',` from `UNDERSTANDING_TOOLS`.

In `packages/data/phase-gate/src/phase-gate.ts`:
- Line 86: remove `+ execute_metric (for pure metric queries)` from the PHASE ORDER text
- Line 91: remove the `METRIC SHORTCUT: ... call execute_metric ...` sentence from the UNDERSTANDING persona

- [ ] **Step 4: Drop dep + reinstall**

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
# remove @deepseek-ai/dsh-tool-execute-metric from apps/cli/package.json dependencies if present
pnpm install --no-frozen-lockfile
```

- [ ] **Step 5: Verify cordis config + phase-gate tests**

```bash
pnpm run verify-cordis-config 2>&1 | tail -3
pnpm vitest run packages/data/phase-gate/tests/
```
Expected: cordis-config pass (the existing dsh-client-ui-semantic-layer failure is unrelated/pre-existing); phase-gate tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A apps/cli/ packages/data/tool-execute-metric/ packages/data/phase-gate/
git commit -m "refactor: delete execute_metric tool + Level 2.5 preset/whitelist/prompt"
```

---

### Task 7: Delete metrics/ directory + seedMetrics

**Files:**
- Delete: `examples/k11-semantic-layer/metrics/` (3916 files)
- Modify: `packages/data/semantic-layer/src/metrics.ts` (delete `seedMetrics`)

- [ ] **Step 1: Delete the metrics directory**

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
rm -rf examples/k11-semantic-layer/metrics/
```

- [ ] **Step 2: Delete seedMetrics from metrics.ts**

In `packages/data/semantic-layer/src/metrics.ts`: delete the `seedMetrics` function (the one that calls `writeMetricDefinitions(extractMetricsFromTables(...))`) and its export from `index.ts` if re-exported.

- [ ] **Step 3: Verify loadMetricDefinitions still derives (no file read)**

```bash
pnpm vitest run packages/data/semantic-layer/tests/service-wiring.spec.ts packages/data/semantic-layer/tests/metrics-derivation.spec.ts
```
Expected: PASS (derivation is runtime, no `metrics/` dir needed)

- [ ] **Step 4: Commit**

```bash
git add -A examples/k11-semantic-layer/metrics/ packages/data/semantic-layer/src/metrics.ts packages/data/semantic-layer/src/index.ts
git commit -m "refactor(semantic-layer): delete 3916 metric YAMLs + seedMetrics (virtual projection)"
```

---

### Task 8: Full verification — D2g 113 gold recall + all tests + dsh web DAU query

**Files:** (verification only)

- [ ] **Step 1: D2g 113 gold recall regression test**

Run the D2g recall probe (faithful port of `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py` logic) against the derived corpus:
```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
# run the existing D2g recall harness; compare strict/loose vs baseline (term-only 77.0%/79.6%, params+term 68.1%/71.7%)
pnpm vitest run packages/data/nl2sql-engine/tests/ 2>&1 | tail -10
```
Record results in `wayfinder/data-agent/research/experiment-audit-log.md` (M1 entry). If recall regresses >2pp, investigate `inferField` fix token impact.

- [ ] **Step 2: Full semantic-layer + nl2sql-engine + phase-gate test suite**

```bash
pnpm vitest run packages/data/semantic-layer/tests/ packages/data/nl2sql-engine/tests/ packages/data/phase-gate/tests/ --reporter=dot 2>&1 | tail -8
```
Expected: all pass

- [ ] **Step 3: Typecheck affected packages**

```bash
pnpm tsc -b packages/data/semantic-layer packages/data/nl2sql-engine packages/data/phase-gate 2>&1 | tail -5
```
Expected: clean (pre-existing table-kind.ts:101 errors excepted)

- [ ] **Step 4: dsh web boot + DAU query E2E**

```bash
lsof -ti:3080 | xargs kill 2>/dev/null; sleep 2
nohup pnpm dsh web --no-open > /tmp/dsh-web-m1.log 2>&1 &
sleep 8
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080
```
Expected: HTTP 200. Then in the web UI, send "查询K11过去一周的DAU":
- `search_data_sources` returns metric candidates (e.g. `dws_10000251_acc_summary_di__daily_active_account_uv`)
- The agent routes to Level 2 (buildMetricContext injects `SELECT COUNT(DISTINCT account_id) FROM dws_..._acc_summary_di`)
- Generated SQL uses the qualified source table (`game_10000251.dws_..._acc_summary_di` via `qualifyTableName`)
- No `table_not_in_candidates` infinite retry; query executes

- [ ] **Step 5: Commit audit-log entry + final commit**

```bash
git add wayfinder/data-agent/research/experiment-audit-log.md
git commit -m "docs(experiment-audit): M1 virtual metric projection recall results"
```

---

## Self-Review

**Spec coverage (M1 decisions 1-8):**
- 1 virtual projection → Tasks 2,3,7 ✓
- 2 derivation pass (B) → Task 3(e) ✓
- 3 delete metric-kind (C) → Task 4 ✓
- 4 loadMetricDefinition contract unchanged (A) → Task 3(d) ✓
- 5 delete execute_metric+L2.5 (B) → Tasks 5,6 ✓
- 6 retest all (A) → Task 8 ✓
- 7 carry caliber_variants (A) → Tasks 1,2 ✓
- 8 delete metrics/ (A) → Task 7 ✓

**Placeholder scan:** All steps have exact paths + code + commands. No TBD.

**Type consistency:** `projectMetricCorpusItem` / `deriveMetricRelations` defined in Task 2, used in Task 3. `MetricDefinition` with `caliber_variants` defined in Task 1, carried in Task 2. `routeMetric` return type `'level-2' | null` consistent across Task 5.
