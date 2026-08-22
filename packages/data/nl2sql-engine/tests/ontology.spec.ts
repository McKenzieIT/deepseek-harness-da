import { test, expect } from 'vitest'
import { buildJoinConstraints, type RelationGraphLike, type RelationGraphEdge } from '../src/ontology.ts'

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
