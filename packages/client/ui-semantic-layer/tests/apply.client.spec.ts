// @vitest-environment jsdom
/**
 * CL18 — apply() host-config threading tests.
 *
 * skeptic finding #4: `apply()` → `injected()` `??` branches (config.layoutMode
 * ?? 'auto', config.autoFlipThreshold ?? 3) were uncovered (no test called
 * `apply`). These tests mock a minimal ClientContext, drive `apply()`, capture
 * the `injected` closure from the registered `sidebar.footer.action` slot, and
 * assert it threads config layoutMode + autoFlipThreshold (and defaults when
 * no config). This covers the CL18 `??` branch points.
 *
 * Note: the rest of index.ts (sessions.subscribe callback, RPC wiring, the
 * other 3 slots) is pre-existing GUI debt (the file was 0%-covered before
 * CL18) and is tracked as a separate coverage effort — these tests pin only
 * the CL18 config-threading behavior.
 */
import { describe, it, expect, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** A minimal ClientContext mock: ctx.effect/plugin are no-ops; ctx.inject
 *  invokes its callback immediately with a stub scope whose slots.inject
 *  captures every registered slot config (so we can read `inject: injected`). */
function mockCtx(): { ctx: ClientContext; captured: Array<Record<string, unknown>> } {
  const captured: Array<Record<string, unknown>> = []
  const scope = {
    sessions: {
      list: {
        subscribe: vi.fn(() => vi.fn()),
        getSnapshot: vi.fn(() => ({ ids: [], byId: {}, current: undefined })),
      },
    },
    workspaces: { startSession: vi.fn() },
    get: vi.fn((key: string) => {
      if (key === 'connection') {
        return { api: { agentPresets: { select: vi.fn(async () => ({ result: { ok: false } })) } } }
      }
      return undefined
    }),
    remote: { $on: vi.fn() },
    on: vi.fn(),
    slots: {
      inject: vi.fn((_slot: string, fn: () => unknown) => {
        const registered = fn()
        captured.push(registered as Record<string, unknown>)
      }),
      register: vi.fn((cfg: Record<string, unknown>) => cfg),
    },
  }
  const ctx = {
    effect: vi.fn(),
    plugin: vi.fn(),
    inject: vi.fn((_deps: string[], cb: (s: typeof scope) => unknown) => cb(scope)),
  } as unknown as ClientContext
  return { ctx, captured }
}

/** Narrow `captured[0]` (possibly undefined under noUncheckedIndexedAccess) to
 *  the sidebar.footer.action slot config, or throw a clear setup error. */
function sidebarSlot(captured: Array<Record<string, unknown>>): Record<string, unknown> {
  const slot = captured[0]
  if (slot === undefined) throw new Error('apply() did not register the sidebar.footer.action slot')
  return slot
}

describe('CL18 — apply() threads host config into injected()', () => {
  it('host override layoutMode="B" + autoFlipThreshold=5 → injected() threads them', () => {
    const { ctx, captured } = mockCtx()
    apply(ctx, { layoutMode: 'B', autoFlipThreshold: 5 })
    // sidebar.footer.action is the first slot registered; it carries `inject: injected`.
    const shellSlot = sidebarSlot(captured)
    expect(shellSlot.id).toBe('semantic-layer')
    const props = (shellSlot.inject as () => Record<string, unknown>)()
    expect(props.layoutMode).toBe('B')
    expect(props.autoFlipThreshold).toBe(5)
  })

  it('no config → injected() defaults layoutMode="auto", autoFlipThreshold=3', () => {
    const { ctx, captured } = mockCtx()
    apply(ctx, {})
    const shellSlot = sidebarSlot(captured)
    const props = (shellSlot.inject as () => Record<string, unknown>)()
    expect(props.layoutMode).toBe('auto')
    expect(props.autoFlipThreshold).toBe(3)
  })
})
