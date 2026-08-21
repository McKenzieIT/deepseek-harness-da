/**
 * D2e corpus enrichment (2026-08-21) — the pure projection from semantic-layer
 * events + terminology to a retrieval corpus. Packs `params_fields` (field name
 * + field description) + `terminology` slang into the indexed `description`;
 * does NOT index `domain` (probe refuted domain — coarse Chinese domain names
 * inflate false-positives, losing item.add/shop.buy). Mirrors the
 * probe_hypotheses.py `params+term` variant (pack-into-description ×1) that
 * measured 54.8% strict / 58.1% loose on the real Bm25Linker default (vs the
 * §7 HybridRetriever port's 58.1%/61.3% — the bigram-only port overestimated
 * ~3pp via floor-noise inclusion; weighting ×3 was refuted: equal-strict,
 * worse-loose).
 *
 * Run: `pnpm vitest run packages/data/semantic-layer`
 */
import { test, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import {
  buildRetrievalCorpus,
  parseTerminology,
  type EventCorpusInput,
} from '../src/corpus.ts'
import { loadRetrievalCorpus, invalidateCaches, getCorpusVersion } from '../src/io.ts'
import { SemanticLayerService } from '../src/index.ts'
import type { Context } from '@deepseek-ai/cordis'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')

// ── parseTerminology: invert slang->events to event->[slangs] ────────────────

test('parseTerminology inverts slang->events to event->[slangs], splitting multi-alias slang on / , ， 、', () => {
  const raw = {
    scope_id: '10000147',
    terminology: [
      { slang: '日活 / DAU', maps_to: { events: ['role.online', 'user.login'] } },
      { slang: '氪金,充值、付费', maps_to: { events: ['recharge'] } },
    ],
  }
  const e2s = parseTerminology(raw)
  expect(e2s['role.online']).toEqual(['日活', 'DAU'])
  expect(e2s['user.login']).toEqual(['日活', 'DAU'])
  expect(e2s['recharge']).toEqual(['氪金', '充值', '付费'])
})

test('parseTerminology dedupes repeated slang aliases preserving first-seen order', () => {
  const raw = { terminology: [{ slang: '充值/充值', maps_to: { events: ['recharge'] } }] }
  expect(parseTerminology(raw)['recharge']).toEqual(['充值'])
})

test('parseTerminology returns empty map for missing/empty/malformed terminology', () => {
  expect(parseTerminology(null)).toEqual({})
  expect(parseTerminology({})).toEqual({})
  expect(parseTerminology({ terminology: 'not-a-list' })).toEqual({})
  expect(parseTerminology({ terminology: [{ slang: 'x', maps_to: {} }] })).toEqual({})
  expect(parseTerminology({ terminology: [{ maps_to: { events: ['e'] } }] })).toEqual({})
})

test('parseTerminology skips malformed slang/maps_to entries without throwing', () => {
  const raw = {
    terminology: [
      { slang: '留存', maps_to: { events: ['role.online'] } },
      { slang: 42, maps_to: { events: ['bad'] } }, // non-string slang -> skipped
      { slang: '新增', maps_to: { events: 'not-a-list' } }, // events not a list -> skipped
    ],
  }
  const e2s = parseTerminology(raw)
  expect(e2s['role.online']).toEqual(['留存'])
  expect(e2s['bad']).toBeUndefined()
})

// ── buildRetrievalCorpus: pack description + params_fields + terminology ────

test('buildRetrievalCorpus packs event desc + params_fields(name+desc) + terminology slang; exact composition + payload carries original', () => {
  const events: EventCorpusInput[] = [{
    name: 'recharge',
    description: '充值',
    params_fields: {
      roleId: { description: '角色id' },
      money: { description: '充值金额' },
    },
    metrics: { recharge_cnt: {} },
  }]
  const term = { recharge: ['氪金', '充值', '付费'] }
  const corpus = buildRetrievalCorpus(events, term)
  expect(corpus).toHaveLength(1)
  const item = corpus[0]!
  expect(item.id).toBe('recharge')
  // description = event desc + each param (name + desc) + each slang, space-joined
  expect(item.description).toBe('充值 roleId 角色id money 充值金额 氪金 充值 付费')
  expect(item.metrics).toEqual({ recharge_cnt: {} })
  // payload carries the original event (short description + params_fields) for the hit
  expect(item.payload).toBe(events[0])
})

test('buildRetrievalCorpus does NOT index domain — domain never enters the corpus text', () => {
  // EventCorpusInput deliberately omits `domain`; even an event whose source YAML
  // carried a domain must not see it in the indexed description.
  const events: EventCorpusInput[] = [{ name: 'item.add', description: '道具产出' }]
  const [item] = buildRetrievalCorpus(events, {})
  expect(item.description).toBe('道具产出')
  expect(item.description).not.toContain('付费经济')
})

test('buildRetrievalCorpus omits empty param descriptions (field name only) and missing terminology', () => {
  const events: EventCorpusInput[] = [{
    name: 'shop.buy',
    description: '商城购买',
    params_fields: { count: { description: '' }, gold: {} },
  }]
  const [item] = buildRetrievalCorpus(events, {})
  // field name always indexed; empty/missing descriptions skipped
  expect(item.description).toBe('商城购买 count gold')
})

test('buildRetrievalCorpus handles events with no description/params/terminology (empty description, not undefined)', () => {
  const events: EventCorpusInput[] = [{ name: 'bare.event' }]
  const [item] = buildRetrievalCorpus(events, {})
  expect(item.id).toBe('bare.event')
  expect(item.description).toBe('')
  expect(item.metrics).toBeUndefined()
})

test('buildRetrievalCorpus projects multiple events preserving order', () => {
  const events: EventCorpusInput[] = [
    { name: 'role.online', description: '玩家上线', params_fields: { roleId: { description: '角色id' } } },
    { name: 'recharge', description: '充值' },
  ]
  const term = { 'role.online': ['日活'] }
  const corpus = buildRetrievalCorpus(events, term)
  expect(corpus.map(c => c.id)).toEqual(['role.online', 'recharge'])
  expect(corpus[0]!.description).toBe('玩家上线 roleId 角色id 日活')
  expect(corpus[1]!.description).toBe('充值')
})

// ── loadRetrievalCorpus: io wiring (events + terminology -> enriched corpus) ─

test('loadRetrievalCorpus(semanticLayer) reads events + terminology + enriches (D2e io wiring)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'd2e-io-'))
  const layer = join(scratch, '10000demo')
  mkdirSync(join(layer, 'events', 'role_public'), { recursive: true })
  copyFileSync(join(FIXTURES, 'role_online.yaml'), join(layer, 'events', 'role_public', 'role.online.yaml'))
  writeFileSync(join(layer, 'config.yaml'), 'project:\n  name: demo\n  scope_id: 10000demo\n')
  writeFileSync(join(layer, 'terminology.yaml'), yaml.dump({
    scope_id: '10000demo',
    terminology: [{ slang: '日活 / DAU', maps_to: { events: ['role.online'] }, definition: 'dau' }],
  }))
  try {
    const corpus = loadRetrievalCorpus(layer)
    expect(corpus).toHaveLength(1)
    const item = corpus[0]!
    expect(item.id).toBe('role.online')
    // params_fields (field name + desc) packed — role_online fixture fields
    expect(item.description).toContain('玩家上线')
    expect(item.description).toContain('role_id')
    expect(item.description).toContain('角色id')
    expect(item.description).toContain('amount')
    expect(item.description).toContain('充值金额')
    // terminology slang packed
    expect(item.description).toContain('日活')
    expect(item.description).toContain('DAU')
    // domain NOT indexed (role_online fixture carries domain 用户生命周期)
    expect(item.description).not.toContain('用户生命周期')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('loadRetrievalCorpus returns [] when semanticLayer has no events (no throw)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'd2e-empty-'))
  const layer = join(scratch, '10000demo')
  mkdirSync(layer, { recursive: true })
  writeFileSync(join(layer, 'config.yaml'), 'project:\n  name: demo\n')
  try {
    expect(loadRetrievalCorpus(layer)).toEqual([])
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('loadRetrievalCorpus is lenient on a corrupt terminology.yaml (events still indexed, no slang, no throw)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'd2e-corrupt-term-'))
  const layer = join(scratch, '10000demo')
  mkdirSync(join(layer, 'events', 'role_public'), { recursive: true })
  copyFileSync(join(FIXTURES, 'role_online.yaml'), join(layer, 'events', 'role_public', 'role.online.yaml'))
  writeFileSync(join(layer, 'config.yaml'), 'project:\n  name: demo\n')
  // corrupt (unterminated flow) terminology.yaml — yaml.load rejects this
  writeFileSync(join(layer, 'terminology.yaml'), 'a: [1, 2\n', 'utf8')
  try {
    const corpus = loadRetrievalCorpus(layer) // must not throw
    expect(corpus).toHaveLength(1)
    expect(corpus[0]!.id).toBe('role.online')
    // event still indexed (params_fields packed); no slang (terminology unreadable)
    expect(corpus[0]!.description).toContain('玩家上线')
    expect(corpus[0]!.description).not.toContain('日活')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('buildRetrievalCorpus skips params_fields whose value is not a plain object (mirrors probe; no stray field-name token)', () => {
  // Simulates unvalidated raw YAML where a params_fields value is a string/array
  // (the probe's params_text does `if not isinstance(fdef, dict): continue`).
  const events = [{
    name: 'e',
    params_fields: { good: { description: 'x' }, bad: 'not-an-object', arr: [1, 2] },
  } as unknown as EventCorpusInput]
  const [item] = buildRetrievalCorpus(events, {})
  // only the well-formed field 'good' is indexed; 'bad' + 'arr' skipped
  expect(item.description).toBe('good x')
})

// ── D2f corpus-version counter (cache-invalidation signal) ─────────────────
// invalidateCaches is the chokepoint every writer (writeEventYaml / writeTable /
// updateTableMeta / syncWriteDefinitions) calls after a successful write. D2f
// bumps a per-path corpus-version counter here so a cached enriched Bm25Linker
// (tool-search-data-sources, keyed by ctx.schema) can detect a stale corpus and
// rebuild — the D2e-deferred cache-invalidation wiring (mid-session event edits
// no longer leave the enriched linker stale until reboot). The counter is
// path-scoped (a write to layer A must not invalidate layer B's cache).
test('getCorpusVersion bumps after invalidateCaches(semanticLayer); independent per path', () => {
  const pa = '/d2f-counter-test-A'
  const pb = '/d2f-counter-test-B'
  const a0 = getCorpusVersion(pa)
  const b0 = getCorpusVersion(pb)
  invalidateCaches(pa)
  expect(getCorpusVersion(pa)).toBe(a0 + 1)
  expect(getCorpusVersion(pb)).toBe(b0) // pa's bump does not touch pb
  invalidateCaches(pa)
  invalidateCaches(pb)
  expect(getCorpusVersion(pa)).toBe(a0 + 2)
  expect(getCorpusVersion(pb)).toBe(b0 + 1)
})

// ── D2f Service corpusVersion() (the ctx.schema signal tool-search probes) ──
// SemanticLayerService.corpusVersion() is the structural surface tool-search
// reads (no static dep) to detect a stale enriched linker. It delegates to the
// per-path counter, so a writeEventYaml -> invalidateCaches bumps the Service's
// corpusVersion -> tool-search rebuilds. The ctx shell only needs reflect.provide
// (Cordis Service registration); corpusVersion reads this.semanticRoot + the
// counter, no ctx — mirroring how D2e's loadRetrievalCorpus is a delegate the
// Service exposes for tool-search's structural cast.
test('SemanticLayerService.corpusVersion() reflects invalidateCaches(semanticRoot)', () => {
  const layer = '/d2f-svc-version-test'
  const ctx = { reflect: { provide: () => {} } } as unknown as Context
  const svc = new SemanticLayerService(ctx, { semanticRoot: layer, scopeId: '' })
  const before = svc.corpusVersion()
  invalidateCaches(layer)
  expect(svc.corpusVersion()).toBe(before + 1)
})

// D2h corpus variant (selectable enrichment form): buildRetrievalCorpus takes a
// variant — 'params+term' (default, D2e-shipped: desc + params_fields + slang)
// or 'term-only' (D2g verdict (A) higher-recall on the shipped Bm25Linker: desc
// + terminology slang ONLY, dropping params_fields whose text dilutes the
// CJK-synonym slang bridge via BM25 tf-saturation + length norm). 'params-only'
// is NOT shipped (D2g measured it 63.7% strict, strictly worse than params+term
// 68.1% + degenerate with params+term-on-no-slang); a future ticket can add it
// as a non-breaking enum extension.
test('buildRetrievalCorpus variant="term-only" packs desc + terminology slang but NOT params_fields (D2h higher-recall form)', () => {
  const events: EventCorpusInput[] = [{
    name: 'item.add',
    description: '添加道具',
    params_fields: { itemId: { description: '道具id' }, count: { description: '数量' } },
  }]
  const term = { 'item.add': ['道具产出', '道具增加'] }
  const [item] = buildRetrievalCorpus(events, term, 'term-only')
  // desc + slang packed
  expect(item.description).toBe('添加道具 道具产出 道具增加')
  // params_fields NOT packed (the term-only drop)
  expect(item.description).not.toContain('道具id')
  expect(item.description).not.toContain('数量')
  expect(item.description).not.toContain('itemId')
  expect(item.description).not.toContain('count')
})

test('buildRetrievalCorpus variant="params+term" (default) packs desc + params_fields + slang (D2e shipped behavior preserved)', () => {
  const events: EventCorpusInput[] = [{
    name: 'item.add',
    description: '添加道具',
    params_fields: { itemId: { description: '道具id' } },
  }]
  const term = { 'item.add': ['道具产出'] }
  // default variant (omitted) = params+term = shipped behavior
  const def = buildRetrievalCorpus(events, term)
  expect(def[0]!.description).toBe('添加道具 itemId 道具id 道具产出')
  // explicit 'params+term' matches the default
  const explicit = buildRetrievalCorpus(events, term, 'params+term')
  expect(explicit[0]!.description).toBe(def[0]!.description)
})

test('loadRetrievalCorpus(layer, "term-only") packs slang but NOT params_fields (D2h io passthrough)', () => {
  // reuses the role_online fixture (role_id/角色id + amount/充值金额 params +
  // 日活/DAU slang) from the D2e io test; term-only must drop the params slice.
  const scratch = mkdtempSync(join(tmpdir(), 'd2h-io-term-'))
  const layer = join(scratch, '10000demo')
  mkdirSync(join(layer, 'events', 'role_public'), { recursive: true })
  copyFileSync(join(FIXTURES, 'role_online.yaml'), join(layer, 'events', 'role_public', 'role.online.yaml'))
  writeFileSync(join(layer, 'config.yaml'), 'project:\n  name: demo\n  scope_id: 10000demo\n')
  writeFileSync(join(layer, 'terminology.yaml'), yaml.dump({
    scope_id: '10000demo',
    terminology: [{ slang: '日活 / DAU', maps_to: { events: ['role.online'] }, definition: 'dau' }],
  }))
  try {
    // term-only: slang packed, params_fields NOT packed (the variant drop)
    const termOnly = loadRetrievalCorpus(layer, 'term-only')
    expect(termOnly).toHaveLength(1)
    expect(termOnly[0]!.description).toContain('日活')
    expect(termOnly[0]!.description).toContain('DAU')
    expect(termOnly[0]!.description).not.toContain('角色id')
    expect(termOnly[0]!.description).not.toContain('充值金额')
    expect(termOnly[0]!.description).not.toContain('role_id')
    expect(termOnly[0]!.description).not.toContain('amount')
    // default (params+term, omitted): params still packed (shipped behavior)
    const def = loadRetrievalCorpus(layer)
    expect(def[0]!.description).toContain('角色id')
    expect(def[0]!.description).toContain('充值金额')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('SemanticLayerService.loadRetrievalCorpus() honors corpusVariant config (D2h config→Service→io)', () => {
  // a real layer with one event (role.online: role_id/角色id + amount/充值金额
  // params + 日活/DAU slang) — the Service's mount-time corpusVariant config
  // threads through loadRetrievalCorpus -> io -> buildRetrievalCorpus.
  const scratch = mkdtempSync(join(tmpdir(), 'd2h-svc-variant-'))
  const layer = join(scratch, '10000demo')
  mkdirSync(join(layer, 'events', 'role_public'), { recursive: true })
  copyFileSync(join(FIXTURES, 'role_online.yaml'), join(layer, 'events', 'role_public', 'role.online.yaml'))
  writeFileSync(join(layer, 'config.yaml'), 'project:\n  name: demo\n  scope_id: 10000demo\n')
  writeFileSync(join(layer, 'terminology.yaml'), yaml.dump({
    scope_id: '10000demo',
    terminology: [{ slang: '日活 / DAU', maps_to: { events: ['role.online'] }, definition: 'dau' }],
  }))
  try {
    const ctx = { reflect: { provide: () => {} } } as unknown as Context
    // term-only Service: slang packed, params NOT (the variant config threads)
    const termSvc = new SemanticLayerService(ctx, { semanticRoot: layer, scopeId: '', corpusVariant: 'term-only' })
    const termCorpus = termSvc.loadRetrievalCorpus()
    expect(termCorpus[0]!.description).toContain('日活')
    expect(termCorpus[0]!.description).not.toContain('角色id')
    expect(termSvc.corpusVariant).toBe('term-only')
    // default (params+term, omitted) Service: params packed (shipped preserved)
    const defSvc = new SemanticLayerService(ctx, { semanticRoot: layer, scopeId: '' })
    const defCorpus = defSvc.loadRetrievalCorpus()
    expect(defCorpus[0]!.description).toContain('角色id')
    expect(defSvc.corpusVariant).toBe('params+term')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
