/**
 * P3-impl relation graph tests — G2 aligned: three relation types,
 * bidirectional edges, BFS join-path, getDerived.
 */
import { test, expect } from 'vitest'
import { RelationGraph } from '../src/relation-graph.ts'
import type { RelationDef } from '../src/registry.ts'

function makeEntries(...tuples: [string, RelationDef[]][]): { sourceId: string; relations: RelationDef[] }[] {
  return tuples.map(([sourceId, relations]) => ({ sourceId, relations }))
}

// ── Build ───────────────────────────────────────────────────────────────

test('build populates adjacency from entries', () => {
  const g = new RelationGraph()
  g.build(makeEntries(
    ['A', [{ type: 'joins', target: 'B', on: 'id = id' }]],
  ))
  expect(g.getRelated('A')).toHaveLength(1)
  expect(g.getRelated('A')[0]!.targetId).toBe('B')
})

test('build stores bidirectional edges', () => {
  const g = new RelationGraph()
  g.build(makeEntries(
    ['A', [{ type: 'joins', target: 'B', on: 'x = x' }]],
  ))
  expect(g.getRelated('B')).toHaveLength(1)
  expect(g.getRelated('B')[0]!.targetId).toBe('A')
})

test('build clears existing state on rebuild', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B' }]]))
  g.build(makeEntries(['C', [{ type: 'joins', target: 'D' }]]))
  expect(g.getRelated('A')).toHaveLength(0)
  expect(g.getRelated('C')).toHaveLength(1)
})

// ── findJoinPath ────────────────────────────────────────────────────────

test('findJoinPath — identity', () => {
  const g = new RelationGraph()
  g.build([])
  expect(g.findJoinPath('A', 'A')).toEqual(['A'])
})

test('findJoinPath — direct edge', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B', on: 'x = x' }]]))
  expect(g.findJoinPath('A', 'B')).toEqual(['A', 'B'])
})

test('findJoinPath — A→B→C chain', () => {
  const g = new RelationGraph()
  g.build(makeEntries(
    ['A', [{ type: 'joins', target: 'B', on: 'a = a' }]],
    ['B', [{ type: 'joins', target: 'C', on: 'b = b' }]],
  ))
  expect(g.findJoinPath('A', 'C')).toEqual(['A', 'B', 'C'])
})

test('findJoinPath — reverse traversal', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B' }]]))
  expect(g.findJoinPath('B', 'A')).toEqual(['B', 'A'])
})

test('findJoinPath — disconnected returns null', () => {
  const g = new RelationGraph()
  g.build(makeEntries(
    ['A', [{ type: 'joins', target: 'B' }]],
    ['C', [{ type: 'joins', target: 'D' }]],
  ))
  expect(g.findJoinPath('A', 'D')).toBeNull()
})

test('findJoinPath — unknown source returns null', () => {
  const g = new RelationGraph()
  g.build([])
  expect(g.findJoinPath('X', 'Y')).toBeNull()
})

test('findJoinPath — ignores derived_from edges', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'derived_from', target: 'B' }]]))
  expect(g.findJoinPath('A', 'B')).toBeNull()
})

test('findJoinPath — ignores related_to edges', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'related_to', target: 'B' }]]))
  expect(g.findJoinPath('A', 'B')).toBeNull()
})

test('findJoinPath — shortest path in diamond', () => {
  const g = new RelationGraph()
  g.build(makeEntries(
    ['A', [{ type: 'joins', target: 'B' }, { type: 'joins', target: 'C' }]],
    ['B', [{ type: 'joins', target: 'D' }]],
    ['C', [{ type: 'joins', target: 'D' }]],
  ))
  const path = g.findJoinPath('A', 'D')
  expect(path).not.toBeNull()
  expect(path!.length).toBe(3) // A→B→D or A→C→D
})

// ── getRelated ──────────────────────────────────────────────────────────

test('getRelated — unknown node returns empty', () => {
  const g = new RelationGraph()
  g.build([])
  expect(g.getRelated('X')).toEqual([])
})

test('getRelated — unfiltered returns all types', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [
    { type: 'joins', target: 'B' },
    { type: 'derived_from', target: 'C' },
    { type: 'related_to', target: 'D' },
  ]]))
  expect(g.getRelated('A')).toHaveLength(3)
})

test('getRelated — filtered by type', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [
    { type: 'joins', target: 'B' },
    { type: 'derived_from', target: 'C' },
    { type: 'related_to', target: 'D' },
  ]]))
  expect(g.getRelated('A', 'joins')).toHaveLength(1)
  expect(g.getRelated('A', 'derived_from')).toHaveLength(1)
  expect(g.getRelated('A', 'related_to')).toHaveLength(1)
})

// ── getJoinCondition ────────────────────────────────────────────────────

test('getJoinCondition — direct edge', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B', on: 'x = x' }]]))
  expect(g.getJoinCondition('A', 'B')).toBe('x = x')
})

test('getJoinCondition — reverse edge', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B', on: 'x = x' }]]))
  expect(g.getJoinCondition('B', 'A')).toBe('x = x')
})

test('getJoinCondition — unconnected returns null', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B', on: 'x = x' }]]))
  expect(g.getJoinCondition('A', 'C')).toBeNull()
})

test('getJoinCondition — no on field returns null', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B' }]]))
  expect(g.getJoinCondition('A', 'B')).toBeNull()
})

// ── getDerived (G2 lineage) ─────────────────────────────────────────────

test('getDerived — returns derived_from edges', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['metric_dau', [
    { type: 'derived_from', target: 'ods_login', description: '基于登录' },
    { type: 'joins', target: 'dim_server' },
  ]]))
  const derived = g.getDerived('metric_dau')
  expect(derived).toHaveLength(1)
  expect(derived[0]).toBeDefined()
  expect(derived[0]!.targetId).toBe('ods_login')
  expect(derived[0]!.type).toBe('derived_from')
})

test('getDerived — returns empty for no derived_from edges', () => {
  const g = new RelationGraph()
  g.build(makeEntries(['A', [{ type: 'joins', target: 'B' }]]))
  expect(g.getDerived('A')).toEqual([])
})

test('getDerived — unknown node returns empty', () => {
  const g = new RelationGraph()
  g.build([])
  expect(g.getDerived('X')).toEqual([])
})
