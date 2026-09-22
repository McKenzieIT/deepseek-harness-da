/**
 * The plugin entry (src/index.ts) — what `apply` wires into a context.
 *
 * Kept separate from the per-module specs because it asserts the composition
 * root rather than any single tool: both scope tools AND both system-prompt
 * sections must be contributed by one `apply` call. The assembled data-agent
 * bundle exercises this in CI; this spec pins it at the package level so the
 * package's own suite covers its entry point.
 *
 * `ctx.tools.register` / `ctx.systemPrompt.section` are captured from a Context
 * stub — no Cordis container is started, so the vitest invariant-host proxy
 * (which intercepts `ctx.plugin`) is not triggered.
 *
 * Run: pnpm vitest run packages/data/tool-scope-routing/tests/plugin.spec.ts
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject, name } from '../src/index.ts'

/** Names captured from one `apply` call. */
interface Wiring {
  readonly tools: string[]
  readonly sections: { readonly name: string; readonly order: number }[]
}

/**
 * Apply the plugin against a capturing Context stub.
 * @param withConfig - pass the empty config explicitly (exercises the caller
 *   that supplies one) instead of relying on the parameter default.
 */
function applyPlugin(withConfig: boolean): Wiring {
  const tools: string[] = []
  const sections: { name: string; order: number }[] = []
  const ctx = {
    get: () => undefined,
    tools: { register: (def: { name: string }) => { tools.push(def.name) } },
    systemPrompt: { section: (s: { name: string; order: number }) => { sections.push({ name: s.name, order: s.order }) } },
  } as unknown as Context
  if (withConfig) apply(ctx, {})
  else apply(ctx)
  return { tools, sections }
}

describe('tool-scope-routing plugin entry', () => {
  it('declares its plugin name and the services it injects', () => {
    expect(name).toBe('tool-scope-routing')
    expect(inject).toEqual(['tools', 'systemPrompt'])
  })

  it('registers both scope tools and both prompt sections when config is omitted', () => {
    const wiring = applyPlugin(false)
    expect(wiring.tools).toEqual(['list_scopes', 'switch_scope'])
    expect(wiring.sections).toEqual([
      { name: 'scope-awareness', order: 50 },
      { name: 'scope-alias-hint', order: 51 },
    ])
  })

  it('wires the same surface when an explicit empty config is supplied', () => {
    const wiring = applyPlugin(true)
    expect(wiring.tools).toEqual(['list_scopes', 'switch_scope'])
    expect(wiring.sections.map(s => s.name)).toEqual(['scope-awareness', 'scope-alias-hint'])
  })
})
