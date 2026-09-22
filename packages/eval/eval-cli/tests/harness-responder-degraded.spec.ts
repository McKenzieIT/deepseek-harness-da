/// <reference types="node" />
/**
 * HarnessAgentResponder — the "preset bundle is not installed" path.
 *
 * `resolvePresetDir()` derives the default preset root from the installed
 * `@deepseek-ai/dsh-data-agent` bundle, and its own error text says the bundle
 * may be absent ("Install the bundle or pass presetDir explicitly"): eval-cli
 * is published without a hard guarantee that the preset bundle came with it.
 * Inside this workspace the bundle is always resolvable, so the not-installed
 * case is produced by failing `require.resolve` for that one specifier and
 * delegating every other resolution to the real `node:module`.
 *
 * This lives in its own file because the substitution has to be hoisted above
 * the harness's own `import { createRequire } from 'node:module'`.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/harness-responder-degraded.spec.ts
 */
import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

const state = vi.hoisted(() => ({ bundleMissing: false }))

vi.mock('node:module', async () => {
  const actual = await vi.importActual<typeof import('node:module')>('node:module')
  const createRequire = (from: string | URL): NodeJS.Require => {
    const real = actual.createRequire(from)
    const resolve = ((specifier: string, options?: { paths?: string[] }) => {
      if (state.bundleMissing && specifier === '@deepseek-ai/dsh-data-agent/package.json') {
        throw Object.assign(
          new Error("Cannot find module '@deepseek-ai/dsh-data-agent/package.json'"),
          { code: 'MODULE_NOT_FOUND' },
        )
      }
      return real.resolve(specifier, options)
    }) as NodeJS.RequireResolve
    resolve.paths = real.resolve.paths.bind(real.resolve)
    const shim = (id: string): unknown => real(id)
    return Object.assign(shim as unknown as NodeJS.Require, real, { resolve })
  }
  const mocked: Record<string, unknown> = {}
  for (const key of Object.keys(actual)) mocked[key] = Reflect.get(actual, key)
  mocked.createRequire = createRequire
  mocked.default = { ...mocked }
  return mocked
})

import { HarnessAgentResponder } from '../src/harness-responder.ts'

const ROOT = join(__dirname, '..', '..', '..', '..')
const SCHEMA_DIR = join(ROOT, 'examples/k11-semantic-layer')

function constructWithDefaultPresetDir(): HarnessAgentResponder {
  return new HarnessAgentResponder({
    schemaDir: SCHEMA_DIR,
    provider: 'evalmock',
    model: 'evalmock-model',
    variant: 'A',
    today: '20260902',
    scopeId: 'k11',
  })
}

describe('HarnessAgentResponder — preset bundle not installed', () => {
  it('tells the operator to install the bundle or pass presetDir', () => {
    state.bundleMissing = true
    try {
      expect(constructWithDefaultPresetDir).toThrow(
        'HarnessAgentResponder: cannot resolve the installed @deepseek-ai/dsh-data-agent preset bundle. '
        + 'Install the bundle or pass presetDir explicitly.',
      )
    } finally {
      state.bundleMissing = false
    }
  })

  it('keeps the resolution failure as the cause so the unresolvable specifier stays visible', () => {
    state.bundleMissing = true
    try {
      let caught: unknown
      try {
        constructWithDefaultPresetDir()
      } catch (error) {
        caught = error
      }
      expect((caught as { cause?: { message?: string } }).cause?.message)
        .toBe("Cannot find module '@deepseek-ai/dsh-data-agent/package.json'")
    } finally {
      state.bundleMissing = false
    }
  })

  it('still resolves the bundle when it is installed', () => {
    // The substitution delegates: with the fault off, the real resolution
    // decides, so the two cases above prove the throw rather than a
    // permanently broken require.
    const responder: HarnessAgentResponder = constructWithDefaultPresetDir()
    expect((responder as unknown as { presetPath: string }).presetPath)
      .toMatch(/[/\\]presets[/\\]data-agent[/\\]agent\.cordis\.yml$/)
  })
})
