/**
 * HarnessAgentResponder — G1b Phase 3: drives a full Cordis agent session
 * with a specified variant preset (A/B/C/D) and extracts the final SQL +
 * declined state from the session events.
 *
 * Unlike Nl2sqlAgentResponder (which drives Nl2sqlEngine programmatically),
 * this responder boots the full agent loop machinery so the preset's
 * orchestration (phase-gate, planning tools, persona) is exercised end-to-end.
 *
 * Architecture:
 * - Boot a Cordis context with: LLM, SemanticLayer, Sessions, SystemPrompt,
 *   Tools, AgentRegistry, AgentDefaultModel, AgentLoop, Loader (with group
 *   builtin), and optionally QueryEngine.
 * - For each question: create a fresh agent via ctx.agents.create(), mount the
 *   variant preset in setup, send the question, wait for quiescence.
 * - Extract SQL from session events (tool/call → query_data) and detect decline.
 *
 * @module @deepseek-ai/dsh-eval-cli/harness-responder
 */

import { randomUUID } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as llmDashscope from '@deepseek-ai/dsh-llm-dashscope'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

import type {
  AgentResponder,
  AgentRespondOpts,
  AgentResponse,
} from '@deepseek-ai/dsh-eval-runner'

// ─── Variant Mapping ───────────────────────────────────────────────────────────

/** G1b experiment variants. */
export type Variant = 'A' | 'B' | 'C' | 'D'

/** Maps variant letter to its composition file name within the data-agent preset directory. */
const VARIANT_FILES: Record<Variant, string> = {
  A: 'agent.cordis.yml',
  B: 'b-free-react-planning.cordis.yml',
  C: 'c-hybrid.cordis.yml',
  D: 'd-bare-react.cordis.yml',
}

// ─── Budget / Timeout Constants (G1 Protocol) ──────────────────────────────────

/** Single case wall-clock timeout in ms (5 minutes). */
const CASE_TIMEOUT_MS = 5 * 60 * 1000

// ─── Decline Detection ─────────────────────────────────────────────────────────

/** Phase-gate's INCOMPLETE marker (A/C variants). */
const INCOMPLETE_MARKER = '【incomplete】'

/** Prose decline patterns for B/D variants (no phase-gate). */
const PROSE_DECLINE_PATTERNS = [
  /无法回答/,
  /cannot answer/i,
  /unable to answer/i,
  /无法提供/,
  /不具备.*数据/,
  /没有.*相关.*数据/,
  /cannot be answered/i,
  /I cannot/i,
  /cannot fulfill/i,
  /没有找到.*相关/,
  /无法确定/,
  /无法查询/,
  /不支持/,
]

/**
 * Detect whether the agent's response represents a decline.
 * - A/C: use phase-gate's INCOMPLETE_MARKER or route:decline token
 * - B/D: detect prose decline in the final assistant text
 */
function detectDecline(variant: Variant, finalText: string, events: readonly SessionEvent[]): boolean {
  if (variant === 'A' || variant === 'C') {
    // Phase-gate variants: check for INCOMPLETE marker in any assistant message
    if (finalText.includes(INCOMPLETE_MARKER)) return true
    if (finalText.includes('【route:decline】')) return true
    // Check all session events for the markers
    for (const event of events) {
      if (event.type === 'assistant/message') {
        const msg = event.data as { message?: { content?: Array<{ type: string; text?: string }> } }
        const text = msg.message?.content
          ?.filter((b: { type: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text ?? '')
          .join('') ?? ''
        if (text.includes(INCOMPLETE_MARKER) || text.includes('【route:decline】')) return true
      }
    }
    return false
  }
  // B/D: prose decline detection
  for (const pattern of PROSE_DECLINE_PATTERNS) {
    if (pattern.test(finalText)) return true
  }
  return false
}

// ─── SQL Extraction ────────────────────────────────────────────────────────────

/**
 * Extract the last SQL passed to `query_data` from session events.
 * The agent calls `query_data({ sql: "..." })` during EXECUTION phase.
 */
function extractSqlFromEvents(events: readonly SessionEvent[]): string | null {
  let lastSql: string | null = null
  for (const event of events) {
    if (event.type === 'tool/call') {
      const data = event.data as { name?: string; arguments?: string }
      if (data.name === 'query_data') {
        try {
          const args = JSON.parse(data.arguments ?? '{}') as { sql?: string }
          if (args.sql) lastSql = args.sql
        } catch {
          // malformed arguments; skip
        }
      }
    }
  }
  return lastSql
}

/**
 * Extract the final assistant text from session events.
 */
function extractFinalText(events: readonly SessionEvent[]): string {
  let lastText = ''
  for (const event of events) {
    if (event.type === 'assistant/message') {
      const data = event.data as { message?: { content?: Array<{ type: string; text?: string }> } }
      const text = data.message?.content
        ?.filter((b: { type: string }) => b.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('') ?? ''
      if (text.length > 0) lastText = text
    }
  }
  return lastText
}

// ─── Boot Options ──────────────────────────────────────────────────────────────

export interface HarnessBootOptions {
  /** Path to the semantic layer directory. */
  readonly schemaDir: string
  /** LLM provider name (default: 'aga'). */
  readonly provider: string
  /** LLM model name (default: 'qwen3.7-max'). */
  readonly model: string
  /** G1b variant: A | B | C | D. */
  readonly variant: Variant
  /** Path to the preset directory (default: auto-resolved from repo). */
  readonly presetDir?: string
  /** Whether to mount the query engine for real SQL execution. */
  readonly withQuery?: boolean
  /** Path to the MaxCompute sidecar. */
  readonly sidecarPath?: string
  /** Reference date (YYYYMMDD). */
  readonly today?: string
  /**
   * Explicit scopeId for SemanticLayerService (D3ii: no default pointer).
   * bootContext() throws when this is undefined rather than silently falling
   * back to a hardcoded 'k11'. Optional on the type so direct constructors
   * fail-loud at bootContext instead of at the type boundary, but the runtime
   * contract is: must be provided (main.ts passes args.scopeId).
   */
  readonly scopeId?: string
}

// ─── HarnessAgentResponder ─────────────────────────────────────────────────────

/**
 * Drives a full Cordis agent session per eval question, using the specified
 * variant preset (A/B/C/D) for orchestration.
 *
 * Boot sequence:
 * 1. Cordis Context with: LlmRuntime, llm-dashscope, SemanticLayer, SessionStore,
 *    SystemPrompt, ToolRuntime, AgentRegistry, AgentDefaultModel, AgentLoop, Loader.
 * 2. For each question: create a fresh agent+session via agents.create(), mount the
 *    variant preset into the agent's scope (via mountPreset), send user message,
 *    await quiescence with 5-minute timeout.
 * 3. Extract SQL from tool/call events (query_data), detect decline, return AgentResponse.
 */
export class HarnessAgentResponder implements AgentResponder {
  private ctx: Context | null = null
  private bootPromise: Promise<Context> | null = null
  private readonly opts: HarnessBootOptions
  private readonly presetPath: string

  constructor(opts: HarnessBootOptions) {
    this.opts = opts
    const presetDir = opts.presetDir ?? this.resolvePresetDir()
    const variantFile = VARIANT_FILES[opts.variant]
    this.presetPath = join(presetDir, variantFile)
    if (!existsSync(this.presetPath)) {
      throw new Error(
        `HarnessAgentResponder: variant ${opts.variant} composition not found at ${this.presetPath}`,
      )
    }
    console.log(`  [HarnessAgentResponder] variant=${opts.variant} preset=${this.presetPath}`)
  }

  private resolvePresetDir(): string {
    // Resolve relative to this file → repo root → apps/cli/config/agent-presets/data-agent
    let dir = dirname(new URL(import.meta.url).pathname)
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'apps/cli/config/agent-presets/data-agent')
      if (existsSync(candidate)) return candidate
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // Try CWD
    const cwdCandidate = resolve('apps/cli/config/agent-presets/data-agent')
    if (existsSync(cwdCandidate)) return cwdCandidate
    throw new Error(
      'HarnessAgentResponder: cannot resolve preset directory. '
      + 'Pass presetDir explicitly or run from the repo root.',
    )
  }

  /** Boot the Cordis context (lazy, singleton). */
  private async ensureContext(): Promise<Context> {
    if (this.ctx !== null) return this.ctx
    if (this.bootPromise !== null) return this.bootPromise
    this.bootPromise = this.bootContext()
    this.ctx = await this.bootPromise
    return this.ctx
  }

  /**
   * Build the SemanticLayerService config (D3ii: explicit scopeId, no default
   * pointer). Throws when scopeId is absent rather than silently falling back
   * to a hardcoded 'k11'. Called by bootContext() before any plugin mount, so
   * the fail-loud is fast (no ctx created, no side effects).
   *
   * Exposed as protected so the D3ii propagation test can assert scopeId flows
   * into the SemanticLayerService config WITHOUT booting the full context —
   * the in-process boot mounts ~15 plugins and requires the test-invariants
   * companion (src/invariant.ts) that eval-cli lacks (same constraint as
   * scope-id.spec.ts for context.ts boot()).
   */
  protected semanticLayerConfig(): { semanticRoot: string; scopeId: string } {
    if (this.opts.scopeId === undefined) {
      throw new Error('harness-responder bootContext: explicit scopeId required (D3ii)')
    }
    return { semanticRoot: this.opts.schemaDir, scopeId: this.opts.scopeId }
  }

  private async bootContext(): Promise<Context> {
    // D3ii: build the SemanticLayer config up front — semanticLayerConfig()
    // throws (no default pointer) when scopeId is absent, before any plugin
    // mount, so this is a fast fail-loud. The seam is also the D3ii
    // propagation test surface (see harness-responder.spec.ts).
    const schemaConfig = this.semanticLayerConfig()
    const ctx = new Context()

    // ── 1. Loader (needed for preset mounting via Include/EntryTree) ────────
    const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
    const { default: Group } = await import('@deepseek-ai/cordis-plugin-group')
    // Set baseUrl to repo root so package specifiers resolve correctly
    const repoRoot = this.resolveRepoRoot()
    ctx.baseUrl = pathToFileURL(repoRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.group = Group

    // ── 2. LlmRuntime → ctx.llm ────────────────────────────────────────────
    await ctx.plugin(LlmRuntime)

    // ── 3. llm-dashscope → registers 'aga' provider on ctx.llm ─────────────
    await ctx.plugin(llmDashscope)

    // ── 4. SemanticLayer → ctx.schema ───────────────────────────────────────
    await ctx.plugin(SemanticLayerService, schemaConfig)

    // ── 5. SessionStore → ctx.sessions ──────────────────────────────────────
    const { default: SessionStore } = await import('@deepseek-ai/dsh-session')
    await ctx.plugin(SessionStore)

    // ── 6. SystemPrompt → ctx.systemPrompt ──────────────────────────────────
    const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt')
    await ctx.plugin(SystemPrompt)

    // ── 7. ToolRuntime → ctx.tools ──────────────────────────────────────────
    const { default: ToolRuntime } = await import('@deepseek-ai/dsh-tools')
    await ctx.plugin(ToolRuntime, { mode: 'native' })

    // ── 8. AgentRegistry → ctx.agents ───────────────────────────────────────
    const { default: AgentRegistry } = await import('@deepseek-ai/dsh-agent')
    await ctx.plugin(AgentRegistry)

    // ── 9. AgentDefaultModel → ctx.agentDefaultModel ────────────────────────
    const { default: AgentDefaultModel } = await import('@deepseek-ai/dsh-agent-default-model')
    await ctx.plugin(AgentDefaultModel, {
      provider: this.opts.provider,
      model: this.opts.model,
    })

    // ── 10. AgentLoop → ctx.agentLoop (sets factory on ctx.agents) ──────────
    const { default: AgentLoop } = await import('@deepseek-ai/dsh-agent-loop')
    await ctx.plugin(AgentLoop, { agents: [] })

    // ── 11. Identity → ctx.identity (stub; returns undefined — T1 fallback) ─
    const { default: IdentityService } = await import('@deepseek-ai/dsh-identity')
    await ctx.plugin(IdentityService)

    // ── 12. Audit → ctx.audit (tool-update-table-config requires it) ────────
    const { default: Audit } = await import('@deepseek-ai/dsh-audit')
    const { tmpdir } = await import('node:os')
    const auditPath = join(tmpdir(), `dsh-eval-audit-${randomUUID()}.db`)
    await ctx.plugin(Audit, { path: auditPath })

    // ── 13. ResultCacheMemory → ctx.resultCache (tool-compute requires it) ──
    const resultCacheMemory = await import('@deepseek-ai/dsh-result-cache-memory')
    await ctx.plugin(resultCacheMemory)

    // ── 14. CodeRuntimeWorkerThread → ctx.codeRuntime (tool-compute needs it)
    const { default: WorkerThreadCodeRuntime } = await import('@deepseek-ai/dsh-code-runtime-worker-thread')
    await ctx.plugin(WorkerThreadCodeRuntime)

    // ── 15. SessionProjectionRegistry → ctx.sessionProjections (goal/todo need it)
    const { default: SessionProjectionRegistry } = await import('@deepseek-ai/dsh-session-projection')
    await ctx.plugin(SessionProjectionRegistry)

    // ── 16. GoalService → ctx.goals (tool-goal in B/C needs it) ─────────────
    const { default: GoalService } = await import('@deepseek-ai/dsh-goal')
    await ctx.plugin(GoalService)

    // ── 17. Query engine (optional) ──────────────────────────────────────────
    if (this.opts.withQuery) {
      try {
        const { MaxComputeQueryEngine } = await import('@deepseek-ai/dsh-query-maxcompute')
        const defaultSidecar = join(
          this.resolveRepoRoot(),
          'packages/query/query-maxcompute/dev/standin-sidecar.mjs',
        )
        await ctx.plugin(MaxComputeQueryEngine, {
          sidecarPath: this.opts.sidecarPath ?? defaultSidecar,
          credMode: 'sidecar-self',
          maxcConfigPath: process.env.MAXC_CONFIG
            ?? resolve(process.env.HOME ?? '~', '.maxc/config.yaml'),
          defaultProject: 'ieu_cdm',
          toolCallTimeoutMs: 300_000,
        })
        console.log('  [HarnessAgentResponder] Query engine mounted')
      } catch (err) {
        console.warn(`  [HarnessAgentResponder] Query engine failed to mount: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log('  [HarnessAgentResponder] Context booted successfully')
    return ctx
  }

  private resolveRepoRoot(): string {
    let dir = dirname(new URL(import.meta.url).pathname)
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'packages')) && existsSync(join(dir, 'apps'))) return dir
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // fallback to cwd-based search
    let cwd = resolve('.')
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(cwd, 'packages')) && existsSync(join(cwd, 'apps'))) return cwd
      const parent = dirname(cwd)
      if (parent === cwd) break
      cwd = parent
    }
    return resolve('.')
  }

  /**
   * Send a question to a fresh agent session and wait for quiescence.
   * Returns the agent's response including generated SQL and decline status.
   */
  async respond(question: string, _opts?: AgentRespondOpts): Promise<AgentResponse> {
    const ctx = await this.ensureContext()
    const sessionId = SessionId(`eval-harness-${randomUUID()}`)
    const presetPath = this.presetPath
    const variant = this.opts.variant

    console.error(`[HarnessAgentResponder] case start: "${question.slice(0, 80)}..."`)

    // Create agent with variant preset mounted in setup
    const handle = await ctx.agents.create({
      sessionId,
      meta: { cwd: process.cwd() },
      agentOptions: {
        provider: this.opts.provider,
        model: this.opts.model,
      },
      setup: async (agentCtx: Context) => {
        // Mount the variant preset into this agent's scope
        const { mountPreset } = await import('@deepseek-ai/dsh-agent-presets')
        await mountPreset(agentCtx, {
          id: `data-agent-${variant.toLowerCase()}`,
          trust: 'system' as const,
          path: presetPath,
        })
      },
    })

    try {
      // Wait for agent to reach idle (setup complete)
      await handle.agent.whenIdle()

      // Send the eval question
      const userMsg = createUserMessage({
        content: [{ type: 'text', text: question }],
        source: { kind: 'user' },
      })
      handle.agent.followup(userMsg)

      // Wait for quiescence with timeout
      await this.raceTimeout(
        handle.agent.whenIdle(),
        CASE_TIMEOUT_MS,
        `case timeout (${CASE_TIMEOUT_MS / 1000}s)`,
      )

      // Extract results from session events
      const events = handle.agent.session.events as readonly SessionEvent[]
      const finalText = extractFinalText(events)
      const generatedSql = extractSqlFromEvents(events)
      const declined = detectDecline(variant, finalText, events)

      console.error(`[HarnessAgentResponder] case done: sql=${generatedSql ? 'yes' : 'no'} declined=${declined}`)

      return {
        reply: declined ? `Declined: ${finalText.slice(0, 500)}` : finalText,
        // Always return the generated SQL (even on decline) so the eval runner
        // can still judge SQL quality via the semantic judge. The decline signal
        // is carried via the reply prefix; the runner's verdict_mapper treats
        // presence of generated_sql as "the agent attempted SQL generation".
        generated_sql: generatedSql,
        transcript: events as unknown as unknown[],
      }
    } catch (err) {
      console.error(`[HarnessAgentResponder] case error: ${err instanceof Error ? err.message : String(err)}`)
      // On timeout or error, still try to extract what we can
      const events = handle.agent.session.events as readonly SessionEvent[]
      const generatedSql = extractSqlFromEvents(events)
      return {
        reply: `Error: ${err instanceof Error ? err.message : String(err)}`,
        generated_sql: generatedSql,
        transcript: events as unknown as unknown[],
      }
    } finally {
      // Dispose the agent to free resources
      await handle.dispose()
    }
  }

  /** Race a promise against a timeout. */
  private async raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`HarnessAgentResponder: ${message}`)), ms)
    })
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}
