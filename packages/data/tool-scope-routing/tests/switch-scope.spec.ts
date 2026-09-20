/**
 * `switch_scope` — the registered tool contract (src/switch-scope.ts).
 *
 * The scope registry is stubbed as the structural shape `execute` probes through
 * `ctx.get('scopes')` (`get(id)` / `activeId()` / `setActive(id)`), and the tool
 * definition is captured from a `ctx.tools.register` stub — no Cordis container
 * is started, matching the tool-contract harness used by
 * packages/data/tool-search-data-sources/tests/search-data-sources.spec.ts.
 *
 * Covers:
 *  (a) `execute` refusing an already-aborted signal;
 *  (b) `execute` failing when the registry is unmounted, and when the requested
 *      scope id is unknown;
 *  (c) `execute` succeeding — the registry's `setActive` is driven, the previous
 *      active id is reported (or `''` when nothing was active), and the scope
 *      name falls back to the id when metadata carries no string name;
 *  (d) `output.render` for the failure text and for both success shapes (with
 *      and without a previous scope / a scope name).
 *
 * Run: pnpm vitest run packages/data/tool-scope-routing/tests/switch-scope.spec.ts
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { registerSwitchScope, type SwitchScopeResult } from '../src/switch-scope.ts'

/** One entry of the stub registry — metadata is deliberately loose. */
interface StubScope {
  readonly id: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** The structural scope-registry face `switch_scope`'s execute drives. */
interface StubRegistry {
  get(id: string): StubScope | undefined
  activeId(): string | undefined
  setActive(id: string): Promise<void>
  /** Ids passed to `setActive`, in call order — asserted by the success tests. */
  readonly activated: string[]
}

/** The subset of the registered tool definition these tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: SwitchScopeResult,
    ) => readonly { readonly type: string; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly scope_id: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<SwitchScopeResult>
}

/**
 * A registry holding the given scopes.
 * @param scopes - entries reachable through `get(id)`.
 * @param activeId - the currently active id, or undefined for "none active".
 */
function makeRegistry(scopes: readonly StubScope[], activeId: string | undefined): StubRegistry {
  const activated: string[] = []
  return {
    get: (id: string) => scopes.find(s => s.id === id),
    activeId: () => activeId,
    setActive: (id: string) => {
      activated.push(id)
      return Promise.resolve()
    },
    activated,
  }
}

/** Capture the tool definition `registerSwitchScope` registers. */
function registerTool(registry?: StubRegistry): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    get: (key: string) => (key === 'scopes' ? registry : undefined),
    tools: { register: (d: ToolDef) => { def = d } },
  } as unknown as Context
  registerSwitchScope(ctx)
  if (def === undefined) throw new Error('registerSwitchScope did not register a tool')
  return def
}

const openSignal = (): AbortSignal => new AbortController().signal

describe('switch_scope tool registration', () => {
  it('registers a tool named switch_scope that points at list_scopes for discovery', () => {
    const def = registerTool(makeRegistry([], undefined))
    expect(def.name).toBe('switch_scope')
    expect(def.description).toBe(
      'Switch the active data scope to a different game/product. After switching, '
      + 'all subsequent data operations (search, load definitions, generate SQL, '
      + 'execute queries) will use the new scope\'s semantic layer and conventions. '
      + 'Use list_scopes first if unsure which scope to switch to.',
    )
    expect(def.output.schema).toBeDefined()
  })
})

describe('switch_scope execute', () => {
  it('rejects with "switch_scope aborted" when the signal is already aborted', async () => {
    const registry = makeRegistry([{ id: 'beta' }], 'alpha')
    const def = registerTool(registry)
    const controller = new AbortController()
    controller.abort()
    await expect(def.execute({ scope_id: 'beta' }, { signal: controller.signal }))
      .rejects.toThrow('switch_scope aborted')
    expect(registry.activated).toEqual([])
  })

  it('fails when the scope registry is not mounted', async () => {
    const def = registerTool()
    await expect(def.execute({ scope_id: 'beta' }, { signal: openSignal() })).resolves.toEqual({
      ok: false,
      error: 'scope registry not mounted',
    })
  })

  it('fails with a discovery hint when the requested scope id is unknown', async () => {
    const registry = makeRegistry([{ id: 'beta' }], 'alpha')
    const def = registerTool(registry)
    await expect(def.execute({ scope_id: 'nope' }, { signal: openSignal() })).resolves.toEqual({
      ok: false,
      error: 'scope "nope" not found. Use list_scopes to see available scopes.',
    })
    expect(registry.activated).toEqual([])
  })

  it('activates the target scope and reports its metadata name and the previous id', async () => {
    const registry = makeRegistry(
      [{ id: 'beta', metadata: { name: 'Beta Game' } }],
      'alpha',
    )
    const def = registerTool(registry)
    await expect(def.execute({ scope_id: 'beta' }, { signal: openSignal() })).resolves.toEqual({
      ok: true,
      scope_id: 'beta',
      scope_name: 'Beta Game',
      previous_scope_id: 'alpha',
    })
    expect(registry.activated).toEqual(['beta'])
  })

  it('falls back to the scope id as the name and to "" when nothing was active', async () => {
    // `metadata` absent on 'beta' and non-string on 'delta': both fall back to
    // the requested id. No scope is active, so previous_scope_id is empty.
    const registry = makeRegistry(
      [{ id: 'beta' }, { id: 'delta', metadata: { name: 99 } }],
      undefined,
    )
    const def = registerTool(registry)
    await expect(def.execute({ scope_id: 'beta' }, { signal: openSignal() })).resolves.toEqual({
      ok: true,
      scope_id: 'beta',
      scope_name: 'beta',
      previous_scope_id: '',
    })
    await expect(def.execute({ scope_id: 'delta' }, { signal: openSignal() })).resolves.toEqual({
      ok: true,
      scope_id: 'delta',
      scope_name: 'delta',
      previous_scope_id: '',
    })
    expect(registry.activated).toEqual(['beta', 'delta'])
  })
})

describe('switch_scope output.render', () => {
  it('renders the failure reason when the switch did not happen', () => {
    const def = registerTool()
    expect(def.output.render({ scope_id: 'nope' }, {
      ok: false,
      error: 'scope "nope" not found. Use list_scopes to see available scopes.',
    })).toEqual([{
      type: 'text',
      text: 'switch_scope failed: scope "nope" not found. Use list_scopes to see available scopes.',
    }])
  })

  it('renders the new scope name and the scope it replaced', () => {
    const def = registerTool()
    expect(def.output.render({ scope_id: 'beta' }, {
      ok: true,
      scope_id: 'beta',
      scope_name: 'Beta Game',
      previous_scope_id: 'alpha',
    })).toEqual([{ type: 'text', text: 'Switched to scope Beta Game (was: alpha)' }])
  })

  it('renders the scope id and omits the previous scope when there was none', () => {
    const def = registerTool()
    expect(def.output.render({ scope_id: 'beta' }, {
      ok: true,
      scope_id: 'beta',
      previous_scope_id: '',
    })).toEqual([{ type: 'text', text: 'Switched to scope beta' }])
  })
})
