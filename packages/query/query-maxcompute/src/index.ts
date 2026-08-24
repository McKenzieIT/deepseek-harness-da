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
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { InstanceId, QueryOutcome, QueryRequest, QuerySpec, ScopeId } from '@deepseek-ai/dsh-query/src/index.ts'

/**
 * ODPS credential references resolved per call. PAT-not-in-process.env: the
 * sidecar is spawned scrubbed and creds are pushed per call via the
 * `set_credentials` control tool — never the spawn env (R6 (b) + G4 HOLE-C).
 */
const ODPS_REFS: readonly CredentialRef[] = [
  credentialRef('ODPS_ACCESS_ID'),
  credentialRef('ODPS_ACCESS_KEY'),
  credentialRef('ODPS_PROJECT'),
  credentialRef('ODPS_ENDPOINT'),
]

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

/**
 * Permissive tools/call result schema (mirror mcp-client `tools.ts`): the
 * sidecar returns a string-keyed object; this bridge owns JSON-value
 * decoding after transport. A strict SDK `CallToolResultSchema` would do as
 * well, but permissive keeps the stand-in sidecar's exact framing
 * non-load-bearing.
 */
const RawCallToolResultSchema = zod.record(zod.string(), zod.unknown())

/** Plugin config (all optional except `args` — `static Config` supplies defaults). */
export interface Config {
  /** Sidecar executable (default: the node binary; production: `python`). */
  command?: string
  /** Sidecar args — the sidecar script path plus its args. Required. */
  args: string[]
  /** Sidecar spawn cwd (default: process.cwd()). */
  cwd?: string
  /** Per tools/call timeout in ms; the SDK sends notifications/cancelled + rejects. */
  toolCallTimeoutMs?: number
  /** Max consecutive re-spawn attempts before the crash-loop gives up (G4 Q1). */
  crashLoopMaxAttempts?: number
  /**
   * Credential flow for the sidecar (P4d). `'push'` (default): the da resolves
   * the 4 ODPS refs per call and pushes them via `set_credentials`
   * (PAT-not-in-env). `'sidecar-self'`: the maxc-backed sidecar self-auths
   * from its own config (P4c: `set_credentials` → no-op, da pushes no ODPS
   * creds) — `pushCredentials` is a no-op and `execute` proceeds straight to
   * the sidecar. `static inject = ['credentials']` is unchanged.
   */
  credMode?: 'push' | 'sidecar-self'
  /**
   * Default ODPS project for table-name qualification (C: engine-agnostic).
   * The single source of truth for the project prefix — supersedes the
   * misread `config.yaml project.name` (a game scope id, NOT an ODPS
   * project). cordis.patch.yml fills `ieu_cdm`. When empty, `qualifyTable`
   * returns the bare table name (graceful degradation).
   */
  defaultProject?: string
}

/** Resolved config shape: schemastery has applied every default. */
type ResolvedConfig = Required<Config>

export const Config: z<Config> = z.object({
  command: z.string().default(process.execPath),
  args: z.array(z.string()),
  cwd: z.string().default(process.cwd()),
  toolCallTimeoutMs: z.number().min(0).default(60_000),
  crashLoopMaxAttempts: z.number().min(0).default(5),
  credMode: z.union(['push', 'sidecar-self'] as const).default('push'),
  // C: default '' so a config that omits defaultProject degrades to bare
  // table names in qualifyTable (no `undefined.` prefix) — engine-agnostic.
  defaultProject: z.string().default(''),
})

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
    // Spawn scrubbed: NO creds in spawn env (PAT not in process.env; intranet-security-first).
    this.transport = new StdioClientTransport({
      command: this.cfg.command,
      args: this.cfg.args,
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
      this.dead = true
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
      return this.client
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
  }

  private async stopSidecar(): Promise<void> {
    const client = this.client
    this.client = undefined
    this.transport = undefined
    if (client !== undefined) {
      try {
        // stdio close(): stdin.end → 2s → SIGTERM → 2s → SIGKILL (G4 NEW边界(5)).
        await client.close()
      } catch {
        // best-effort: the sidecar may already be dead
      }
    }
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
   */
  private decodeResult(result: Record<string, unknown>, tool: string): QueryOutcome {
    const content = result.content
    const text = Array.isArray(content) ? (content[0] as { text?: string } | undefined)?.text : undefined
    if (result.isError === true) {
      return { state: 'failed', error: typeof text === 'string' ? text : `${tool} returned isError`, failureKind: 'remote', sql: '' }
    }
    if (typeof text === 'string') {
      try {
        return JSON.parse(text) as QueryOutcome
      } catch {
        // fall through to failure
      }
    }
    return { state: 'failed', error: `undecodable ${tool} result`, failureKind: 'transport', sql: '' }
  }

  // ── per-call cred resolve + idempotent set_credentials (D3, G4 HOLE-C drop) ─

  private async pushCredentials(scopeId: ScopeId): Promise<void> {
    // P4d: a maxc-backed sidecar self-auths from its own config (P4c:
    // set_credentials → no-op; da pushes no ODPS creds). Skip the per-call
    // resolve+push entirely — no ctx.credentials.resolve, no throw, no
    // set_credentials call — so execute proceeds straight to the sidecar.
    if (this.cfg.credMode === 'sidecar-self') return
    const creds: Record<string, string> = {}
    for (const ref of ODPS_REFS) {
      const resolved = await this.ctx.credentials.resolve(ref)
      if (resolved === undefined) {
        // A missing ODPS cred is a misconfiguration — PAT-not-in-env means it
        // must come via the credentials seam. Fail fast rather than silently
        // shrinking the sidecar's stored set and dropping the connection cache.
        throw new Error(`query-maxcompute: missing ODPS credential "${ref}" for scope "${scopeId}"; provision it via the credentials seam`)
      }
      creds[ref] = resolved.value
    }
    // Idempotent on the sidecar: unchanged → no-op (preserve the per-scope
    // connection cache + reuse); changed → store new + drop that scope's
    // connection cache (mirror reverse-bi invalidate_credential). In-flight
    // queries hold their old ScopeConnection to completion (G4 HOLE-C drop).
    await this.callControl(TOOLS.setCredentials, { scope_id: scopeId, creds })
  }

  // ── the ctx.query seam (P4 B: execute / attach / cancel / getProgress) ────

  override async execute(request: QueryRequest, signal?: AbortSignal): Promise<QueryOutcome> {
    const spec: QuerySpec = {
      sql: request.sql,
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
   * Resolution: `override` (per-table, Task 3) → `Config.defaultProject`
   * (cordis.patch.yml fills `ieu_cdm`) → bare table name. Supersedes the
   * SemanticLayerService.qualifyTableName path (which misread `config.yaml
   * project.name` — a game scope id). Pure: never touches the sidecar.
   *
   * @param tableName The bare table name to qualify.
   * @param override Optional per-table project override (wins over defaultProject).
   * @returns The qualified `<project>.<tableName>`, or the bare `tableName`
   * when no project resolves (empty default + no override).
   */
  override qualifyTable(tableName: string, override?: string): string {
    const project = override ?? this.cfg.defaultProject
    return project ? `${project}.${tableName}` : tableName
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
        inputBytes = Number((JSON.parse(text) as { input_bytes?: number }).input_bytes ?? 0)
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
