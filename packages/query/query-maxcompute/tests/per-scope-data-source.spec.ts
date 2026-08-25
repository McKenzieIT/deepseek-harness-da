/**
 * P4e — per-scope ODPS data-source resolution.
 *
 * The Provider resolves the per-call scope's ODPS data-source — endpoint/project
 * from the scope-registry metadata (`scopes.yaml` `metadata.maxcompute`), the
 * two secret refs (ODPS_ACCESS_ID/KEY) from `ctx.credentials` lazily per call
 * via `{scopeId}` — and pushes the 4-key creds map to the sidecar via
 * `set_credentials` per call. This closes the cross-scope data leak: the prior
 * `resolve(ref)` (no address) resolved the GLOBAL/shared value — dormant under
 * `credMode: sidecar-self` (which skips the push), a live leak under push mode
 * (a query for scope A would use scope B's shared creds/project).
 *
 * The leak-closure is fail-closed: an unknown scope, a scope missing
 * endpoint/project, or a missing secret ref throws — never a silent fallback
 * to a global default that could serve the wrong scope's data.
 *
 * Mounts a minimal fake scope-registry (under the 'scopes' name — the same
 * structural shape `get(id)`/`active()` the Provider probes via `ctx.get('scopes')`)
 * + a minimal in-memory CredentialProvider that RESPECTS `{scopeId}` (the
 * dimension flat `credentials-local` ignores). The `sendCredentials` sidecar-call
 * seam is overridden with a recorder so the pushed payload is observable without
 * spawning the stand-in sidecar. Per-scope values (ieu_cdm/hdyl_data_sg/
 * domestic/overseas) are TEST FIXTURES — the source bakes none of them; the
 * scope-boundary test proves config-driven with a non-real project value.
 *
 * Run: pnpm vitest run packages/query/query-maxcompute
 */
import { describe, it, expect } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { MaxComputeQueryEngine, type Config } from '../src/index.ts'
import {
  CredentialProvider,
  credentialRef,
  type CredentialRef,
  type CredentialAddress,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'

const ODPS_ACCESS_ID = credentialRef('ODPS_ACCESS_ID')
const ODPS_ACCESS_KEY = credentialRef('ODPS_ACCESS_KEY')

/**
 * Minimal in-memory CredentialProvider that RESPECTS `{scopeId}` (flat
 * `credentials-local` ignores the dimension, so it cannot test per-scope
 * isolation). Returns `undefined` for an unprovisioned scope so the fail-closed
 * path is exercisable. `seed` is a test-only seeder (not on the seam) standing
 * in for admin (P9b) pre-resolving into the keychain by scopeId.
 */
class PerScopeMemoryCredentials extends CredentialProvider {
  private readonly store = new Map<string, Map<CredentialRef, ResolvedCredential>>()

  seed(ref: CredentialRef, value: string, scopeId: string): void {
    let perScope = this.store.get(scopeId)
    if (perScope === undefined) { perScope = new Map(); this.store.set(scopeId, perScope) }
    perScope.set(ref, { value, source: 'test-memory' })
  }

  override async resolve(ref: CredentialRef, address?: CredentialAddress): Promise<ResolvedCredential | undefined> {
    const sid = address?.scopeId
    if (sid === undefined) return undefined
    return this.store.get(sid)?.get(ref)
  }
  override async describe(): Promise<{ configured: boolean; writable: boolean }> { return { configured: false, writable: true } }
  override async set(): Promise<void> { /* not exercised */ }
  override async unset(): Promise<void> { /* not exercised */ }
}

/**
 * Minimal scope-registry mounted under the 'scopes' name — the structural
 * shape (`get(id)` / `active()` returning `{ id, metadata? }`) the Provider
 * probes via `ctx.get('scopes')`. The real ScopeRegistryService has the same
 * shape; its scopes.yaml loading is covered by its own tests.
 */
class FakeScopeRegistry extends Service {
  private readonly scopes = new Map<string, { id: string; metadata?: Readonly<Record<string, unknown>> }>()
  private activeId: string | undefined

  constructor(ctx: Context) { super(ctx, 'scopes') }

  register(def: { id: string; metadata?: Readonly<Record<string, unknown>> }): void {
    this.scopes.set(def.id, { id: def.id, ...(def.metadata !== undefined ? { metadata: def.metadata } : {}) })
    if (this.activeId === undefined) this.activeId = def.id
  }
  setActive(id: string): void { this.activeId = id }
  get(id: string): { id: string; metadata?: Readonly<Record<string, unknown>> } | undefined { return this.scopes.get(id) }
  active(): { id: string; metadata?: Readonly<Record<string, unknown>> } | undefined {
    return this.activeId === undefined ? undefined : this.scopes.get(this.activeId)
  }
}

/**
 * Subclass overriding the `sendCredentials` sidecar-call seam with a recorder,
 * so the pushed per-scope payload is observable without spawning the sidecar.
 * `pushCredentials` is a real production method (called by `execute`); this
 * only intercepts the final sidecar call.
 */
class RecordingEngine extends MaxComputeQueryEngine {
  readonly pushed: Record<string, Record<string, string>> = {}

  protected override async sendCredentials(scopeId: string, creds: Record<string, string>): Promise<void> {
    this.pushed[scopeId] = creds
  }
}

/** A context + fake registry (K11 + X63) + fake creds (per-scope access_id/key). */
function setup(): { ctx: Context; registry: FakeScopeRegistry; creds: PerScopeMemoryCredentials } {
  const ctx = new Context()
  const registry = new FakeScopeRegistry(ctx)
  registry.register({ id: '10000251', metadata: { maxcompute: { endpoint: 'http://domestic-endpoint', project: 'ieu_cdm' } } })
  registry.register({ id: '10000334', metadata: { maxcompute: { endpoint: 'http://overseas-endpoint', project: 'hdyl_data_sg' } } })
  const creds = new PerScopeMemoryCredentials(ctx)
  creds.seed(ODPS_ACCESS_ID, 'k11-access-id', '10000251')
  creds.seed(ODPS_ACCESS_KEY, 'k11-access-key', '10000251')
  creds.seed(ODPS_ACCESS_ID, 'x63-access-id', '10000334')
  creds.seed(ODPS_ACCESS_KEY, 'x63-access-key', '10000334')
  return { ctx, registry, creds }
}

function newRecordingEngine(ctx: Context, config: Partial<Config> = {}): RecordingEngine {
  return new RecordingEngine(ctx, { args: [], credMode: 'push', ...config })
}

describe('MaxComputeQueryEngine per-scope data-source resolution (P4e)', () => {
  describe('pushCredentials — per-scope set_credentials payload', () => {
    it("pushes K11's data-source (ieu_cdm / domestic / K11 creds) for scope 10000251", async () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx)
      await engine.pushCredentials('10000251')
      expect(engine.pushed['10000251']).toEqual({
        ODPS_ACCESS_ID: 'k11-access-id',
        ODPS_ACCESS_KEY: 'k11-access-key',
        ODPS_PROJECT: 'ieu_cdm',
        ODPS_ENDPOINT: 'http://domestic-endpoint',
      })
    })

    it("pushes X63's data-source (hdyl_data_sg / overseas / X63 creds) for scope 10000334 — different on every key", async () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx)
      await engine.pushCredentials('10000334')
      expect(engine.pushed['10000334']).toEqual({
        ODPS_ACCESS_ID: 'x63-access-id',
        ODPS_ACCESS_KEY: 'x63-access-key',
        ODPS_PROJECT: 'hdyl_data_sg',
        ODPS_ENDPOINT: 'http://overseas-endpoint',
      })
    })

    it('switching scope yields a different data-source per call — no cross-scope leak', async () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx)
      await engine.pushCredentials('10000251') // K11
      await engine.pushCredentials('10000334') // X63
      // K11's pushed project/creds must never be X63's (no leak)
      expect(engine.pushed['10000251']!.ODPS_PROJECT).toBe('ieu_cdm')
      expect(engine.pushed['10000334']!.ODPS_PROJECT).toBe('hdyl_data_sg')
      expect(engine.pushed['10000251']!.ODPS_ACCESS_ID).toBe('k11-access-id')
      expect(engine.pushed['10000334']!.ODPS_ACCESS_ID).toBe('x63-access-id')
    })

    it('credMode=sidecar-self skips the push entirely (maxc self-auths; no set_credentials call)', async () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx, { credMode: 'sidecar-self' })
      await engine.pushCredentials('10000251')
      expect(engine.pushed['10000251']).toBeUndefined()
    })
  })

  describe('pushCredentials — fail-closed (no silent cross-scope fallback)', () => {
    it('rejects an unknown scope (not registered) rather than falling back', async () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx)
      await expect(engine.pushCredentials('99999999')).rejects.toThrow(/not registered/i)
    })

    it('rejects a scope missing metadata.maxcompute.endpoint', async () => {
      const { ctx, registry } = setup()
      registry.register({ id: 'no-endpoint', metadata: { maxcompute: { project: 'p' } } })
      const engine = newRecordingEngine(ctx)
      await expect(engine.pushCredentials('no-endpoint')).rejects.toThrow(/endpoint/i)
    })

    it('rejects a scope missing metadata.maxcompute.project', async () => {
      const { ctx, registry } = setup()
      registry.register({ id: 'no-project', metadata: { maxcompute: { endpoint: 'http://e' } } })
      const engine = newRecordingEngine(ctx)
      await expect(engine.pushCredentials('no-project')).rejects.toThrow(/project/i)
    })

    it('rejects when a secret ref (ODPS_ACCESS_ID) is unprovisioned for the scope', async () => {
      const { ctx, registry, creds } = setup()
      registry.register({ id: 'no-creds', metadata: { maxcompute: { endpoint: 'http://e', project: 'p' } } })
      // seed only the KEY, not the ID
      creds.seed(ODPS_ACCESS_KEY, 'k', 'no-creds')
      const engine = newRecordingEngine(ctx)
      await expect(engine.pushCredentials('no-creds')).rejects.toThrow(/ODPS_ACCESS_ID|missing.*credential/i)
    })
  })

  describe('qualifyTable — per-scope project via the active scope', () => {
    it("qualifies with the active scope's project (K11 → ieu_cdm)", () => {
      const { ctx } = setup() // K11 active by default (first register)
      const engine = newRecordingEngine(ctx)
      expect(engine.qualifyTable('dws_pay_order_di')).toBe('ieu_cdm.dws_pay_order_di')
    })

    it('switching the active scope changes the qualifier (X63 → hdyl_data_sg)', () => {
      const { ctx, registry } = setup()
      const engine = newRecordingEngine(ctx)
      registry.setActive('10000334')
      expect(engine.qualifyTable('ods_10000334_all_view')).toBe('hdyl_data_sg.ods_10000334_all_view')
    })

    it("the per-table override still wins over the active scope's project", () => {
      const { ctx } = setup()
      const engine = newRecordingEngine(ctx)
      expect(engine.qualifyTable('foo', 'explicit_project')).toBe('explicit_project.foo')
    })

    it('falls back to static defaultProject when the scope-registry is unmounted', () => {
      const ctx = new Context() // no scope-registry
      const engine = newRecordingEngine(ctx, { defaultProject: 'ieu_cdm' })
      expect(engine.qualifyTable('dws_pay_order_di')).toBe('ieu_cdm.dws_pay_order_di')
    })
  })

  describe('scope-boundary — per-scope values are config-driven, not source-baked', () => {
    it('flows an arbitrary (non-real) project value from scope metadata to the pushed creds', async () => {
      // A project value that appears NOWHERE in the source — if the source baked
      // a project, this would not flow through. Proves config-driven (open-closed:
      // add project/region = register a scope, not a source edit).
      const { ctx, registry, creds } = setup()
      registry.register({ id: 'cfg-driven', metadata: { maxcompute: { endpoint: 'http://cfg-endpoint', project: 'zzz-not-a-real-project-zzz' } } })
      creds.seed(ODPS_ACCESS_ID, 'c-id', 'cfg-driven')
      creds.seed(ODPS_ACCESS_KEY, 'c-key', 'cfg-driven')
      const engine = newRecordingEngine(ctx)
      await engine.pushCredentials('cfg-driven')
      expect(engine.pushed['cfg-driven']!.ODPS_PROJECT).toBe('zzz-not-a-real-project-zzz')
      expect(engine.pushed['cfg-driven']!.ODPS_ENDPOINT).toBe('http://cfg-endpoint')
    })
  })
})
