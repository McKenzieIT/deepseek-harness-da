/**
 * Service Provider: MaxCompute query engine (`ctx.query`).
 *
 * da-self-held raw MCP SDK `Client` over a stdio sidecar (G4 decision P1,
 * additive-only — does not touch mcp-client core). The provider programs ALL
 * sidecar tools by raw name and registers NONE on `ctx.tools`, so
 * `set_credentials` / `invalidate_scope` are non-model-callable (A1-split:
 * the control-channel gap closes). Reliability is lazy on-next-call re-spawn
 * (G4 Q1 (ii)): a dead client is re-spawned at the next `execute`, an
 * in-flight query is rejected with ConnectionClosed by the SDK `_onclose`
 * (no hang), and a crash-loop counter bounds re-spawn. Credentials are
 * resolved per call and pushed via an idempotent `set_credentials` control
 * tool (R6 (b) + G4 HOLE-C drop: unchanged → no-op preserving the per-scope
 * connection cache; changed → store new + drop that scope's cache, in-flight
 * holds the old connection to completion). PATs never ride the spawn env
 * (scrubbed; intranet-security-first).
 *
 * DEFERRED to the A1-split engine-wrapper hardening: the guard chain
 * (CostGuard estimate_cost / TimeoutGuard signal / RetryGuard / OrphanReaper),
 * the real pyodps sidecar, real per-scope ODPS connection caching, and real
 * e2e. This provider is the dumb raw executor plus the P1 wiring.
 *
 * @module @deepseek-ai/dsh-query-maxcompute
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z as zod } from 'zod'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { QueryEngine } from '@deepseek-ai/dsh-query/src/index.ts'
import { credentialRef, scopeId as brandScopeId } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { InstanceId, QueryOutcome, QueryRequest, QuerySpec, ScopeId } from '@deepseek-ai/dsh-query/src/index.ts'
import { normalizeForMaxCompute } from './normalize.ts'

/**
 * ODPS credential references — the 4-key creds map pushed to the sidecar via
 * `set_credentials` (contract unchanged; stand-in/maxc sidecars read these
 * keys). P4e: only ACCESS_ID/ACCESS_KEY are SECRETS resolved per-scope via the
 * credentials seam `{scopeId}` (P12); PROJECT/ENDPOINT are non-secret per-scope
 * config from the scope-registry `metadata.maxcompute`. PAT-not-in-env: the
 * sidecar is spawned scrubbed and creds are pushed per call — never the spawn
 * env (R6 (b) + G4 HOLE-C).
 */
const ODPS_ACCESS_ID = credentialRef('ODPS_ACCESS_ID')
const ODPS_ACCESS_KEY = credentialRef('ODPS_ACCESS_KEY')
const ODPS_PROJECT = credentialRef('ODPS_PROJECT')
const ODPS_ENDPOINT = credentialRef('ODPS_ENDPOINT')

/**
 * Optional per-scope registry probed via `ctx.get('scopes')` (undefined when
 * unmounted) — the same structural, no-static-dep pattern semantic-layer's P1
 * uses. The Provider resolves the per-call scope's non-secret ODPS
 * endpoint/project from `metadata.maxcompute`; when unmounted, qualifyTable
 * falls back to static `defaultProject`.
 */
interface ScopeRegistryLike {
  /** A scope by id, or undefined when not registered. */
  get(id: string): { readonly id: string; readonly metadata?: Readonly<Record<string, unknown>> } | undefined
  /** The active scope, or undefined when none is active. */
  active(): { readonly id: string; readonly metadata?: Readonly<Record<string, unknown>> } | undefined
}

/**
 * Raw sidecar tool names. da programs ALL of these by raw name; none enter
 * `ctx.tools` (A1-split: query tools stay programmatic, control tools stay
 * non-model-callable). `get_state` is a stand-in diagnostic.
 */
const TOOLS = {
  execute: 'execute',
  attach: 'attach',
  cancel: 'cancel',
  getProgress: 'get_progress',
  estimateCost: 'estimate_cost',
  setCredentials: 'set_credentials',
  invalidateScope: 'invalidate_scope',
  getState: 'get_state',
} as const

/** The three valid QueryOutcome states, for boundary validation of untrusted sidecar JSON. */
const QUERY_STATES: ReadonlySet<string> = new Set(['completed', 'pending', 'failed'])

/**
 * Permissive tools/call result schema (mirror mcp-client `tools.ts`): the
 * sidecar returns a string-keyed object; this bridge owns JSON-value
 * decoding after transport. A strict SDK `CallToolResultSchema` would do as
 * well, but permissive keeps the stand-in sidecar's exact framing
 * non-load-bearing.
 */
const RawCallToolResultSchema = zod.record(zod.string(), zod.unknown())

/** Plugin config — `sidecarPath` is required; `static Config` supplies defaults for the rest. */
export interface Config {
  /** Sidecar executable (default: the node binary; production: `python`). */
  command?: string
  /** Path to the sidecar script (the first spawn arg). Required. */
  sidecarPath: string
  /**
   * ODPS config path passed to the sidecar via `--maxc-config`. Deployment-
   * overridable — the bundle does NOT hardcode a machine-specific path; supply
   * via cordis.yml override or env (S1 decouple). Empty string = not configured;
   * spawn fails loud to surface misconfiguration early.
   */
  maxcConfigPath?: string
  /** Sidecar spawn cwd (default: process.cwd()). */
  cwd?: string
  /** Per tools/call timeout in ms; the SDK sends notifications/cancelled + rejects. */
  toolCallTimeoutMs?: number
  /** Max consecutive re-spawn attempts before the crash-loop gives up (G4 Q1). */
  crashLoopMaxAttempts?: number
  /**
   * Credential flow for the sidecar (P4d; P4e per-scope). `'push'` (default):
   * the da resolves the per-call scope's data-source per call — endpoint/project
   * from the scope-registry `metadata.maxcompute`, access_id/key from the
   * credentials seam via `{scopeId}` (P12) — and pushes the 4-key creds map via
   * `set_credentials` (PAT-not-in-env). `'sidecar-self'`: the maxc-backed
   * sidecar self-auths from its own config (P4c: `set_credentials` → no-op, da
   * pushes no ODPS creds) — `pushCredentials` is a no-op and `execute` proceeds
   * straight to the sidecar. `static inject = ['credentials']` is unchanged.
   */
  credMode?: 'push' | 'sidecar-self'
  /**
   * Fallback ODPS project for table-name qualification (C: engine-agnostic).
   * P4e: the per-scope project (`metadata.maxcompute.project` of the active
   * scope) is primary; this static value is the fallback when the scope-registry
   * is unmounted or the active scope has no project (cordis.patch.yml fills
   * `ieu_cdm`). Supersedes the misread `config.yaml project.name` (a game scope
   * id, NOT an ODPS project). When empty too, `qualifyTable` returns the bare
   * table name (graceful degradation).
   */
  defaultProject?: string
}

/** Resolved config shape: schemastery has applied every default. */
type ResolvedConfig = Required<Config>

export const Config: z<Config> = z.object({
  command: z.string().default(process.execPath),
  sidecarPath: z.string(),
  maxcConfigPath: z.string().default(''),
  cwd: z.string().default(process.cwd()),
  toolCallTimeoutMs: z.number().min(0).default(60_000),
  crashLoopMaxAttempts: z.number().min(0).default(5),
  credMode: z.union(['push', 'sidecar-self'] as const).default('push'),
  // C: default '' so a config that omits defaultProject degrades to bare
  // table names in qualifyTable (no `undefined.` prefix) — engine-agnostic.
  defaultProject: z.string().default(''),
})

/**
 * Classify a MaxCompute (ODPS) error text into a fine-grained `failureKind`.
 *
 * Self-evolution #1: phase-gate (#2b, Task 6) needs to identify
 * TABLE_NOT_FOUND to trigger the ask-user-for-project flow. Both the MCP
 * `isError` path and the sidecar's `toOutcome` (dev/maxc-sidecar.mjs) surface
 * the verbatim ODPS error text in `error`; this pure function parses it for
 * ODPS codes/keywords. Returns `'unknown'` when no known code is detected —
 * callers then keep their existing coarse failureKind ('remote' on the MCP
 * isError path; the sidecar's 'transport'/'retryable'/'unknown' on the JSON
 * path), so an absence of detection never clobbers a recoverable signal.
 *
 * Pattern order matters: `not_found` (ODPS-0130131) is checked before `syntax`
 * (ODPS-0130[^1]) since both share the `0130` prefix — `0130131` is
 * table-not-found, bare `0130` (followed by anything but `1`) is a syntax
 * error. `permission` is checked before `timeout` since `ODPS-0121` covers
 * both denied and timeout variants. Case-insensitive throughout.
 *
 * Layering: the provider owns ODPS error-code knowledge; phase-gate only reads
 * `failureKind`. The query-tool seam already passes `failureKind` through
 * verbatim (query-tool/src/index.ts:145), so it needs no change here.
 *
 * @param text The verbatim ODPS error text (maxc `error.message` / MCP isError text).
 * @returns `'not_found'` | `'permission'` | `'syntax'` | `'timeout'` | `'unknown'`.
 */
export function classifyMaxcError(
  text: string,
): 'not_found' | 'permission' | 'syntax' | 'timeout' | 'unknown' {
  if (/Table not found|NoSuchTable|ODPS-0130131/i.test(text)) return 'not_found'
  if (/AccessDenied|permission|ODPS-0121.*denied|ODPS-0420/i.test(text)) return 'permission'
  if (/syntax error|ODPS-0130[^1]|parse error/i.test(text)) return 'syntax'
  if (/timeout|timed out|ODPS-0121.*timeout|exceeded/i.test(text)) return 'timeout'
  return 'unknown'
}

/**
 * MaxCompute query engine over a stdio MCP sidecar. Owns the raw SDK Client
 * lifecycle: eager connect on mount (HOLE-A fail-fast), lazy re-spawn on
 * death, dispose closes + kills. No `ctx.tools` registration — A1-split.
 */
export class MaxComputeQueryEngine extends QueryEngine {
  /** Per-call credential resolution (R6 (b); PAT not in spawn env). */
  static inject = ['credentials']

  static Config = Config

  private client: Client | undefined
  private transport: StdioClientTransport | undefined
  /** client.onclose → dead=true (G4 Q1 onclose); cleared on re-spawn. */
  private dead = true
  /** Single-owner lock: concurrent callers share one re-spawn (G4 Q1 double-spawn). */
  private connectingPromise: Promise<Client> | undefined
  /** Bounded re-spawn counter (G4 Q1 crash-loop). */
  private crashAttempts = 0
  private disposed = false
  /** True during an intentional stopSidecar so onclose does not count a crash (G4 Q1 operational bound). */
  private stopping = false
  /** Post-connect (operational) crash count, gated before re-spawn (G4 Q1 bound). */
  private operationalCrashes = 0

  constructor(ctx: Context, public config: Config) {
    super(ctx)
  }

  /** Schemastery-normalized config (defaults applied). */
  private get cfg(): ResolvedConfig {
    return this.config as ResolvedConfig
  }

  async *[Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    // Register teardown FIRST so a failed connect still cleans up the half-spawned sidecar.
    yield async () => {
      await this.dispose()
    }
    // Eager connect on mount (G4: Service start → await client.connect; HOLE-A fail-fast).
    await this.ensureConnected()
  }

  /** Explicitly trigger the eager connect (idempotent). [Service.init] also calls this;
   *  this method lets a caller guarantee the sidecar is up before first use, regardless
   *  of the mount's async timing. */
  async start(): Promise<void> {
    await this.ensureConnected()
  }

  // ── lazy on-next-call re-spawn (G4 Q1 (ii)) ──────────────────────────────

  private async ensureConnected(): Promise<Client> {
    if (!this.disposed && this.client !== undefined && !this.dead) return this.client
    if (this.disposed) throw new Error('query-maxcompute is disposed')
    // G4 Q1 operational crash-loop bound: a flapping sidecar (starts cleanly,
    // crashes mid-operation, respawns on the next call) is rate-limited and
    // eventually abandoned, mirroring the spawn-failure ceiling. Linear backoff
    // prevents a respawn storm; the ceiling reuses crashLoopMaxAttempts.
    if (this.operationalCrashes > this.cfg.crashLoopMaxAttempts) {
      throw new Error(
        `query-maxcompute: sidecar crash-loop exceeded ${this.cfg.crashLoopMaxAttempts} operational crashes; aborting re-spawn`,
      )
    }
    if (this.operationalCrashes > 0) {
      await new Promise<void>((resolve) => { setTimeout(resolve, Math.min(this.operationalCrashes * 1000, 30_000)) })
    }
    if (this.connectingPromise !== undefined) return this.connectingPromise // concurrent callers await one re-spawn
    this.connectingPromise = this.spawnAndConnect()
    try {
      return await this.connectingPromise
    } finally {
      this.connectingPromise = undefined
    }
  }

  private async spawnAndConnect(): Promise<Client> {
    // Stop any old sidecar first (reuse stdio close() terminal state — G4 NEW边界(5)).
    await this.stopSidecar()
    // S1 fail-loud: sidecar-self credMode requires maxcConfigPath for self-auth.
    if (this.cfg.credMode === 'sidecar-self' && !this.cfg.maxcConfigPath) {
      throw new Error(
        'query-maxcompute: Config.maxcConfigPath is required when credMode is "sidecar-self" — supply the ODPS config path via deployment cordis.yml override',
      )
    }
    const sidecarArgs: string[] = [this.cfg.sidecarPath]
    if (this.cfg.maxcConfigPath) {
      sidecarArgs.push('--maxc-config', this.cfg.maxcConfigPath)
    }
    // Spawn scrubbed: NO creds in spawn env (PAT not in process.env; intranet-security-first).
    this.transport = new StdioClientTransport({
      command: this.cfg.command,
      args: sidecarArgs,
      env: scrubbedParentEnv(),
      cwd: this.cfg.cwd,
    })
    this.client = new Client(
      { name: 'dsh-query-maxcompute', version: '0.0.0' },
      // enforceStrictCapabilities defaults falsy — raw tools/call is not tool-name-gated (R6 §8.1).
      { capabilities: {} },
    )
    // G4 NEW边界(6): onclose clears state (in-flight already rejected by SDK _onclose);
    // onerror is callback-only (no state clear, no reject — EPIPE's micro-window closes via onclose).
    this.client.onclose = () => {
      // Capture connected state before clearing: a connect-phase close (dead was
      // never set false) is a spawn failure counted by `crashAttempts` in the
      // catch below — do NOT double-count it into `operationalCrashes`.
      const wasConnected = !this.dead
      this.dead = true
      // Count operational (post-connect) crashes toward the re-spawn bound. The
      // spawn-failure `crashAttempts` counter only bounds sidecar-won't-start;
      // an operational flap (start → crash → next call re-spawns → repeat) would
      // otherwise respawn indefinitely. `stopping` excludes intentional closes;
      // `wasConnected` excludes connect-phase closes (counted by `crashAttempts`).
      if (!this.stopping && wasConnected) this.operationalCrashes += 1
    }
    this.client.onerror = (error: unknown) => {
      this.ctx.logger.warn('query-maxcompute: sidecar transport error')
      this.ctx.logger.warn(error)
    }
    try {
      // HOLE-A: connect runs initialize + protocol-version check + notifications/initialized.
      // SDK auto close()+throw on failure (client/index.js:324); spawn-then-crash-during-initialize
      // is rejected by SDK _onclose (no hang — G4 NEW边界(4)).
      await this.client.connect(this.transport)
      this.dead = false
      this.crashAttempts = 0
      // Reset the operational crash bound on a successful connect: a sidecar
      // that crashes then recovers is not permanently abandoned. Without this
      // reset, `operationalCrashes` is a lifetime monotonic counter and the
      // engine is irrecoverably bricked after `crashLoopMaxAttempts` lifetime
      // crashes (G4 Q1 lifecycle fix — was the stale README bullet's gap).
      this.operationalCrashes = 0
    } catch (error) {
      this.dead = true
      this.crashAttempts += 1
      if (this.crashAttempts > this.cfg.crashLoopMaxAttempts) {
        throw new Error(
          `query-maxcompute: sidecar crash-loop exceeded ${this.cfg.crashLoopMaxAttempts} attempts; aborting re-spawn`,
        )
      }
      throw error // surface to caller; the next call lazy re-spawns
    }
    // Post-spawn disposed re-check (outside the catch so a dispose is NOT
    // miscounted as a spawn failure): a dispose that interleaved during connect
    // must not leak the freshly-spawned sidecar nor let callers use a torn-down
    // engine. stopSidecar closes the new child; the shared promise rejects so
    // every awaiter (ensureConnected's direct-return concurrent callers too)
    // sees the disposed error instead of proceeding to callTool.
    if (this.disposed) {
      await this.stopSidecar()
      throw new Error('query-maxcompute is disposed')
    }
    return this.client
  }

  private async stopSidecar(): Promise<void> {
    const client = this.client
    this.client = undefined
    this.transport = undefined
    this.stopping = true // suppress onclose crash-counting for the intentional close
    if (client !== undefined) {
      try {
        // stdio close(): stdin.end → 2s → SIGTERM → 2s → SIGKILL (G4 NEW边界(5)).
        await client.close()
      } catch {
        // best-effort: the sidecar may already be dead
      }
    }
    this.stopping = false
  }

  // ── raw-name programmatic call (A1-split: no ctx.tools registration) ─────

  private async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<QueryOutcome> {
    const client = await this.ensureConnected()
    const result = await client.request(
      { method: 'tools/call', params: { name, arguments: args } },
      RawCallToolResultSchema,
      { ...(signal ? { signal } : {}), timeout: this.cfg.toolCallTimeoutMs },
    )
    return this.decodeResult(result, name)
  }

  /** Raw call for control tools (set_credentials / invalidate_scope / cancel / get_state). */
  private async callControl(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = await this.ensureConnected()
    return client.request(
      { method: 'tools/call', params: { name, arguments: args } },
      RawCallToolResultSchema,
      { timeout: this.cfg.toolCallTimeoutMs },
    )
  }

  /**
   * The sidecar returns its outcome as a single text content blob (JSON).
   * Decode it back to a QueryOutcome. A real pyodps sidecar (deferred) returns
   * the same envelope; when it sets `isError` (a semantic failure), surface the
   * text verbatim as a `failed` outcome rather than mislabeling it transport.
   *
   * Self-evolution #1: after decoding, a `failed` outcome is run through
   * `classifyMaxcError` so phase-gate can branch on `not_found` (→ ask user
   * for project). A detected ODPS code wins on both the MCP `isError` path
   * (coarse 'remote' → 'not_found') and the JSON path (sidecar's coarse
   * 'transport'/'retryable'/'unknown' → 'not_found'); an absence of detection
   * keeps the existing coarse label (so a recoverable 'retryable' is not
   * clobbered). The undecodable path stays 'transport' (a protocol failure,
   * not an ODPS error — nothing to classify).
   */
  private decodeResult(result: Record<string, unknown>, tool: string): QueryOutcome {
    const content = result.content
    const text = Array.isArray(content) ? (content[0] as { text?: string } | undefined)?.text : undefined
    if (result.isError === true) {
      const errorText = typeof text === 'string' ? text : `${tool} returned isError`
      const kind = classifyMaxcError(errorText)
      return { state: 'failed', error: errorText, failureKind: kind === 'unknown' ? 'remote' : kind, sql: '' }
    }
    if (typeof text === 'string') {
      try {
        const parsed = JSON.parse(text) as QueryOutcome
        // Boundary validation: sidecar JSON is untrusted. A bare `as` cast would
        // let an out-of-enum/missing `state` through and trip the defaultless
        // switches downstream into undefined/TypeError. Normalize an unknown
        // state to a transport failure so the contract holds on BOTH sides.
        const rawState: unknown = (parsed as unknown as { state?: unknown }).state
        if (typeof rawState !== 'string' || !QUERY_STATES.has(rawState)) {
          return { state: 'failed', error: `undecodable ${tool} result: unknown state ${JSON.stringify(rawState)}`, failureKind: 'transport', sql: '' }
        }
        // Only classify failures — completed/pending pass through untouched.
        // classify → 'unknown' keeps the sidecar's label (don't clobber a
        // recoverable 'retryable' or a 'transport' spawn/parse signal).
        if (parsed.state === 'failed') {
          const classified = classifyMaxcError(parsed.error ?? '')
          if (classified !== 'unknown') return { ...parsed, failureKind: classified }
        }
        return parsed
      } catch {
        // fall through to failure
      }
    }
    return { state: 'failed', error: `undecodable ${tool} result`, failureKind: 'transport', sql: '' }
  }

  // ── P4e: per-scope data-source resolution + idempotent set_credentials ──

  /** P4e: the optional scope-registry, probed by name (undefined when unmounted). */
  private scopes(): ScopeRegistryLike | undefined {
    return this.ctx.get('scopes') as ScopeRegistryLike | undefined
  }

  /**
   * P4e: the per-call scope's ODPS data-source — endpoint/project (non-secret)
   * from the scope-registry `metadata.maxcompute`, access_id/key (secrets) from
   * `ctx.credentials` lazily per call via `{scopeId}` (P12 per-scope). This is
   * the cross-scope leak-closure point: the prior `resolve(ref)` (no address)
   * resolved the GLOBAL value — dormant under `sidecar-self`, a live leak under
   * push mode (a query for scope A used scope B's shared creds/project).
   * Fail-closed: an unknown scope, a scope missing endpoint/project, or a
   * missing secret ref throws — never a silent fallback to a global default
   * that could serve the wrong scope's data.
   *
   * @param scopeId the per-call scope (QueryRequest.scopeId; server-resolved,
   * client-can't-supply per P9).
   * @returns the resolved data-source {endpoint, project, accessId, accessKey}.
   */
  protected async resolveDataSource(scopeId: ScopeId): Promise<{
    endpoint: string
    project: string
    accessId: string
    accessKey: string
  }> {
    const { endpoint, project } = this.resolveScopeDataSourceConfig(scopeId)
    const accessId = await this.resolveCredOrThrow(ODPS_ACCESS_ID, scopeId)
    const accessKey = await this.resolveCredOrThrow(ODPS_ACCESS_KEY, scopeId)
    return { endpoint, project, accessId, accessKey }
  }

  /**
   * P4e: the non-secret per-scope endpoint/project from the scope-registry's
   * `metadata.maxcompute`. Fail-closed on an unknown scope or a scope missing
   * either field — no global fallback (would serve the wrong scope's data).
   */
  private resolveScopeDataSourceConfig(scopeId: ScopeId): { endpoint: string; project: string } {
    const scope = this.scopes()?.get(scopeId)
    if (scope === undefined) {
      throw new Error(`query-maxcompute: scope "${scopeId}" not registered — provision it in scopes.yaml (P4e fail-closed; no cross-scope fallback)`)
    }
    const mc = scope.metadata?.maxcompute as { endpoint?: string; project?: string } | undefined
    if (mc === undefined || typeof mc.endpoint !== 'string' || mc.endpoint === '' || typeof mc.project !== 'string' || mc.project === '') {
      throw new Error(`query-maxcompute: scope "${scopeId}" missing metadata.maxcompute.{endpoint,project} in scopes.yaml (P4e fail-closed)`)
    }
    return { endpoint: mc.endpoint, project: mc.project }
  }

  /**
   * P4e: resolve one secret credential ref per-scope via `ctx.credentials`
   * (P12 `{scopeId}`), lazily per call. Fail-closed when unprovisioned —
   * PAT-not-in-env means it must come via the seam.
   */
  private async resolveCredOrThrow(ref: CredentialRef, scopeId: ScopeId): Promise<string> {
    const resolved = await this.ctx.credentials.resolve(ref, { scopeId: brandScopeId(scopeId) })
    if (resolved === undefined) {
      throw new Error(`query-maxcompute: missing ODPS credential "${ref}" for scope "${scopeId}"; provision it via the credentials seam (P4e fail-closed)`)
    }
    return resolved.value
  }

  /**
   * P4e: the sidecar `set_credentials` call — a protected seam so the per-scope
   * push is observable without spawning the sidecar (a recorder overrides this
   * in tests). Idempotent on the sidecar: unchanged → no-op (preserve the
   * per-scope connection cache); changed → store new + drop that scope's cache.
   * In-flight queries hold their old connection to completion (G4 HOLE-C drop).
   */
  protected async sendCredentials(scopeId: ScopeId, creds: Record<string, string>): Promise<void> {
    await this.callControl(TOOLS.setCredentials, { scope_id: scopeId, creds })
  }

  /**
   * P4e: per-call cred resolve + idempotent set_credentials (D3, G4 HOLE-C
   * drop). Resolves the per-call scope's data-source (endpoint/project from
   * scope-registry metadata; access_id/key from the credentials seam via
   * `{scopeId}`) and pushes the 4-key creds map per call. Fail-closed: an
   * unknown / unprovisioned scope throws rather than silently shrinking the
   * sidecar's stored set or falling back to a global default.
   *
   * P4d: `credMode: 'sidecar-self'` skips the push entirely (a maxc-backed
   * sidecar self-auths from its own config; the da pushes no ODPS creds).
   *
   * @param scopeId The per-call scope whose ODPS data-source (endpoint/project +
   * access_id/key) to resolve and push to the sidecar via set_credentials.
   */
  async pushCredentials(scopeId: ScopeId): Promise<void> {
    if (this.cfg.credMode === 'sidecar-self') return
    const { endpoint, project, accessId, accessKey } = await this.resolveDataSource(scopeId)
    const creds: Record<string, string> = {
      [ODPS_ACCESS_ID]: accessId,
      [ODPS_ACCESS_KEY]: accessKey,
      [ODPS_PROJECT]: project,
      [ODPS_ENDPOINT]: endpoint,
    }
    await this.sendCredentials(scopeId, creds)
  }

  // ── the ctx.query seam (P4 B: execute / attach / cancel / getProgress) ────

  override async execute(request: QueryRequest, signal?: AbortSignal): Promise<QueryOutcome> {
    const spec: QuerySpec = {
      sql: normalizeForMaxCompute(request.sql),
      scopeId: request.scopeId,
      mode: request.mode ?? 'fast',
    }
    await this.pushCredentials(spec.scopeId) // per-call resolve + idempotent set_credentials
    // CostGuard (estimate_cost) / TimeoutGuard (signal) / RetryGuard / OrphanReaper
    // are the A1-split engine-wrapper guard chain — deferred; this provider is
    // the dumb raw executor. The signal is threaded straight through for the
    // prototype (production: the engine-wrapper's TimeoutGuard owns it).
    return this.callTool(TOOLS.execute, { scope_id: spec.scopeId, sql: spec.sql, mode: spec.mode }, signal)
  }

  override async attach(instanceId: InstanceId): Promise<QueryOutcome> {
    return this.callTool(TOOLS.attach, { instance_id: instanceId })
  }

  override async cancel(instanceId: InstanceId): Promise<void> {
    await this.callControl(TOOLS.cancel, { instance_id: instanceId })
  }

  override async getProgress(instanceId: InstanceId): Promise<QueryOutcome> {
    return this.callTool(TOOLS.getProgress, { instance_id: instanceId })
  }

  /**
   * Qualify a bare table name with its project prefix (C: engine-agnostic).
   *
   * P4e: the project is per-scope — resolved from the ACTIVE scope's
   * `metadata.maxcompute.project` (the prior single `defaultProject` was the
   * P4c "one config covers all scopes" assumption the P9 revision overturned).
   * A per-table `override` still wins; when the registry is unmounted or the
   * active scope has no project, the static `defaultProject` is the fallback
   * (graceful degradation so a misconfigured engine still surfaces a prefix).
   * SQL-gen callers pass no per-call scopeId, so this resolves via the active
   * scope — the same scope the semantic-layer singles out (P1: active scope
   * == the query's scope). Pure: never touches the sidecar.
   *
   * @param tableName The bare table name to qualify.
   * @param override Optional per-table project override (wins over the active scope + defaultProject).
   * @returns The qualified `<project>.<tableName>`, or the bare `tableName` when no project resolves.
   */
  override qualifyTable(tableName: string, override?: string): string {
    const project = override ?? this.activeScopeProject() ?? this.cfg.defaultProject
    return project ? `${project}.${tableName}` : tableName
  }

  /** P4e: the active scope's ODPS project (from `metadata.maxcompute.project`), or undefined when unmounted/absent. */
  private activeScopeProject(): string | undefined {
    const scope = this.scopes()?.active()
    const mc = scope?.metadata?.maxcompute as { project?: string } | undefined
    return typeof mc?.project === 'string' && mc.project !== '' ? mc.project : undefined
  }

  /**
   * CostGuard-internal (P4 B: NOT on the ctx.query seam). The future
   * engine-wrapper calls this to estimate before execute; exposed on the
   * provider, never model-facing. The orchestration (cost gate, retry) is
   * deferred to the engine-wrapper hardening.
   *
   * @param scopeId The scope whose ODPS connection/cache to bill the estimate
   * against (credentials resolved per call via `set_credentials`).
   * @param sql The MaxCompute SQL statement whose scan volume to estimate.
   * @returns A promise resolving to `{ inputBytes }` — the estimated input
   * bytes the statement would scan (0 when the sidecar's text is undecodable,
   * so the future CostGuard fail-opens).
   */
  async estimateCost(scopeId: ScopeId, sql: string): Promise<{ inputBytes: number }> {
    const raw = await this.callControl(TOOLS.estimateCost, { scope_id: scopeId, sql })
    const text = (raw.content as Array<{ text?: string }> | undefined)?.[0]?.text
    let inputBytes = 0
    if (typeof text === 'string') {
      try {
        inputBytes = (JSON.parse(text) as { input_bytes?: number }).input_bytes ?? 0
      } catch {
        // deferred CostGuard surfaces its own diagnostics
      }
    }
    return { inputBytes }
  }

  /**
   * Provider-internal diagnostic: surface the sidecar's state for scenarios.
   *
   * @returns A promise resolving to the decoded sidecar `get_state` JSON, or
   * the raw `CallToolResult` when the sidecar's text is not JSON-parseable.
   */
  async inspectSidecarState(): Promise<unknown> {
    const raw = await this.callControl(TOOLS.getState, {})
    const text = (raw.content as Array<{ text?: string }> | undefined)?.[0]?.text
    if (typeof text === 'string') {
      try {
        return JSON.parse(text)
      } catch {
        // fall through
      }
    }
    return raw
  }

  /**
   * Provider-internal diagnostic: raw sidecar call for scenarios (`_test_crash`, `invalidate_scope`, …).
   *
   * @param name The raw sidecar tool name to invoke (e.g. `invalidate_scope`, `_test_crash`).
   * @param args The arguments object forwarded to the sidecar tool (default `{}`).
   * @returns A promise resolving to the raw sidecar `tools/call` result object.
   */
  async callRaw(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.callControl(name, args)
  }

  /**
   * Provider-internal diagnostic: live/dead + re-spawn budget for scenarios.
   *
   * @returns The engine's connection-health snapshot: `dead` (sidecar down,
   * awaiting lazy re-spawn), `disposed` (provider torn down, calls reject), and
   * `crashAttempts` (consecutive re-spawn failures toward the crash-loop ceiling).
   */
  status(): { dead: boolean; disposed: boolean; crashAttempts: number } {
    return { dead: this.dead, disposed: this.disposed, crashAttempts: this.crashAttempts }
  }

  // ── dispose (G4 NEW边界(1): lifecycle hook; ODPS orphan → OrphanReaper deferred) ─

  private async dispose(): Promise<void> {
    this.disposed = true
    await this.stopSidecar() // client.close + kill; in-flight reject ConnectionClosed (SDK _onclose)
    this.ctx.logger.warn(
      'query-maxcompute: disposed; in-flight queries rejected (ConnectionClosed);'
      + ' ODPS orphan cleanup deferred to OrphanReaper (A1-split engine-wrapper)',
    )
  }
}

export default MaxComputeQueryEngine
