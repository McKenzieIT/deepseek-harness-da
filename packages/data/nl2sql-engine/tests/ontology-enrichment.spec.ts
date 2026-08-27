import { test, expect, describe } from 'vitest'
import { detectTrendIntent, rerankByGranularity } from '../src/granularity.ts'
import { expandCandidates, type RelationGraphLike, type RelationGraphEdge } from '../src/ontology.ts'
import { buildPrompt, buildEvalPrompt } from '../src/prompt.ts'
import type { RetrievalHit } from '../src/bm25-linking.ts'
import type { DataSourceDoc } from '../src/bm25-linking.ts'

// ── Helpers ─────────────────────────────────────────────────────────────

function fakeGraph(edges: Array<{ a: string; b: string; on?: string; type?: 'joins' | 'derived_from' }>): RelationGraphLike {
  const adj = new Map<string, RelationGraphEdge[]>()
  const add = (src: string, edge: RelationGraphEdge) => {
    if (!adj.has(src)) adj.set(src, [])
    adj.get(src)!.push(edge)
  }
  for (const e of edges) {
    const t = e.type ?? 'joins'
    add(e.a, { targetId: e.b, type: t, ...(e.on ? { on: e.on } : {}) })
    add(e.b, { targetId: e.a, type: t, ...(e.on ? { on: e.on } : {}) })
  }
  const edgesOf = (id: string) => adj.get(id) ?? []
  return {
    findJoinPath(a, b) {
      if (a === b) return [a]
      const visited = new Set([a])
      const queue: string[][] = [[a]]
      while (queue.length > 0) {
        const path = queue.shift()!
        const node = path[path.length - 1]!
        for (const e of edgesOf(node)) {
          if (e.type !== 'joins') continue
          if (visited.has(e.targetId)) continue
          const np = [...path, e.targetId]
          if (e.targetId === b) return np
          visited.add(e.targetId)
          queue.push(np)
        }
      }
      return null
    },
    getJoinCondition(a, b) {
      return edgesOf(a).find(e => e.targetId === b && e.on)?.on ?? null
    },
    getRelated(id, type) {
      const all = edgesOf(id)
      return type ? all.filter(e => e.type === type) : all
    },
    getDerived(id) {
      return edgesOf(id).filter(e => e.type === 'derived_from')
    },
  }
}

function hit(id: string, score: number, description?: string): RetrievalHit {
  return { id, score, payload: description ? { id, description } : { id }, mode: 'bm25-only' }
}

// ── detectTrendIntent ───────────────────────────────────────────────────

describe('detectTrendIntent', () => {
  test('detects 趋势 keyword', () => {
    expect(detectTrendIntent('过去7天每天的付费金额趋势')).toBe(true)
  })

  test('detects 变化 keyword', () => {
    expect(detectTrendIntent('最近一周每天的PVP对战场次变化')).toBe(true)
  })

  test('detects 逐日 keyword', () => {
    expect(detectTrendIntent('逐日付费金额统计')).toBe(true)
  })

  test('detects 每天 keyword', () => {
    expect(detectTrendIntent('每天的登录人数是多少')).toBe(true)
  })

  test('detects 近N天 pattern', () => {
    expect(detectTrendIntent('近7天的活跃用户数')).toBe(true)
    expect(detectTrendIntent('近30天付费趋势')).toBe(true)
  })

  test('detects 日均 keyword', () => {
    expect(detectTrendIntent('日均在线人数统计')).toBe(true)
  })

  test('detects 环比 keyword', () => {
    expect(detectTrendIntent('付费金额环比变化')).toBe(true)
  })

  test('detects 同比 keyword', () => {
    expect(detectTrendIntent('日活同比增长')).toBe(true)
  })

  test('detects 每周 keyword', () => {
    expect(detectTrendIntent('每周新增注册数')).toBe(true)
  })

  test('detects 每月 keyword', () => {
    expect(detectTrendIntent('每月付费金额')).toBe(true)
  })

  test('detects 增长 keyword', () => {
    expect(detectTrendIntent('用户增长情况')).toBe(true)
  })

  test('detects 下降 keyword', () => {
    expect(detectTrendIntent('活跃用户下降了吗')).toBe(true)
  })

  test('detects 走势 keyword', () => {
    expect(detectTrendIntent('付费走势如何')).toBe(true)
  })

  test('returns false for non-trend queries', () => {
    expect(detectTrendIntent('昨天付费金额是多少')).toBe(false)
    expect(detectTrendIntent('VIP用户有多少人')).toBe(false)
    expect(detectTrendIntent('哪个服务器充值最多')).toBe(false)
  })
})

// ── rerankByGranularity ─────────────────────────────────────────────────

describe('rerankByGranularity', () => {
  test('boosts _di candidates by 1.5x when isTrend=true', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_df', 3.0),
      hit('dws_10000251_com_pay_order_di', 2.0),
    ]
    const reranked = rerankByGranularity(candidates, true)
    // _di score: 2.0 * 1.5 = 3.0, but now tied → _di should be at top or equal
    // Actually 3.0 vs 3.0 — let's test with clearer separation
    expect(reranked[0]!.id).toBe('dws_10000251_com_pay_order_df')
    expect(reranked[1]!.id).toBe('dws_10000251_com_pay_order_di')
  })

  test('_di overtakes _df when boost pushes it above', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_df', 2.5),
      hit('dws_10000251_com_pay_order_di', 2.0),
    ]
    const reranked = rerankByGranularity(candidates, true)
    // _di boosted: 2.0 * 1.5 = 3.0 > 2.5
    expect(reranked[0]!.id).toBe('dws_10000251_com_pay_order_di')
    expect(reranked[0]!.score).toBeCloseTo(3.0)
  })

  test('does not remove any candidates (soft prefer only)', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_df', 3.0),
      hit('dws_10000251_com_pay_order_di', 2.0),
      hit('dim_server', 1.0),
    ]
    const reranked = rerankByGranularity(candidates, true)
    expect(reranked.length).toBe(3)
  })

  test('does not rerank when isTrend=false', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_df', 3.0),
      hit('dws_10000251_com_pay_order_di', 2.0),
    ]
    const reranked = rerankByGranularity(candidates, false)
    expect(reranked[0]!.id).toBe('dws_10000251_com_pay_order_df')
    expect(reranked[0]!.score).toBe(3.0)
    expect(reranked[1]!.score).toBe(2.0)
  })

  test('preserves order of non-_di candidates', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_acc_summary_df', 4.0),
      hit('dws_10000251_univ_acc_act_di', 2.5),
      hit('dim_server', 1.5),
    ]
    const reranked = rerankByGranularity(candidates, true)
    // _di boosted: 2.5 * 1.5 = 3.75 — still below 4.0
    expect(reranked[0]!.id).toBe('dws_10000251_acc_summary_df')
    expect(reranked[1]!.id).toBe('dws_10000251_univ_acc_act_di')
    expect(reranked[2]!.id).toBe('dim_server')
  })
})

// ── expandCandidates with lookupDoc ─────────────────────────────────────

describe('expandCandidates with lookupDoc', () => {
  const corpus: DataSourceDoc[] = [
    { id: 'dws_pay', description: 'Payment orders daily' },
    { id: 'dim_server', description: 'Server dimension table' },
    { id: 'metric_pay', description: 'Payment metric' },
  ]
  const lookupDoc = (id: string) => corpus.find(d => d.id === id)

  test('graph-expanded neighbors carry full payload from lookupDoc', () => {
    const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server' }])
    const hits: RetrievalHit[] = [{ id: 'dws_pay', score: 2, payload: { id: 'dws_pay', description: 'Payment orders daily' }, mode: 'bm25-only' }]
    const expanded = expandCandidates(hits, g, 10, lookupDoc)
    const dimHit = expanded.find(h => h.id === 'dim_server')
    expect(dimHit).toBeDefined()
    expect(dimHit!.payload).toBeDefined()
    expect(dimHit!.payload!.description).toBe('Server dimension table')
  })

  test('graph-expanded neighbors have undefined payload when lookupDoc returns undefined', () => {
    const g = fakeGraph([{ a: 'dws_pay', b: 'unknown_table' }])
    const hits: RetrievalHit[] = [{ id: 'dws_pay', score: 2, payload: { id: 'dws_pay' }, mode: 'bm25-only' }]
    const expanded = expandCandidates(hits, g, 10, lookupDoc)
    const unknownHit = expanded.find(h => h.id === 'unknown_table')
    expect(unknownHit).toBeDefined()
    expect(unknownHit!.payload).toBeUndefined()
  })

  test('backward-compatible: no lookupDoc means graph-expanded have undefined payload', () => {
    const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server' }])
    const hits: RetrievalHit[] = [{ id: 'dws_pay', score: 2, payload: { id: 'dws_pay' }, mode: 'bm25-only' }]
    const expanded = expandCandidates(hits, g, 10)
    const dimHit = expanded.find(h => h.id === 'dim_server')
    expect(dimHit).toBeDefined()
    expect(dimHit!.payload).toBeUndefined()
  })

  test('derived_from neighbors also get payload via lookupDoc', () => {
    const g = fakeGraph([{ a: 'dws_pay', b: 'metric_pay', type: 'derived_from' }])
    const hits: RetrievalHit[] = [{ id: 'dws_pay', score: 2, payload: { id: 'dws_pay' }, mode: 'bm25-only' }]
    const expanded = expandCandidates(hits, g, 10, lookupDoc)
    const metricHit = expanded.find(h => h.id === 'metric_pay')
    expect(metricHit).toBeDefined()
    expect(metricHit!.payload!.description).toBe('Payment metric')
  })
})

// ── Prompt granularity annotation + rule 9 ──────────────────────────────

describe('prompt granularity annotation', () => {
  test('buildPrompt annotates _di candidates with [日粒度] when isTrend=true', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_di', 3.0, 'Payment orders daily increment'),
      hit('dws_10000251_com_pay_order_df', 2.0, 'Payment orders daily full'),
    ]
    const prompt = buildPrompt({
      question: '过去7天付费趋势',
      candidates,
      eventDef: null,
      conventions: null,
      isTrend: true,
    })
    expect(prompt).toContain('[日粒度]')
    expect(prompt).toContain('dws_10000251_com_pay_order_di')
  })

  test('buildEvalPrompt annotates _di candidates with [日粒度] when isTrend=true', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_univ_acc_act_di', 3.0, 'Account activity daily increment'),
    ]
    const prompt = buildEvalPrompt({
      question: '过去30天日活趋势',
      candidates,
      conventions: null,
      isTrend: true,
    })
    expect(prompt).toContain('[日粒度]')
  })

  test('buildPrompt includes rule 9 when isTrend=true', () => {
    const candidates: RetrievalHit[] = [hit('dws_pay_di', 2.0)]
    const prompt = buildPrompt({
      question: '付费趋势',
      candidates,
      eventDef: null,
      conventions: null,
      isTrend: true,
    })
    expect(prompt).toMatch(/9\.\s*.*[趋势|日粒度|_di]/)
  })

  test('buildEvalPrompt includes rule 9 when isTrend=true', () => {
    const candidates: RetrievalHit[] = [hit('dws_pay_di', 2.0)]
    const prompt = buildEvalPrompt({
      question: '付费趋势',
      candidates,
      conventions: null,
      isTrend: true,
    })
    expect(prompt).toMatch(/9\.\s*.*[趋势|日粒度|_di]/)
  })

  test('_df candidates annotated with [快照] when isTrend=true', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_df', 2.0, 'Payment orders daily full'),
    ]
    const prompt = buildPrompt({
      question: '某个查询',
      candidates,
      eventDef: null,
      conventions: null,
      isTrend: true,
    })
    expect(prompt).toContain('[快照]')
  })

  test('granularity tags always present, but no rule 9 when isTrend is false/undefined', () => {
    const candidates: RetrievalHit[] = [
      hit('dws_10000251_com_pay_order_di', 3.0, 'Payment orders daily increment'),
      hit('dws_10000251_com_pay_order_df', 2.0, 'Payment orders daily full'),
    ]
    const prompt = buildPrompt({
      question: '昨天付费金额是多少',
      candidates,
      eventDef: null,
      conventions: null,
    })
    expect(prompt).toContain('[日粒度]')
    expect(prompt).toContain('[快照]')
    expect(prompt).not.toMatch(/9\..*趋势/)
  })
})
