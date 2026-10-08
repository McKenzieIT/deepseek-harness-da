/**
 * The one test this adapter owes.
 *
 * Everything else about the semantic layer now lives in
 * `@semantic-grounding/substrate` and is tested there — including the core's own
 * owned-disposer suite (construct registers the 3 built-in kinds, `dispose()`
 * withdraws them, `dispose()` is idempotent, cache invalidation works with no
 * host effect system). dsh must not re-test its own dependency.
 *
 * What is dsh's alone is the fiber↔core lifetime bridge: the
 * `ctx.effect(() => () => core.dispose())` in `src/index.ts`. This asserts it
 * through real behaviour on a real cordis root — no spy on a private — by
 * mounting the adapter, reading the live registry, unloading the fiber, and
 * checking that the kinds the core registered are actually gone.
 */
import { expect, test } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SemanticLayerPlugin from '../src/index.ts'

test('withdraws the built-in kinds when the owning fiber disposes', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(SemanticLayerPlugin, { semanticRoot: '' })
  await fiber

  // Mounted: `ctx.schema` is the core itself and its 3 built-in data-source
  // kinds are registered. Hold the registry across disposal — `ctx.schema` is
  // withdrawn with the fiber, so it cannot be read afterwards.
  const registry = ctx.schema.getRegistry()
  expect(registry.allKinds().sort()).toEqual(['concept', 'event', 'table'])

  await fiber.dispose()

  // The fiber unloaded, so `ctx.effect(() => () => core.dispose())` ran and the
  // core released the kind registrations it owned. Without that bridge the
  // registry would still hold all three.
  expect(registry.allKinds()).toEqual([])
  expect(ctx.get('schema')).toBeUndefined()
})
