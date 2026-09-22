/**
 * `list_scopes` — projection (`listScopesResult`) and the registered tool
 * contract (src/list-scopes.ts).
 *
 * The scope registry is stubbed as the structural shape `listScopesResult`
 * probes through `ctx.get('scopes')` (`list()` / `activeId()`), and the tool
 * definition is captured from a `ctx.tools.register` stub — no Cordis container
 * is started, matching the tool-contract harness used by
 * packages/data/tool-search-data-sources/tests/search-data-sources.spec.ts.
 *
 * Covers:
 *  (a) the unmounted-registry early return (`ok: true` with no scopes);
 *  (b) the per-scope metadata projection: name/description/aliases present and
 *      well-typed, present but wrongly typed, and metadata absent entirely;
 *  (c) `output.render` for the empty and the populated result, including the
 *      active-scope marker;
 *  (d) `execute` on the normal path and on an already-aborted signal.
 *
 * Run: pnpm vitest run packages/data/tool-scope-routing/tests/list-scopes.spec.ts
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { type ListScopesResult, listScopesResult, registerListScopes } from '../src/list-scopes.ts'

/** One entry of the stub registry's `list()` — metadata is deliberately loose. */
interface StubScope {
  readonly id: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** The structural scope-registry face `listScopesResult` reads. */
interface StubRegistry {
  list(): readonly StubScope[]
  activeId(): string | undefined
}

/** The subset of the registered tool definition these tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: ListScopesResult,
    ) => readonly { readonly type: string; readonly text: string }[]
  }
  readonly execute: (
    args: Record<string, never>,
    exec: { readonly signal: AbortSignal },
  ) => Promise<ListScopesResult>
}

/**
 * A Context stub whose only capability is `get('scopes')`.
 * An absent `registry` models "scope registry not mounted".
 */
function makeCtx(registry?: StubRegistry): Context {
  return {
    get: (key: string) => (key === 'scopes' ? registry : undefined),
  } as unknown as Context
}

/** Capture the tool definition `registerListScopes` registers. */
function registerTool(registry?: StubRegistry): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    get: (key: string) => (key === 'scopes' ? registry : undefined),
    tools: { register: (d: ToolDef) => { def = d } },
  } as unknown as Context
  registerListScopes(ctx)
  if (def === undefined) throw new Error('registerListScopes did not register a tool')
  return def
}

/**
 * A registry covering all three metadata shapes at once:
 *  - `alpha`: every field present and correctly typed (one alias entry is a
 *    number, which the string filter must drop);
 *  - `beta`: every field present but wrongly typed (name number, description
 *    boolean, aliases a string rather than an array);
 *  - `gamma`: no metadata object at all.
 * `beta` is the active scope.
 */
function mixedRegistry(): StubRegistry {
  return {
    list: () => [
      { id: 'alpha', metadata: { name: 'Alpha Game', description: 'The alpha title', aliases: ['a1', 7, 'a2'] } },
      { id: 'beta', metadata: { name: 42, description: false, aliases: 'not-an-array' } },
      { id: 'gamma' },
    ],
    activeId: () => 'beta',
  }
}

describe('listScopesResult', () => {
  it('returns an empty, successful result when the scope registry is not mounted', () => {
    expect(listScopesResult(makeCtx())).toEqual({
      ok: true,
      scopes: [],
      active_scope_id: undefined,
    })
  })

  it('projects each scope, falling back to the id, an empty description and no aliases', () => {
    expect(listScopesResult(makeCtx(mixedRegistry()))).toEqual({
      ok: true,
      active_scope_id: 'beta',
      scopes: [
        {
          id: 'alpha',
          name: 'Alpha Game',
          description: 'The alpha title',
          aliases: ['a1', 'a2'],
          is_active: false,
        },
        {
          id: 'beta',
          name: 'beta',
          description: '',
          aliases: [],
          is_active: true,
        },
        {
          id: 'gamma',
          name: 'gamma',
          description: '',
          aliases: [],
          is_active: false,
        },
      ],
    })
  })

  it('marks no scope active when the registry reports no active id', () => {
    const registry: StubRegistry = {
      list: () => [{ id: 'alpha', metadata: { name: 'Alpha Game' } }],
      activeId: () => undefined,
    }
    expect(listScopesResult(makeCtx(registry))).toEqual({
      ok: true,
      active_scope_id: undefined,
      scopes: [{
        id: 'alpha',
        name: 'Alpha Game',
        description: '',
        aliases: [],
        is_active: false,
      }],
    })
  })
})

describe('list_scopes tool registration', () => {
  it('registers a tool named list_scopes that documents scope switching', () => {
    const def = registerTool(mixedRegistry())
    expect(def.name).toBe('list_scopes')
    expect(def.description).toBe(
      'List all available data scopes (games/products) with their descriptions. '
      + 'Use this to see what scopes you can switch to. '
      + 'Each scope has its own semantic layer, event definitions, and query conventions.',
    )
    expect(def.output.schema).toBeDefined()
  })
})

describe('list_scopes output.render', () => {
  it('reports that nothing is registered when the result carries no scopes', () => {
    const def = registerTool()
    expect(def.output.render({}, { ok: true, scopes: [], active_scope_id: undefined })).toEqual([
      { type: 'text', text: 'No scopes registered.' },
    ])
  })

  it('lists one line per scope and marks the active one with a caret', () => {
    const def = registerTool()
    const value: ListScopesResult = {
      ok: true,
      active_scope_id: 'beta',
      scopes: [
        { id: 'alpha', name: 'Alpha Game', description: 'The alpha title', aliases: [], is_active: false },
        { id: 'beta', name: 'Beta Game', description: 'The beta title', aliases: [], is_active: true },
      ],
    }
    expect(def.output.render({}, value)).toEqual([{
      type: 'text',
      text: '  Alpha Game (alpha): The alpha title\n▶ Beta Game (beta): The beta title',
    }])
  })
})

describe('list_scopes execute', () => {
  it('returns the current scope projection', async () => {
    const def = registerTool(mixedRegistry())
    const result = await def.execute({}, { signal: new AbortController().signal })
    expect(result.active_scope_id).toBe('beta')
    expect(result.scopes.map(s => s.id)).toEqual(['alpha', 'beta', 'gamma'])
    expect(result.ok).toBe(true)
  })

  it('returns an empty projection when the scope registry is not mounted', async () => {
    const def = registerTool()
    await expect(def.execute({}, { signal: new AbortController().signal })).resolves.toEqual({
      ok: true,
      scopes: [],
      active_scope_id: undefined,
    })
  })

  it('rejects with "list_scopes aborted" when the signal is already aborted', async () => {
    const def = registerTool(mixedRegistry())
    const controller = new AbortController()
    controller.abort()
    await expect(def.execute({}, { signal: controller.signal })).rejects.toThrow('list_scopes aborted')
  })
})
