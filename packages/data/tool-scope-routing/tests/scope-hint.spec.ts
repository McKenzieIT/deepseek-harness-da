/**
 * GA-GT1 Phase 3d (D5.4) — scope-hint per-session-tenant filter tests.
 *
 * Covers:
 *  (a) scope-awareness section lists only the session tenant's scopes — the
 *      count shrinks and a foreign-tenant active scope is NOT shown (no
 *      cross-tenant id/name leak to the LLM system prompt).
 *  (b) scope-alias-hint section matches only the session tenant's aliases — a
 *      foreign-tenant alias produces no hint (no leak); a same-tenant alias
 *      produces a hint naming only same-tenant scopes.
 *  (c) session without a tenant → list(undefined) returns ALL scopes
 *      (backward-compatible: Phase 3d leaves session.tenant dormant; Phase 4
 *      fills it). Both "no agent" and "agent.session without tenant" paths.
 *  (d) single-scope registry and no-registry → the existing <=1 / unmounted
 *      early-return '' behavior is unchanged.
 *
 * Mounts a minimal fake scope-registry under the 'scopes' name (the same
 * structural shape `list(tenant?)` / `activeId()` the scope-hint probes via
 * `ctx.get('scopes')`), sidestepping the real ScopeRegistryService + its
 * scopes.yaml persistence — same pattern as evidence-query's per-scope tests.
 * SystemPrompt is direct-constructed (`new SystemPrompt(ctx, …)`, not
 * `ctx.plugin`) so the vitest invariant-host proxy (which intercepts
 * `ctx.plugin` and requires a per-package src/invariant.ts companion) is not
 * triggered; this package has no companion because it ships no invariants.
 *
 * Run: pnpm vitest run packages/data/tool-scope-routing/tests/scope-hint.spec.ts
 */
import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt, { type AssembleContext, type PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import { installScopeHint } from '../src/scope-hint.ts'

// ── FakeScopeRegistry (mounts under the 'scopes' name) ───────────────────

/**
 * Minimal scope-registry mounted under the 'scopes' name — the structural
 * shape (`list(tenant?)` filtering by tenant, `activeId()`) that scope-hint
 * probes via `ctx.get('scopes')`. Mirrors the real ScopeRegistryService's
 * Phase 1 `list(tenant?)` semantics: undefined → all, string → that tenant.
 */
interface FakeScopeDef {
  readonly id: string
  readonly tenant: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

class FakeScopeRegistry extends Service {
  private readonly scopes: FakeScopeDef[] = []
  private activeIdVal: string | undefined

  constructor(ctx: Context) { super(ctx, 'scopes') }

  register(def: FakeScopeDef): void {
    this.scopes.push(def)
    if (this.activeIdVal === undefined) this.activeIdVal = def.id
  }
  setActive(id: string): void { this.activeIdVal = id }
  list(tenant?: string): readonly FakeScopeDef[] {
    if (tenant === undefined) return [...this.scopes]
    return this.scopes.filter(s => s.tenant === tenant)
  }
  activeId(): string | undefined { return this.activeIdVal }
}

// ── Harness ─────────────────────────────────────────────────────────────

/**
 * Build an AssembleContext carrying a structurally-shaped agent.session with
 * an optional tenant and/or messages. scope-hint reads both fields via
 * structural casts, so a plain object suffices. Cast through `unknown` because
 * the real Agent/Session types are not loaded in this minimal harness.
 */
function sessionContext(session: { tenant?: string; messages?: Array<{ role: string; content: string }> } = {}): AssembleContext {
  return { agent: { session } } as unknown as AssembleContext
}

/** Direct-construct the SystemPrompt service (avoids ctx.plugin's invariant-host proxy). */
function mountSystemPrompt(ctx: Context): void {
  new SystemPrompt(ctx, { persona: 'test' })
}

/** Extract one section's resolved text from an assembly (empty string when absent). */
function sectionText(assembly: PromptAssembly, name: string): string {
  return assembly.sections.find(s => s.name === name)?.text ?? ''
}

/**
 * A context + fake multi-tenant registry:
 *   tenant-a: scope1 (name "Scope One", aliases ["alpha"])
 *             scope2 (name "Scope Two", aliases ["beta"])
 *   tenant-b: scope3 (name "Scope Three", aliases ["gamma"])
 * active = scope1 (first registered).
 */
function setupMultiTenant(): { ctx: Context; scopes: FakeScopeRegistry } {
  const ctx = new Context()
  mountSystemPrompt(ctx)
  const scopes = new FakeScopeRegistry(ctx)
  scopes.register({ id: 'scope1', tenant: 'tenant-a', metadata: { name: 'Scope One', aliases: ['alpha'] } })
  scopes.register({ id: 'scope2', tenant: 'tenant-a', metadata: { name: 'Scope Two', aliases: ['beta'] } })
  scopes.register({ id: 'scope3', tenant: 'tenant-b', metadata: { name: 'Scope Three', aliases: ['gamma'] } })
  installScopeHint(ctx)
  return { ctx, scopes }
}

/** A context with a single-scope registry (one tenant, one scope). */
function setupSingleScope(): { ctx: Context; scopes: FakeScopeRegistry } {
  const ctx = new Context()
  mountSystemPrompt(ctx)
  const scopes = new FakeScopeRegistry(ctx)
  scopes.register({ id: 'only', tenant: 'tenant-a', metadata: { name: 'Only', aliases: ['only-alias'] } })
  installScopeHint(ctx)
  return { ctx, scopes }
}

/** A context with SystemPrompt + scope-hint installed but NO scope-registry. */
function setupNoRegistry(): Context {
  const ctx = new Context()
  mountSystemPrompt(ctx)
  installScopeHint(ctx)
  return ctx
}

// ── (a) scope-awareness filters by session tenant ────────────────────────

describe('GA-GT1 Phase 3d — scope-awareness per-session-tenant filter (D5.4)', () => {
  it('lists only the session tenant scopes (count shrinks, no foreign-tenant id)', async () => {
    const { ctx } = setupMultiTenant()

    // session tenant = tenant-a → only scope1, scope2 (2 of 3)
    const awarenessA = sectionText(await ctx.systemPrompt.assemble(sessionContext({ tenant: 'tenant-a' })), 'scope-awareness')
    expect(awarenessA).toContain('2 data scopes')
    expect(awarenessA).toContain('Scope One') // active scope (scope1) is shown
    expect(awarenessA).not.toContain('scope3')
    expect(awarenessA).not.toContain('Scope Three')

    // no tenant → all 3 scopes (the un-filtered baseline)
    const awarenessAll = sectionText(await ctx.systemPrompt.assemble(sessionContext({})), 'scope-awareness')
    expect(awarenessAll).toContain('3 data scopes')
  })

  it('does not leak a foreign-tenant active scope (filtered out → "No scope is currently active")', async () => {
    const { ctx, scopes } = setupMultiTenant()
    scopes.setActive('scope3') // active now belongs to tenant-b

    // session tenant = tenant-a → scope3 filtered out; the global active id
    // (scope3) matches none of tenant-a's summaries, so the active line must
    // NOT name the foreign scope.
    const awareness = sectionText(await ctx.systemPrompt.assemble(sessionContext({ tenant: 'tenant-a' })), 'scope-awareness')
    expect(awareness).toContain('2 data scopes')
    expect(awareness).toContain('No scope is currently active')
    expect(awareness).not.toContain('Scope Three')
    expect(awareness).not.toContain('scope3')

    // backward-compat: without a tenant filter, the active scope3 IS shown
    // (the leak this filter prevents once Phase 4 stamps session.tenant).
    const awarenessUnfiltered = sectionText(await ctx.systemPrompt.assemble(sessionContext({})), 'scope-awareness')
    expect(awarenessUnfiltered).toContain('3 data scopes')
    expect(awarenessUnfiltered).toContain('Scope Three')
  })
})

// ── (b) scope-alias-hint filters by session tenant ──────────────────────

describe('GA-GT1 Phase 3d — scope-alias-hint per-session-tenant filter (D5.4)', () => {
  it('ignores a foreign-tenant alias (no hint → no cross-tenant alias leak)', async () => {
    const { ctx } = setupMultiTenant()
    // "gamma" is tenant-b's alias; session tenant = tenant-a → tenant-b
    // aliases are not in the candidate set, so no hint is produced.
    const hint = sectionText(
      await ctx.systemPrompt.assemble(sessionContext({
        tenant: 'tenant-a',
        messages: [{ role: 'user', content: 'please query gamma' }],
      })),
      'scope-alias-hint',
    )
    expect(hint).toBe('')
  })

  it('matches a same-tenant alias and names only same-tenant scopes', async () => {
    const { ctx } = setupMultiTenant()
    // "beta" is tenant-a's alias for scope2 (not the active scope1) → a hint.
    const hint = sectionText(
      await ctx.systemPrompt.assemble(sessionContext({
        tenant: 'tenant-a',
        messages: [{ role: 'user', content: 'please query beta' }],
      })),
      'scope-alias-hint',
    )
    expect(hint).toContain('Scope Two')
    expect(hint).toContain('scope2')
    expect(hint).not.toContain('Scope Three')
    expect(hint).not.toContain('scope3')
  })

  it('does not leak a foreign-tenant active scope id when a same-tenant alias matches (H6/D5.4 cross-tenant leak regression)', async () => {
    const { ctx, scopes } = setupMultiTenant()
    // Global active is switched to tenant-b's scope3 (a foreign-tenant active
    // scope). The user message "please query beta" matches tenant-a's scope2
    // alias → a hint is produced. The active line must be derived from the
    // tenant-a-filtered summaries, where scope3 is absent (no is_active match)
    // → activeScopeId is undefined → "(none)". The previous code passed the
    // raw global `scopes.activeId()` ("scope3") straight to buildAliasHint,
    // leaking the foreign-tenant active scope id into the LLM system prompt.
    scopes.setActive('scope3')
    const hint = sectionText(
      await ctx.systemPrompt.assemble(sessionContext({
        tenant: 'tenant-a',
        messages: [{ role: 'user', content: 'please query beta' }],
      })),
      'scope-alias-hint',
    )
    expect(hint).toContain('Scope Two')      // same-tenant matched scope is named
    expect(hint).toContain('scope2')        // and its id is named
    expect(hint).not.toContain('scope3')     // foreign-tenant active id must NOT leak
    expect(hint).not.toContain('Scope Three') // foreign-tenant active name must NOT leak
    expect(hint).toContain('(none)')        // active line shows (none), not the foreign id
  })

  it('considers all aliases when no session tenant is set (backward-compatible)', async () => {
    const { ctx } = setupMultiTenant()
    // no tenant → tenant-b's "gamma" alias is visible and matches scope3.
    const hint = sectionText(
      await ctx.systemPrompt.assemble(sessionContext({
        messages: [{ role: 'user', content: 'please query gamma' }],
      })),
      'scope-alias-hint',
    )
    expect(hint).toContain('Scope Three')
    expect(hint).toContain('scope3')
  })
})

// ── (c) session without tenant → all scopes (backward-compatible) ───────

describe('GA-GT1 Phase 3d — backward compatibility without session.tenant (D5.4)', () => {
  it('no agent in the assembly context → lists all scopes (resolveSessionTenant → undefined)', async () => {
    const { ctx } = setupMultiTenant()
    const awareness = sectionText(await ctx.systemPrompt.assemble({}), 'scope-awareness')
    expect(awareness).toContain('3 data scopes')
  })

  it('agent.session present but tenant absent → lists all scopes', async () => {
    const { ctx } = setupMultiTenant()
    const awareness = sectionText(
      await ctx.systemPrompt.assemble(sessionContext({ messages: [{ role: 'user', content: 'hello' }] })),
      'scope-awareness',
    )
    expect(awareness).toContain('3 data scopes')
  })

  it('agent.session.tenant is a non-string value → treated as absent (lists all)', async () => {
    const { ctx } = setupMultiTenant()
    // A dormant/null tenant field must not corrupt filtering: undefined → all.
    const ctxObj = { agent: { session: { tenant: null } } } as unknown as AssembleContext
    const awareness = sectionText(await ctx.systemPrompt.assemble(ctxObj), 'scope-awareness')
    expect(awareness).toContain('3 data scopes')
  })
})

// ── (d) single scope / no registry → early-return '' unchanged ──────────

describe('GA-GT1 Phase 3d — early-return behavior unchanged (D5.4)', () => {
  it('single-scope registry → scope-awareness and alias-hint both return empty', async () => {
    const { ctx } = setupSingleScope()
    const assembly = await ctx.systemPrompt.assemble(sessionContext({
      tenant: 'tenant-a',
      messages: [{ role: 'user', content: 'only-alias' }], // matches the only alias
    }))
    expect(sectionText(assembly, 'scope-awareness')).toBe('')
    expect(sectionText(assembly, 'scope-alias-hint')).toBe('') // all.length <= 1 short-circuits
  })

  it('no registry mounted → both sections return empty (buildSummaries → [])', async () => {
    const ctx = setupNoRegistry()
    const assembly = await ctx.systemPrompt.assemble(sessionContext({ tenant: 'tenant-a' }))
    expect(sectionText(assembly, 'scope-awareness')).toBe('')
    expect(sectionText(assembly, 'scope-alias-hint')).toBe('')
  })
})
