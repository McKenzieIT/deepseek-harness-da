/**
 * get_coverage tool — semantic-layer coverage statistics.
 *
 * Covers the whole package contract: the `getCoverageResult` scan core (not
 * mounted / unmounted root / lenient `safeParse` skip / domain filter /
 * confirmed-vs-draft split / per-domain tally), the `formatGetCoverage`
 * projection, and the registered tool shell (`output.render`,
 * `output.presentationMeta`, `execute` incl. its abort guard, `presentCall`,
 * `presentResult`).
 *
 * `loadTables` / `loadEvents` read the real filesystem (semantic-layer
 * `src/io.ts`), so the scan cases build a throwaway semantic root the same way
 * `packages/data/semantic-layer/tests/snapshot.spec.ts` does: `mkdtempSync`
 * under the OS temp dir (a private, unpredictable root per case) plus
 * `dumpYaml` definitions, torn down in `afterEach`.
 *
 * Run: `pnpm vitest run packages/data/tool-get-coverage`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { dumpYaml } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer/src/index.ts'
import {
  apply,
  formatGetCoverage,
  getCoverageResult,
  type CoverageStats,
  type GetCoverageResult,
} from '../src/index.ts'

// ── The registered-tool harness ─────────────────────────────────────────────

/** The subset of the registered tool definition this spec exercises. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: unknown,
    ) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta: (args: unknown, value: unknown) => unknown
  }
  readonly execute: (
    args: { readonly domain?: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<GetCoverageResult>
  readonly presentCall: (args?: unknown) => unknown
  readonly presentResult: (
    args: unknown,
    result: { readonly isError?: boolean; readonly meta?: unknown },
  ) => unknown
}

/**
 * Capture the tool definition `apply` registers — no real Cordis container.
 * `services` is the `ctx.get(key)` lookup table; a key absent from it returns
 * `undefined`, which models "that service is not mounted".
 */
function registerTool(services: Record<string, unknown> = {}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    get: (key: string) => services[key],
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

// ── The throwaway semantic root ─────────────────────────────────────────────

/** A confirmed table in two domains, carrying two embedded metrics. */
const TABLE_CONFIRMED = {
  table_name: 'dws_pay_order_di',
  table_comment: '充值订单',
  description: '充值订单汇总表',
  domains: ['pay', 'core'],
  granularity: 'daily',
  columns: [{ name: 'order_id', type: 'string', comment: 'ID', role: 'dimension' }],
  metrics: {
    total_amount: { expression: 'SUM(amount)', description: '总充值金额' },
    order_count: { expression: 'COUNT(1)', description: '订单数' },
  },
  partitions: [{ name: 'ds', type: 'string' }],
  confirmation: { status: 'confirmed', confirmed_by: 'analyst', confirmed_at: '2026-01-01' },
}

/** A draft table in one domain, carrying no metrics. */
const TABLE_DRAFT = {
  table_name: 'dws_login_di',
  table_comment: '登录明细',
  description: '登录明细表',
  domains: ['core'],
  granularity: 'daily',
  columns: [{ name: 'user_id', type: 'string', comment: 'UID', role: 'dimension' }],
  metrics: {},
  partitions: [{ name: 'ds', type: 'string' }],
  confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
}

/**
 * `table_name` is a string (so the lenient `loadTables` scan yields it) but
 * `domains` is a scalar where the schema demands an array, so
 * `TableDefinitionSchema.safeParse` fails and the scan must skip it.
 */
const TABLE_SCHEMA_INVALID = { table_name: 'dws_broken_di', domains: 'core' }

/** A confirmed event in one domain, carrying one embedded metric. */
const EVENT_CONFIRMED = {
  name: 'game.pay',
  description: '充值埋点',
  domains: ['pay'],
  params_fields: { amount: { type: 'double', description: '充值金额' } },
  metrics: { pay_amount: { expression: 'sum(amount)', description: '充值金额' } },
  confirmation: { status: 'confirmed', confirmed_by: 'analyst', confirmed_at: '2026-01-01' },
}

/** A draft event in one domain, carrying no metrics. */
const EVENT_DRAFT = {
  name: 'app.open',
  description: '启动埋点',
  domains: ['core'],
  params_fields: {},
  metrics: {},
  confirmation: { status: 'draft', confirmed_by: '', confirmed_at: '' },
}

/** `name` is a string but `domains` is a scalar — `safeParse` fails, scan skips. */
const EVENT_SCHEMA_INVALID = { name: 'zz.broken', domains: 'core' }

const layers: string[] = []

/**
 * Build a private throwaway semantic root: two parseable tables plus one
 * schema-invalid table, and two parseable events plus one schema-invalid
 * event, spread over the `pay` and `core` event domains.
 * @returns the absolute path of the new semantic root.
 */
function makeLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-get-coverage-'))
  layers.push(dir)
  mkdirSync(join(dir, 'tables'), { recursive: true })
  mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
  mkdirSync(join(dir, 'events', 'core'), { recursive: true })
  writeFileSync(join(dir, 'tables', 'dws_pay_order_di.yaml'), dumpYaml(TABLE_CONFIRMED))
  writeFileSync(join(dir, 'tables', 'dws_login_di.yaml'), dumpYaml(TABLE_DRAFT))
  writeFileSync(join(dir, 'tables', 'dws_broken_di.yaml'), dumpYaml(TABLE_SCHEMA_INVALID))
  writeFileSync(join(dir, 'events', 'pay', 'game.pay.yaml'), dumpYaml(EVENT_CONFIRMED))
  writeFileSync(join(dir, 'events', 'core', 'app.open.yaml'), dumpYaml(EVENT_DRAFT))
  writeFileSync(join(dir, 'events', 'core', 'zz.broken.yaml'), dumpYaml(EVENT_SCHEMA_INVALID))
  return dir
}

/**
 * Build a private throwaway semantic root holding a single confirmed event and
 * no `tables/` directory at all, so the event tally is the first writer of its
 * domain counter (and the table scan sees an absent directory).
 * @returns the absolute path of the new semantic root.
 */
function makeEventsOnlyLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-get-coverage-events-'))
  layers.push(dir)
  mkdirSync(join(dir, 'events', 'pay'), { recursive: true })
  writeFileSync(join(dir, 'events', 'pay', 'game.pay.yaml'), dumpYaml(EVENT_CONFIRMED))
  return dir
}

/** A `ctx.schema` stand-in whose only field `getCoverageResult` reads is the root. */
function stubSchema(semanticRoot: string): SemanticLayerService {
  return { semanticRoot } as unknown as SemanticLayerService
}

afterEach(() => {
  while (layers.length > 0) rmSync(layers.pop()!, { recursive: true, force: true })
})

/** The stats the full fixture layer produces with no domain filter. */
const FIXTURE_STATS: CoverageStats = {
  table_count: 2,
  event_count: 2,
  metric_count: 3,
  confirmed_count: 2,
  draft_count: 2,
  domain_counts: { core: 3, pay: 2 },
}

// ── getCoverageResult ───────────────────────────────────────────────────────

describe('getCoverageResult', () => {
  it('reports the honest not-mounted failure when ctx.schema is absent', () => {
    expect(getCoverageResult(undefined)).toEqual({
      ok: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })

  it('reports all-zero stats without scanning the working directory when the root is unset', () => {
    // '' is the value SemanticLayerService resolves an unset semanticRoot to.
    // Without the guard, loadTables('') / loadEvents('') would resolve
    // `tables` / `events` RELATIVE TO process.cwd() — so run from inside a
    // populated layer and prove none of its assets leak into the stats.
    const populated = makeLayer()
    const previous = process.cwd()
    process.chdir(populated)
    try {
      expect(getCoverageResult(stubSchema(''))).toEqual({
        ok: true,
        stats: {
          table_count: 0,
          event_count: 0,
          metric_count: 0,
          confirmed_count: 0,
          draft_count: 0,
          domain_counts: {},
        },
      })
    } finally {
      process.chdir(previous)
    }
  })

  it('counts tables, events and embedded metrics, skipping schema-invalid definitions', () => {
    const result = getCoverageResult(stubSchema(makeLayer()))
    expect(result.ok).toBe(true)
    // dws_broken_di / zz.broken fail safeParse -> skipped, so 2 tables + 2 events.
    expect(result.stats).toEqual(FIXTURE_STATS)
  })

  it('splits confirmed and draft assets by confirmation.status', () => {
    const stats = getCoverageResult(stubSchema(makeLayer())).stats
    // dws_pay_order_di + game.pay are confirmed; dws_login_di + app.open are draft.
    expect(stats?.confirmed_count).toBe(2)
    expect(stats?.draft_count).toBe(2)
  })

  it('tallies every domain an asset declares, accumulating repeats', () => {
    const stats = getCoverageResult(stubSchema(makeLayer())).stats
    // core: dws_login_di + dws_pay_order_di + app.open; pay: dws_pay_order_di + game.pay.
    expect(stats?.domain_counts).toEqual({ core: 3, pay: 2 })
  })

  it('counts only assets belonging to the requested domain when one is given', () => {
    const result = getCoverageResult(stubSchema(makeLayer()), 'pay')
    // dws_login_di + app.open declare only `core` -> filtered out.
    expect(result.stats).toEqual({
      table_count: 1,
      event_count: 1,
      metric_count: 3,
      confirmed_count: 2,
      draft_count: 0,
      // the surviving dws_pay_order_di still contributes its `core` membership
      domain_counts: { pay: 2, core: 1 },
    })
  })

  it('starts an event domain counter from zero when no table introduced that domain', () => {
    // Events-only root: `pay` is unseen by the table scan, so the event tally
    // must seed it at 1 rather than carry a table-side count.
    const result = getCoverageResult(stubSchema(makeEventsOnlyLayer()))
    expect(result.stats).toEqual({
      table_count: 0,
      event_count: 1,
      metric_count: 1,
      confirmed_count: 1,
      draft_count: 0,
      domain_counts: { pay: 1 },
    })
  })

  it('returns empty stats when the requested domain matches no asset', () => {
    const result = getCoverageResult(stubSchema(makeLayer()), 'no-such-domain')
    expect(result.stats).toEqual({
      table_count: 0,
      event_count: 0,
      metric_count: 0,
      confirmed_count: 0,
      draft_count: 0,
      domain_counts: {},
    })
  })
})

// ── formatGetCoverage ───────────────────────────────────────────────────────

describe('formatGetCoverage', () => {
  it('renders the failure message when the result is not ok', () => {
    expect(formatGetCoverage({ ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' }))
      .toBe('semantic-layer not mounted (ctx.schema unavailable)')
  })

  it('falls back to a neutral failure line when a not-ok result carries no message', () => {
    expect(formatGetCoverage({ ok: false })).toBe('get_coverage failed')
  })

  it('reports "no stats" when an ok result carries no stats block', () => {
    expect(formatGetCoverage({ ok: true })).toBe('no stats')
  })

  it('renders totals, status and the domain breakdown ordered by descending count', () => {
    expect(formatGetCoverage({ ok: true, stats: FIXTURE_STATS })).toBe(
      'Coverage: 7 total assets (2 tables, 2 events, 3 metrics)\n'
      + 'Status: 2 confirmed, 2 draft\n'
      + 'Domains (2): core(3), pay(2)',
    )
  })

  it('sorts the domain breakdown by count, not by insertion order', () => {
    const text = formatGetCoverage({
      ok: true,
      stats: {
        table_count: 3,
        event_count: 0,
        metric_count: 0,
        confirmed_count: 3,
        draft_count: 0,
        domain_counts: { small: 1, big: 5, mid: 3 },
      },
    })
    expect(text).toBe(
      'Coverage: 3 total assets (3 tables, 0 events, 0 metrics)\n'
      + 'Status: 3 confirmed, 0 draft\n'
      + 'Domains (3): big(5), mid(3), small(1)',
    )
  })

  it('omits the domain line entirely when no domain has assets', () => {
    expect(formatGetCoverage({
      ok: true,
      stats: {
        table_count: 0,
        event_count: 0,
        metric_count: 0,
        confirmed_count: 0,
        draft_count: 0,
        domain_counts: {},
      },
    })).toBe(
      'Coverage: 0 total assets (0 tables, 0 events, 0 metrics)\n'
      + 'Status: 0 confirmed, 0 draft',
    )
  })
})

// ── apply / the registered tool shell ───────────────────────────────────────

describe('apply', () => {
  it('registers get_coverage with a description, output schema and presenters', () => {
    const def = registerTool()
    expect(def.name).toBe('get_coverage')
    expect(def.description).toContain('coverage statistics')
    expect(def.output.schema).toBeDefined()
    expect(typeof def.output.render).toBe('function')
    expect(typeof def.output.presentationMeta).toBe('function')
    expect(typeof def.execute).toBe('function')
    expect(typeof def.presentCall).toBe('function')
    expect(typeof def.presentResult).toBe('function')
  })
})

describe('get_coverage output.render', () => {
  it('renders an ok result as the formatted coverage text block', () => {
    const def = registerTool()
    const out = def.output.render({}, { ok: true, stats: FIXTURE_STATS })
    expect(out).toEqual([{
      type: 'text',
      text: 'Coverage: 7 total assets (2 tables, 2 events, 3 metrics)\n'
        + 'Status: 2 confirmed, 2 draft\n'
        + 'Domains (2): core(3), pay(2)',
    }])
  })

  it('renders a not-ok result as its failure message', () => {
    const def = registerTool()
    const out = def.output.render({}, { ok: false, message: 'semantic-layer not mounted (ctx.schema unavailable)' })
    expect(out).toEqual([{ type: 'text', text: 'semantic-layer not mounted (ctx.schema unavailable)' }])
  })
})

describe('get_coverage output.presentationMeta', () => {
  it('projects an ok result with its stats block', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({}, { ok: true, stats: FIXTURE_STATS }))
      .toEqual({ ok: true, stats: FIXTURE_STATS })
  })

  it('projects an ok result without stats as the bare ok flag', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({}, { ok: true })).toEqual({ ok: true })
  })

  it('projects a not-ok result with its message', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({}, { ok: false, message: 'boom' }))
      .toEqual({ ok: false, message: 'boom' })
  })

  it('projects a not-ok result without a message as the bare failure flag', () => {
    const def = registerTool()
    expect(def.output.presentationMeta({}, { ok: false })).toEqual({ ok: false })
  })
})

describe('get_coverage execute', () => {
  it('rejects with the abort message when the signal is already aborted', async () => {
    const def = registerTool({ schema: stubSchema('') })
    const controller = new AbortController()
    controller.abort()
    await expect(def.execute({}, { signal: controller.signal }))
      .rejects.toThrow(new Error('get_coverage aborted'))
  })

  it('returns the not-mounted failure when ctx.schema is unavailable', async () => {
    const def = registerTool()
    await expect(def.execute({}, { signal: new AbortController().signal })).resolves.toEqual({
      ok: false,
      message: 'semantic-layer not mounted (ctx.schema unavailable)',
    })
  })

  it('returns the scanned stats from the mounted ctx.schema root', async () => {
    const def = registerTool({ schema: stubSchema(makeLayer()) })
    const out = await def.execute({}, { signal: new AbortController().signal })
    expect(out.ok).toBe(true)
    expect(out.stats).toEqual(FIXTURE_STATS)
  })

  it('threads the domain argument into the scan so the stats are scoped', async () => {
    const def = registerTool({ schema: stubSchema(makeLayer()) })
    const out = await def.execute({ domain: 'pay' }, { signal: new AbortController().signal })
    expect(out.stats).toEqual({
      table_count: 1,
      event_count: 1,
      metric_count: 3,
      confirmed_count: 2,
      draft_count: 0,
      domain_counts: { pay: 2, core: 1 },
    })
  })
})

describe('get_coverage presentCall', () => {
  it('presents a generic search card titled "Coverage Statistics"', () => {
    const def = registerTool()
    expect(def.presentCall({})).toEqual({
      card: 'generic',
      title: 'Coverage Statistics',
      kind: 'search',
    })
  })
})

describe('get_coverage presentResult', () => {
  it('presents nothing for an errored call', () => {
    const def = registerTool()
    expect(def.presentResult({}, { isError: true })).toBeUndefined()
  })

  it('presents the unavailable card when the result carries no presentation meta', () => {
    const def = registerTool()
    expect(def.presentResult({}, {})).toEqual({ card: 'generic', title: 'Coverage unavailable' })
  })

  it('presents the unavailable card when the meta is ok but carries no stats', () => {
    const def = registerTool()
    expect(def.presentResult({}, { meta: { ok: true } }))
      .toEqual({ card: 'generic', title: 'Coverage unavailable' })
  })

  it('presents the asset total with the confirmed/draft split', () => {
    const def = registerTool()
    // Distinct table/event/metric and confirmed/draft numbers so neither the
    // total's summands nor the two status slots can be swapped unnoticed.
    const stats: CoverageStats = {
      table_count: 4,
      event_count: 3,
      metric_count: 5,
      confirmed_count: 2,
      draft_count: 6,
      domain_counts: { pay: 4 },
    }
    expect(def.presentResult({}, { meta: { ok: true, stats } })).toEqual({
      card: 'generic',
      title: '12 assets · 2 confirmed · 6 draft',
    })
  })
})
