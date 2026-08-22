import { test, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../src/index.ts'
import { RelationGraph } from '../src/relation-graph.ts'

function makeService(): SemanticLayerService {
  const ctx = new Context()
  return new SemanticLayerService(ctx, { semanticRoot: '' })
}

test('A1 — service registers all 3 kind plugins', () => {
  const svc = makeService()
  const reg = svc.getRegistry()
  expect(reg.allKinds().sort()).toEqual(['event', 'metric', 'table'])
})

test('A2 — getRelationGraph builds from tables/events/metrics + caches until corpusVersion bump', () => {
  const svc = makeService() // empty semanticRoot -> empty graph, but still a RelationGraph
  const g = svc.getRelationGraph()
  expect(g).toBeInstanceOf(RelationGraph)
  // cached: second call returns the same instance (no rebuild)
  expect(svc.getRelationGraph()).toBe(g)
})
