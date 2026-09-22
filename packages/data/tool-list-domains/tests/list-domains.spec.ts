/**
 * list_domains tool — the domain aggregation core (`listDomainsResult`), the
 * model-facing text projection (`formatListDomains`), and the registered tool
 * contract (`apply` / `output.render` / `execute`).
 *
 * The aggregation core reads the REAL filesystem: `loadTables` / `loadEvents` /
 * `loadConcepts` all `readdirSync` under `schema.semanticRoot`. So every fixture
 * lives in its own `mkdtemp` root allocated per test (never a predictable shared
 * path) and is removed in `afterEach`.
 *
 * Run: `pnpm vitest run packages/data/tool-list-domains/tests`
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import {
  apply,
  formatListDomains,
  listDomainsResult,
  type DomainEntry,
  type ListDomainsResult,
} from '../src/index.ts'

// ── Fixture plumbing ───────────────────────────────────────────────────────

/** Every root allocated by this file, torn down after each test. */
const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) {
    const d = roots.pop()!
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // best-effort teardown — a leaked temp dir must not fail the suite
    }
  }
})

/** A private throwaway semantic-layer root, registered for immediate cleanup. */
function makeRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'dsh-list-domains-'))
  roots.push(d)
  return d
}

/** YAML is a JSON superset, so JSON text is a valid `.yaml` payload for js-yaml. */
function writeYaml(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8')
}

/** Write `tables/<file>.yaml` (the dir `loadTables` scans). */
function writeTable(root: string, file: string, raw: Record<string, unknown>): void {
  const dir = join(root, 'tables')
  mkdirSync(dir, { recursive: true })
  writeYaml(join(dir, `${file}.yaml`), raw)
}

/** Write `events/<domainDir>/<file>.yaml` (`loadEvents` scans one level of domain dirs). */
function writeEvent(root: string, domainDir: string, file: string, raw: Record<string, unknown>): void {
  const dir = join(root, 'events', domainDir)
  mkdirSync(dir, { recursive: true })
  writeYaml(join(dir, `${file}.yaml`), raw)
}

/** Write `concepts/<file>.yaml` (the dir `loadConcepts` scans). */
function writeConcept(root: string, file: string, raw: Record<string, unknown>): void {
  const dir = join(root, 'concepts')
  mkdirSync(dir, { recursive: true })
  writeYaml(join(dir, `${file}.yaml`), raw)
}

/** A `SemanticLayerService` stand-in — `listDomainsResult` reads only `semanticRoot`. */
function stubSchema(semanticRoot: string): SemanticLayerService {
  return { semanticRoot } as unknown as SemanticLayerService
}

/**
 * A root exercising every aggregation arm at once:
 *  - a table on TWO domains carrying TWO metrics (fresh + already-seen `ensure`,
 *    metric fan-out),
 *  - a metric-less table on an already-counted domain (`metricCount === 0` arm),
 *  - a metric-carrying event and a metric-less event on an event-only domain,
 *  - a concept supplying metadata for an existing domain,
 *  - a concept-only domain (zero counts, created by `ensure`),
 *  - one schema-invalid file per kind, each declaring a `ghost_*` domain that
 *    must never reach the output.
 */
function makeRichRoot(): string {
  const root = makeRoot()

  writeTable(root, 'dws_pay_order_di', {
    table_name: 'dws_pay_order_di',
    domains: ['payment', 'game'],
    metrics: {
      total_pay_amount: { expression: 'sum(pay_amount)' },
      pay_user_cnt: { expression: 'count(distinct uid)' },
    },
  })
  writeTable(root, 'dws_pay_refund_di', {
    table_name: 'dws_pay_refund_di',
    domains: ['payment'],
    metrics: {},
  })
  // `columns` must be an array -> TableDefinitionSchema.safeParse fails
  writeTable(root, 'broken_table', {
    table_name: 'broken_table',
    domains: ['ghost_table_domain'],
    columns: 'not-an-array',
  })

  writeEvent(root, 'payment', 'paid', {
    name: 'payment.paid',
    domains: ['payment'],
    metrics: { paid_cnt: { expression: 'count(1)' } },
  })
  writeEvent(root, 'session', 'login', {
    name: 'session.login',
    domains: ['session'],
    metrics: {},
  })
  // `params_fields` must be a record -> EventDefinitionSchema.safeParse fails
  writeEvent(root, 'session', 'broken', {
    name: 'session.broken',
    domains: ['ghost_event_domain'],
    params_fields: 'not-a-record',
  })

  writeConcept(root, 'payment', {
    name: 'payment',
    description: '支付域',
    alt_labels: ['pay', '充值'],
  })
  writeConcept(root, 'analytics', {
    name: 'analytics',
    description: '分析域',
    alt_labels: ['bi'],
  })
  // `alt_labels` must be an array -> ConceptDefinitionSchema.safeParse fails
  writeConcept(root, 'broken', {
    name: 'ghost_concept_domain',
    alt_labels: 'not-an-array',
  })

  return root
}

/** The exact aggregation `makeRichRoot()` must produce (name-sorted). */
const RICH_DOMAINS: DomainEntry[] = [
  { name: 'analytics', description: '分析域', alt_labels: ['bi'], table_count: 0, event_count: 0, metric_count: 0 },
  { name: 'game', description: '', alt_labels: [], table_count: 1, event_count: 0, metric_count: 2 },
  { name: 'payment', description: '支付域', alt_labels: ['pay', '充值'], table_count: 2, event_count: 1, metric_count: 3 },
  { name: 'session', description: '', alt_labels: [], table_count: 0, event_count: 1, metric_count: 0 },
]

/** The subset of the registered tool definition these tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: ListDomainsResult,
    ) => readonly { readonly type: string; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, never>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<ListDomainsResult>
}

/**
 * Capture the tool definition `apply` registers — no real Cordis container.
 * `services` is the `ctx.get(key)` lookup table; a key absent from it returns
 * `undefined`, which models "that service is not mounted".
 */
function registerTool(services: Record<string, unknown> = {}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    get: (key: string) => services[key],
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

// ── listDomainsResult ──────────────────────────────────────────────────────

describe('listDomainsResult', () => {
  it('reports the semantic layer as unmounted when no schema service is supplied', () => {
    expect(listDomainsResult(undefined)).toEqual({
      ok: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })

  it('succeeds with zero domains when the mounted service has no semanticRoot configured', () => {
    expect(listDomainsResult(stubSchema(''))).toEqual({ ok: true, domains: [] })
  })

  it('succeeds with zero domains when the root holds no tables, events or concepts', () => {
    expect(listDomainsResult(stubSchema(makeRoot()))).toEqual({ ok: true, domains: [] })
  })

  it('aggregates table, event and concept counts into name-sorted domains with concept metadata', () => {
    expect(listDomainsResult(stubSchema(makeRichRoot()))).toEqual({ ok: true, domains: RICH_DOMAINS })
  })

  it('skips schema-invalid table, event and concept files instead of aborting the scan', () => {
    const r = listDomainsResult(stubSchema(makeRichRoot()))
    expect(r.ok).toBe(true)
    expect((r.domains ?? []).map(d => d.name)).toEqual(['analytics', 'game', 'payment', 'session'])
    // the three broken files each declared a domain the scan must never surface
    expect((r.domains ?? []).map(d => d.name)).not.toContain('ghost_table_domain')
    expect((r.domains ?? []).map(d => d.name)).not.toContain('ghost_event_domain')
    expect((r.domains ?? []).map(d => d.name)).not.toContain('ghost_concept_domain')
  })

  it('counts a domain once per asset even when several assets and a concept name it', () => {
    // `payment` is named by 2 tables, 1 event and 1 concept: a single entry with
    // additive counts, not four entries (the `ensure` already-seen arm).
    const r = listDomainsResult(stubSchema(makeRichRoot()))
    const payment = (r.domains ?? []).filter(d => d.name === 'payment')
    expect(payment).toEqual([RICH_DOMAINS[2]])
  })
})

// ── formatListDomains ──────────────────────────────────────────────────────

describe('formatListDomains', () => {
  it('surfaces the failure message verbatim when the result is not ok', () => {
    expect(formatListDomains({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }))
      .toBe('semantic-layer not mounted (ctx.schema unavailable)')
  })

  it('falls back to a generic failure line when a failed result carries no message', () => {
    expect(formatListDomains({ ok: false })).toBe('list_domains failed')
  })

  it('reports an empty layer when a successful result omits the domains array', () => {
    expect(formatListDomains({ ok: true })).toBe('No domains found in the semantic layer.')
  })

  it('reports an empty layer when a successful result carries an empty domains array', () => {
    expect(formatListDomains({ ok: true, domains: [] })).toBe('No domains found in the semantic layer.')
  })

  it('renders a count header plus one bullet per domain, omitting blank description and aliases', () => {
    const value: ListDomainsResult = {
      ok: true,
      domains: [
        { name: 'payment', description: '支付域', alt_labels: ['pay', '充值'], table_count: 2, event_count: 1, metric_count: 3 },
        { name: 'game', description: '', alt_labels: [], table_count: 1, event_count: 0, metric_count: 2 },
      ],
    }
    expect(formatListDomains(value)).toBe(
      '2 domain(s):\n'
      + '• payment — 支付域 [pay, 充值]: 2 tables, 1 events, 3 metrics\n'
      + '• game: 1 tables, 0 events, 2 metrics',
    )
  })
})

// ── apply / output.render / execute ────────────────────────────────────────

describe('apply', () => {
  it('registers the list_domains tool with its model-facing name, description and contract', () => {
    const def = registerTool()
    expect(def.name).toBe('list_domains')
    expect(def.description).toBe(
      'List all domains (concepts) in the semantic layer with descriptions, '
      + 'aliases, and asset counts per kind (tables, events, metrics). Use '
      + 'this to understand the domain structure and identify areas to focus on.',
    )
    expect(def.output.schema).toBeDefined()
    expect(typeof def.output.render).toBe('function')
    expect(typeof def.execute).toBe('function')
  })
})

describe('output.render', () => {
  it('projects a successful value to a single text block holding the formatted listing', () => {
    const def = registerTool()
    const out = def.output.render({}, { ok: true, domains: [RICH_DOMAINS[1]!] })
    expect(out.length).toBe(1)
    expect(out[0]?.type).toBe('text')
    expect(out[0]?.text).toBe('1 domain(s):\n• game: 1 tables, 0 events, 2 metrics')
  })

  it('projects a failed value to a single text block holding the failure message', () => {
    const def = registerTool()
    const out = def.output.render({}, { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' })
    expect(out.length).toBe(1)
    expect(out[0]?.type).toBe('text')
    expect(out[0]?.text).toBe('semantic-layer not mounted (ctx.schema unavailable)')
  })
})

describe('execute', () => {
  it('rejects with the list_domains abort error when the signal is already aborted', async () => {
    const def = registerTool({ schema: stubSchema(makeRichRoot()) })
    const controller = new AbortController()
    controller.abort()
    await expect(def.execute({}, { signal: controller.signal })).rejects.toThrow(/^list_domains aborted$/)
  })

  it('returns the aggregated domains from the mounted schema service', async () => {
    const def = registerTool({ schema: stubSchema(makeRichRoot()) })
    await expect(def.execute({}, { signal: new AbortController().signal }))
      .resolves.toEqual({ ok: true, domains: RICH_DOMAINS })
  })

  it('returns the honest not-mounted result when no schema service is registered', async () => {
    const def = registerTool()
    await expect(def.execute({}, { signal: new AbortController().signal }))
      .resolves.toEqual({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' })
  })

  it('resolves the semantic layer from the "schema" service key only', async () => {
    // mounted under a different name -> still unmounted from this tool's view
    const def = registerTool({ 'semantic-layer': stubSchema(makeRichRoot()) })
    await expect(def.execute({}, { signal: new AbortController().signal }))
      .resolves.toEqual({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' })
  })
})
