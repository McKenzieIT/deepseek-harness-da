import { test, expect } from 'vitest'
import { buildJoinConstraints, type RelationGraphLike, type RelationGraphEdge } from '../src/ontology.ts'
import { makeCriticCtx } from '../src/types.ts'
import { critiqueSql } from '../src/critic.ts'
import { buildDeclaredJoinPairs, expandCandidates } from '../src/ontology.ts'
import type { RetrievalHit } from '../src/bm25-linking.ts'

// Hand-rolled fake graph (bidirectional, mirrors RelationGraph.build semantics).
// NO import from semantic-layer — nl2sql-engine stays decoupled.
function fakeGraph(edges: Array<{ a: string; b: string; on?: string; type?: 'joins' | 'derived_from' | 'related_to' }>): RelationGraphLike {
  const adj = new Map<string, RelationGraphEdge[]>()
  const add = (src: string, edge: RelationGraphEdge) => {
    if (!adj.has(src)) adj.set(src, [])
    adj.get(src)!.push(edge)
  }
  for (const e of edges) {
    const t = e.type ?? 'joins'
    add(e.a, { targetId: e.b, type: t, ...(e.on ? { on: e.on } : {}) })
    add(e.b, { targetId: e.a, type: t, ...(e.on ? { on: e.on } : {}) }) // bidirectional (matches RelationGraph.build)
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

test('C1 — buildJoinConstraints emits the declared join condition for a candidate pair', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server', on: 'server_id = server_id' }])
  const constraints = buildJoinConstraints(['dws_pay', 'dim_server'], g)
  expect(constraints.length).toBeGreaterThan(0)
  expect(constraints[0]).toContain('dws_pay JOIN dim_server')
  expect(constraints[0]).toContain('server_id = server_id')
})

test('C1 — buildJoinConstraints returns [] when no path exists', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server', on: 'server_id = server_id' }])
  expect(buildJoinConstraints(['dws_pay', 'unrelated'], g)).toEqual([])
})

test('C2 — buildDeclaredJoinPairs includes a declared candidate pair', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server', on: 'server_id = server_id' }])
  const pairs = buildDeclaredJoinPairs(['dws_pay', 'dim_server'], g)
  expect(pairs.has(['dws_pay', 'dim_server'].sort().join('|'))).toBe(true)
})

test('C2 — critic warns on an undeclared JOIN when declaredJoinPairs is set (no-op when absent)', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server', on: 'server_id = server_id' }])
  const declared = buildDeclaredJoinPairs(['dws_pay', 'dim_server'], g)
  // declared pair -> no undeclared_join finding
  const ok = critiqueSql(
    "SELECT a FROM dws_pay JOIN dim_server ON dws_pay.server_id = dim_server.server_id WHERE ds='20260819'",
    makeCriticCtx({ candidateTables: ['dws_pay', 'dim_server'], partitionCols: ['ds'], declaredJoinPairs: declared }),
  )
  expect(ok.findings.some(f => f.rule === 'undeclared_join')).toBe(false)
  // undeclared pair -> warning (passed:true, reason carries the warning)
  const warn = critiqueSql(
    "SELECT a FROM dws_pay JOIN dim_role ON dws_pay.role_id = dim_role.role_id WHERE ds='20260819'",
    makeCriticCtx({ candidateTables: ['dws_pay', 'dim_role'], partitionCols: ['ds'], declaredJoinPairs: declared }),
  )
  expect(warn.findings.some(f => f.rule === 'undeclared_join')).toBe(true)
  expect(warn.passed).toBe(true)
  // no declaredJoinPairs -> rule skipped (existing behavior preserved)
  const noGraph = critiqueSql(
    "SELECT a FROM dws_pay JOIN dim_role ON x=y WHERE ds='20260819'",
    makeCriticCtx({ candidateTables: ['dws_pay', 'dim_role'], partitionCols: ['ds'] }),
  )
  expect(noGraph.findings.some(f => f.rule === 'undeclared_join')).toBe(false)
})

test('C3 — expandCandidates adds 1-hop joins + derived targets not already hit', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server' }, { a: 'dws_pay', b: 'metric_pay', type: 'derived_from' }])
  const hits: RetrievalHit[] = [{ id: 'dws_pay', score: 2, payload: { id: 'dws_pay' }, mode: 'bm25-only' }]
  const expanded = expandCandidates(hits, g, 10)
  const ids = expanded.map(h => h.id)
  expect(ids).toContain('dim_server')
  expect(ids).toContain('metric_pay')
  expect(expanded.find(h => h.id === 'dim_server')!.mode).toBe('graph-expand')
})

test('C3 — expandCandidates caps at topK, keeps originals first, dedupes', () => {
  const g = fakeGraph([{ a: 'dws_pay', b: 'dim_server' }, { a: 'dws_pay', b: 'dim_role' }])
  const hits: RetrievalHit[] = [
    { id: 'dws_pay', score: 2, payload: { id: 'dws_pay' }, mode: 'bm25-only' },
    { id: 'dim_server', score: 1, payload: { id: 'dim_server' }, mode: 'bm25-only' }, // also a graph neighbor of dws_pay -> dedupe
  ]
  // cap=1 -> only the original survives (originals kept first)
  const capped = expandCandidates(hits, g, 1)
  expect(capped.length).toBe(1)
  expect(capped[0]!.id).toBe('dws_pay')
  // cap=3 -> originals first, then the NEW neighbor dim_role (dim_server deduped, already present)
  const expanded = expandCandidates(hits, g, 3)
  expect(expanded.map(h => h.id)).toEqual(['dws_pay', 'dim_server', 'dim_role'])
})
