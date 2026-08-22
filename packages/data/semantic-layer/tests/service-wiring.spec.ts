import { test, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../src/index.ts'

function makeService(): SemanticLayerService {
  const ctx = new Context()
  return new SemanticLayerService(ctx, { semanticRoot: '' })
}

test('A1 — service registers all 3 kind plugins', () => {
  const svc = makeService()
  const reg = svc.getRegistry()
  expect(reg.allKinds().sort()).toEqual(['event', 'metric', 'table'])
})
