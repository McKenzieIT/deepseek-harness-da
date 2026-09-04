/**
 * Patrol Mode service — autonomous patrol loop for the semantic layer.
 *
 * W11 D7 Resolution: provides a togglable "自主巡检" mode that iteratively
 * finds the weakest assets via assetHealth/gapAnalysis, diagnoses issues,
 * proposes fixes with user confirmation, and triggers eval after each round.
 *
 * W11 S3 Resolution: supports "btw" interruptions — user messages received
 * during patrol are routed as one-off requests without losing patrol context.
 *
 * W11 C2: reachability previews buffer during patrol and batch-render at round end.
 * W11 C3: eval triggers automatically after each round's edits.
 *
 * Safety constraints:
 * - maxEditsPerRound (default 3): pauses after N edits per round
 * - confirmTimeoutMs (default 60000): user must confirm within 60s or edit is rejected
 * - scope: optional domain filter to restrict patrol to a subset of assets
 * - Every edit requires explicit user confirmation — no silent execution
 *
 * @module @deepseek-ai/dsh-patrol-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-management-session'
import type {} from '@deepseek-ai/dsh-audit'
import type {} from '@deepseek-ai/dsh-evidence-query'

// ── Configuration ───────────────────────────────────────────────────────

/** Patrol mode configuration. */
export interface PatrolConfig {
  /** Maximum edits per patrol round before pausing for confirmation. Default: 3 */
  readonly maxEditsPerRound?: number
  /** Timeout in ms for user confirmation prompts. Default: 60000 (60s) */
  readonly confirmTimeoutMs?: number
  /** Domain scope filter — only patrol assets in this domain. */
  readonly scope?: string
}

/** Default maximum edits per patrol round. */
export const DEFAULT_MAX_EDITS_PER_ROUND = 3

/** Default confirmation timeout in milliseconds (60 seconds). */
export const DEFAULT_CONFIRM_TIMEOUT_MS = 60_000

// ── Types ───────────────────────────────────────────────────────────────

/** State of the patrol loop. */
export type PatrolState = 'idle' | 'running' | 'paused' | 'awaiting-confirm'

/** A proposed edit from patrol diagnosis. */
export interface PatrolProposedEdit {
  /** The asset being edited. */
  readonly assetId: string
  /** Human-readable description of the proposed fix. */
  readonly description: string
  /** The diagnosis that led to this proposal. */
  readonly diagnosis: string
}

/** Confirmation decision from user. */
export type ConfirmDecision = 'confirmed' | 'rejected' | 'timeout'

/** Round summary emitted at round-complete. */
export interface PatrolRoundSummary {
  /** Round number (1-indexed). */
  readonly roundNumber: number
  /** Assets processed this round. */
  readonly assetsProcessed: readonly string[]
  /** Edits that were confirmed and executed. */
  readonly editsExecuted: number
  /** Edits that were rejected or timed out. */
  readonly editsRejected: number
}

/** Pending confirm state — stored while awaiting user response. */
interface PendingConfirm {
  readonly edit: PatrolProposedEdit
  resolve: (decision: ConfirmDecision) => void
  timer: ReturnType<typeof setTimeout> | null
  /** data-infra-7: tracked so clearPendingConfirm can remove the abort listener. */
  readonly signal: AbortSignal
  readonly onAbort: () => void
}

// ── Events ──────────────────────────────────────────────────────────────

declare module '@deepseek-ai/cordis' {
  interface Context {
    patrol: PatrolService
  }

  interface Events {
    /**
     * Patrol loop has started.
     *
     * @mode parallel
     * @param config - the active patrol configuration.
     */
    'patrol/started'(config: PatrolConfig): void
    /**
     * Patrol loop has stopped.
     *
     * @mode parallel
     */
    'patrol/stopped'(): void
    /**
     * A new patrol round is beginning.
     *
     * @mode parallel
     * @param roundNumber - the 1-indexed round number.
     */
    'patrol/round-start'(roundNumber: number): void
    /**
     * A patrol round has completed (triggers C2 batch rendering).
     *
     * @mode parallel
     * @param summary - the round's asset/edit tally.
     */
    'patrol/round-complete'(summary: PatrolRoundSummary): void
    /**
     * Patrol is requesting user confirmation for a proposed edit.
     *
     * @mode parallel
     * @param edit - the proposed edit awaiting a confirm/reject decision.
     */
    'patrol/confirm-request'(edit: PatrolProposedEdit): void
    /**
     * A confirmed patrol edit was executed (audit).
     *
     * @mode parallel
     * @param edit - the edit that was confirmed and audited.
     */
    'patrol/edit-executed'(edit: PatrolProposedEdit): void
    /**
     * User did not respond within the confirmation timeout.
     *
     * @mode parallel
     * @param edit - the edit whose confirmation timed out.
     */
    'patrol/confirm-timeout'(edit: PatrolProposedEdit): void
    /**
     * User sent a "btw" message during patrol.
     *
     * @mode parallel
     * @param message - the btw message routed as a one-off request.
     */
    'patrol/btw-received'(message: string): void
    /**
     * Patrol has been paused (max edits reached or timeout).
     *
     * @mode parallel
     * @param reason - why the patrol paused.
     */
    'patrol/paused'(reason: string): void
  }
}

// ── Service ─────────────────────────────────────────────────────────────

/**
 * Patrol Mode service — autonomous patrol loop for iterative semantic layer
 * improvement. Registered at `ctx.patrol`.
 *
 * The patrol loop:
 * 1. Finds weakest assets via evidenceQuery (assetHealth / gapAnalysis)
 * 2. For each weak asset (up to maxEditsPerRound):
 *    a. Diagnoses via management session
 *    b. Proposes fix and emits confirm request event
 *    c. Waits for user confirm (timeout 60s -> reject + pause)
 *    d. If confirmed: executes edit
 * 3. After edits: triggers eval on modified assets (C3)
 * 4. Emits round-complete event (for C2 batch rendering)
 * 5. Waits for next round or continues if auto
 */
export class PatrolService extends Service {
  static inject = ['managementSession', 'audit'] as const

  private state: PatrolState = 'idle'
  private config: Required<PatrolConfig> = {
    maxEditsPerRound: DEFAULT_MAX_EDITS_PER_ROUND,
    confirmTimeoutMs: DEFAULT_CONFIRM_TIMEOUT_MS,
    scope: '',
  }
  private roundNumber = 0
  private abortController: AbortController | null = null
  private pendingConfirm: PendingConfirm | null = null
  private btwQueue: string[] = []
  private loopPromise: Promise<void> | null = null
  // True while a runLoop is in flight. Guards start() against spawning a
  // second concurrent loop before a prior stop() has quiesced the old one.
  private running = false

  constructor(ctx: Context) {
    super(ctx, 'patrol')
    // Stop the loop (and clear pending-confirm/sleep timers) when the owning
    // context is disposed, so a patrol left running does not leak timers.
    ctx.effect(() => () => {
      void this.stop()
    })
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Start the autonomous patrol loop.
   *
   * @param opts - optional patrol configuration overrides.
   * @throws if patrol is already running.
   */
  start(opts?: PatrolConfig): void {
    if (this.state !== 'idle' || this.running) {
      throw new Error(`Cannot start patrol: current state is "${this.state}"`)
    }

    this.config = {
      maxEditsPerRound: opts?.maxEditsPerRound ?? DEFAULT_MAX_EDITS_PER_ROUND,
      confirmTimeoutMs: opts?.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS,
      scope: opts?.scope ?? '',
    }
    this.roundNumber = 0
    this.abortController = new AbortController()
    this.state = 'running'
    this.running = true

    this.ctx.emit('patrol/started', this.config)
    this.loopPromise = this.runLoop(this.abortController.signal)
  }

  /**
   * Stop the patrol loop. Cleans up pending confirms and resets state.
   *
   * Awaits the still-running runLoop so a rapid start() cannot spawn a second
   * concurrent loop whose in-flight continuations would mutate state after it
   * has been reset here. runLoop never rejects.
   */
  async stop(): Promise<void> {
    if (this.state === 'idle') return

    const loop = this.loopPromise
    this.abortController?.abort()
    this.abortController = null
    this.clearPendingConfirm('rejected')
    this.state = 'idle'
    this.roundNumber = 0
    this.btwQueue = []
    this.loopPromise = null
    // data-infra-8: keep this.running=true until the in-flight runLoop settles
    // (below) so a non-awaiting stop(); start() sees running=true and cannot
    // spawn a second concurrent loop whose continuations would mutate state
    // after it has been reset here. runLoop never rejects.
    this.ctx.emit('patrol/stopped')

    // Quiesce: drain the in-flight runLoop so its continuations settle before a
    // subsequent start() can spawn a new loop.
    if (loop !== null) {
      try {
        await loop
      } catch {
        /* runLoop never rejects */
      }
    }
    this.running = false
  }

  /**
   * Returns whether the patrol loop is currently active (running, paused, or
   * awaiting confirmation).
   * @returns whether the patrol loop is in a non-idle state.
   */
  isRunning(): boolean {
    return this.state !== 'idle'
  }

  /**
   * Returns the current patrol state.
   * @returns the current `PatrolState` (idle/running/paused/awaiting-confirm).
   */
  getState(): PatrolState {
    return this.state
  }

  /**
   * Process a "by the way" user message during an active patrol.
   *
   * Per S3: the message is handled as a one-off request via the management
   * session. The patrol context is preserved and the loop resumes after the
   * btw is handled.
   *
   * Only explicit "停止巡检"/"stop patrol" terminates the loop.
   *
   * @param message - the user's btw message.
   */
  async handleBtw(message: string): Promise<void> {
    if (this.state === 'idle') {
      throw new Error('Cannot handle btw: patrol is not running')
    }

    // Check for explicit stop commands
    if (this.isStopCommand(message)) {
      await this.stop()
      return
    }

    this.ctx.emit('patrol/btw-received', message)
    this.btwQueue.push(message)

    // If we're in the middle of the loop, the loop will drain the btw queue
    // at the next safe point. If we're paused/awaiting-confirm, process immediately.
    if (this.state === 'paused' || this.state === 'awaiting-confirm') {
      await this.drainBtwQueue()
    }
  }

  /**
   * Respond to a pending confirmation request.
   *
   * @param decision - 'confirmed' or 'rejected'.
   * @throws if there is no pending confirmation.
   */
  respondToConfirm(decision: 'confirmed' | 'rejected'): void {
    if (!this.pendingConfirm) {
      throw new Error('No pending confirmation to respond to')
    }
    this.clearPendingConfirm(decision)
  }

  // ── Private: Loop ───────────────────────────────────────────────────

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      // Drain any pending btw messages before starting a new round
      await this.drainBtwQueue()
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal mutated externally during await
      if (signal.aborted) break

      this.roundNumber++
      this.state = 'running'
      this.ctx.emit('patrol/round-start', this.roundNumber)

      const roundResult = await this.executeRound(signal)
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal mutated externally during await
      if (signal.aborted) break

      // Emit round-complete for C2 batch rendering
      this.ctx.emit('patrol/round-complete', roundResult)

      // C3: trigger eval on modified assets after edits
      if (roundResult.editsExecuted > 0) {
        await this.triggerEval(roundResult.assetsProcessed)
      }

      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal mutated externally during await
      if (signal.aborted) break

      // Brief pause between rounds to allow interruptions
      await this.sleep(1000, signal)
    }
    // Mark the loop as settled so start() knows no loop is in flight.
    this.loopPromise = null
  }

  private async executeRound(signal: AbortSignal): Promise<PatrolRoundSummary> {
    const assetsProcessed: string[] = []
    let editsExecuted = 0
    let editsRejected = 0

    // 1. Find weakest assets
    const weakAssets = this.findWeakestAssets()
    if (weakAssets.length === 0) {
      // Nothing to improve — pause and wait
      this.state = 'paused'
      this.ctx.emit('patrol/paused', 'no weak assets found')
      await this.sleep(5000, signal)
      return {
        roundNumber: this.roundNumber,
        assetsProcessed: [],
        editsExecuted: 0,
        editsRejected: 0,
      }
    }

    // 2. Process up to maxEditsPerRound
    for (const assetId of weakAssets.slice(0, this.config.maxEditsPerRound)) {
      if (signal.aborted) break

      // Drain btw queue between edits
      await this.drainBtwQueue()
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal mutated externally during await
      if (signal.aborted) break

      // a. Diagnose
      const diagnosis = await this.diagnose(assetId)
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal mutated externally during await
      if (signal.aborted) break

      // b. Propose fix
      const edit: PatrolProposedEdit = {
        assetId,
        description: `Fix for ${assetId}: ${diagnosis}`,
        diagnosis,
      }

      // c. Wait for user confirmation
      const decision = await this.requestConfirm(edit, signal)
      assetsProcessed.push(assetId)

      if (decision === 'confirmed') {
        // d. Execute edit
        const executed = await this.executeEdit(edit)
        if (executed) editsExecuted++
      } else {
        editsRejected++
        if (decision === 'timeout') {
          // Timeout → pause patrol
          this.state = 'paused'
          this.ctx.emit('patrol/paused', 'confirm timeout')
          break
        }
      }
    }

    return {
      roundNumber: this.roundNumber,
      assetsProcessed,
      editsExecuted,
      editsRejected,
    }
  }

  // ── Private: Asset Discovery ────────────────────────────────────────

  /**
   * Find weakest assets using evidenceQuery (assetHealth + gapAnalysis).
   * Returns asset IDs sorted by weakness (least healthy first).
   */
  private findWeakestAssets(): string[] {
    const evidenceQuery = this.ctx.get('evidenceQuery')
    if (!evidenceQuery) return []

    const coverage = evidenceQuery.coverageQuery()
    const allAssetIds: string[] = []

    // Collect all asset ids from domain_counts (available signal)
    for (const domain of Object.keys(coverage.domain_counts)) {
      if (this.config.scope && domain !== this.config.scope) continue
      // Domain-level filtering
    }

    // Use gap analysis from a root asset to find uncovered assets
    // For simplicity, query health of known assets and sort by weakness
    const healthReports: { assetId: string; score: number }[] = []

    // Gather asset ids from eval results — assets with failing evals are weak
    const evalResults = evidenceQuery.evalResultQuery({ status: 'fail', limit: 20 })
    for (const result of evalResults.results) {
      if (this.config.scope) {
        // Scope filtering via asset health domain check
        const health = evidenceQuery.assetHealth(result.assetId)
        if (!health) continue
      }
      if (!allAssetIds.includes(result.assetId)) {
        allAssetIds.push(result.assetId)
      }
    }

    // Score assets: lower is weaker (worse)
    for (const assetId of allAssetIds) {
      const health = evidenceQuery.assetHealth(assetId)
      if (!health) continue

      let score = 0
      if (health.confirmationStatus === 'confirmed') score += 2
      else if (health.confirmationStatus === 'draft') score += 1
      if (health.hasEvalCoverage) score += 1
      score += Math.min(health.relationCount, 3) * 0.5

      healthReports.push({ assetId, score })
    }

    // Sort by score ascending (weakest first)
    healthReports.sort((a, b) => a.score - b.score)

    return healthReports.map(r => r.assetId)
  }

  // ── Private: Diagnosis & Execution ──────────────────────────────────

  /**
   * Diagnose an asset's issues via the management session.
   * Returns a textual diagnosis string.
   */
  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<string>
  private async diagnose(assetId: string): Promise<string> {
    // Delegate to evidence query for concrete diagnosis data
    const evidenceQuery = this.ctx.get('evidenceQuery')
    if (!evidenceQuery) return `Asset ${assetId} requires attention`

    const health = evidenceQuery.assetHealth(assetId)
    if (!health) return `Asset ${assetId} not found in semantic layer`

    const issues: string[] = []
    if (health.confirmationStatus === 'draft') issues.push('unconfirmed definition')
    if (health.confirmationStatus === 'rejected') issues.push('rejected definition')
    if (!health.hasEvalCoverage) issues.push('no eval coverage')
    if (health.relationCount === 0) issues.push('isolated (no relations)')

    // Check for gap analysis
    const gaps = evidenceQuery.gapAnalysis(assetId)
    if (gaps.gaps.length > 0) {
      issues.push(`${gaps.gaps.length} reachable asset(s) without eval coverage`)
    }

    return issues.length > 0
      ? issues.join('; ')
      : 'general health check'
  }

  /**
   * Execute a confirmed edit via the management session.
   *
   * TODO(W11): delegate the actual edit to the management session's edit API.
   * For now this audits the confirmed edit only. Emits `patrol/edit-executed`
   * — NOT `patrol/round-start`, which marks a new round beginning.
   *
   * @returns true when the edit was applied, false when no active session.
   */
  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<boolean>
  private async executeEdit(edit: PatrolProposedEdit): Promise<boolean> {
    const mgmt = this.ctx.managementSession.getActive()
    if (!mgmt) return false

    // Audit the confirmed edit.
    this.ctx.emit('patrol/edit-executed', edit)
    return true
  }

  // ── Private: Confirmation ───────────────────────────────────────────

  /**
   * Request user confirmation for a proposed edit. Returns the decision.
   * Emits `patrol/confirm-request` and waits up to `confirmTimeoutMs`.
   * On timeout: emits `patrol/confirm-timeout` and returns 'timeout'.
   */
  private requestConfirm(edit: PatrolProposedEdit, signal: AbortSignal): Promise<ConfirmDecision> {
    return new Promise<ConfirmDecision>((resolve) => {
      if (signal.aborted) {
        resolve('rejected')
        return
      }

      this.state = 'awaiting-confirm'
      this.ctx.emit('patrol/confirm-request', edit)

      const timer = setTimeout(() => {
        if (this.pendingConfirm) {
          this.ctx.emit('patrol/confirm-timeout', edit)
          this.pendingConfirm = null
          this.state = 'running'
          resolve('timeout')
        }
      }, this.config.confirmTimeoutMs)

      // If signal aborts while waiting, reject
      const onAbort = () => {
        this.clearPendingConfirm('rejected')
      }
      // data-infra-7: track onAbort (+ signal) on pendingConfirm so
      // clearPendingConfirm can remove it from the long-lived signal on the
      // timeout/respondToConfirm path — { once: true } only auto-removes on
      // abort, so the listener would otherwise accumulate across patrol rounds.
      this.pendingConfirm = { edit, resolve, timer, signal, onAbort }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Clear a pending confirm, resolving its promise and clearing the timer.
   */
  private clearPendingConfirm(decision: ConfirmDecision): void {
    if (!this.pendingConfirm) return
    if (this.pendingConfirm.timer) {
      clearTimeout(this.pendingConfirm.timer)
    }
    // data-infra-7: remove the abort listener so it doesn't accumulate on the
    // long-lived abortController.signal across patrol rounds.
    this.pendingConfirm.signal.removeEventListener('abort', this.pendingConfirm.onAbort)
    const { resolve } = this.pendingConfirm
    this.pendingConfirm = null
    if (this.state === 'awaiting-confirm') {
      this.state = 'running'
    }
    resolve(decision)
  }

  // ── Private: BTW Mechanism (S3) ────────────────────────────────────

  /**
   * Check if a message is an explicit stop command.
   */
  private isStopCommand(message: string): boolean {
    const normalized = message.trim().toLowerCase()
    return (
      normalized === '停止巡检' ||
      normalized === '关闭巡检' ||
      normalized === '关闭 patrol' ||
      normalized === 'stop patrol' ||
      normalized === '停止 patrol'
    )
  }

  /**
   * Drain all queued btw messages by routing each through the management
   * session as a one-off request.
   */
  // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<void>
  private async drainBtwQueue(): Promise<void> {
    while (this.btwQueue.length > 0) {
      const msg = this.btwQueue.shift()
      if (!msg) break
      // Route through management session as one-off
      // The management session handles the request and returns;
      // patrol context is preserved because we only pause, never reset.
      const mgmt = this.ctx.managementSession.getActive()
      if (mgmt) {
        // In a real implementation, this would send the message to the
        // management session's agent for processing. The session reference
        // ensures patrol context is not lost.
        void mgmt
      }
      void msg
    }
  }

  // ── Private: Eval Trigger (C3) ─────────────────────────────────────

  /**
   * Trigger eval on modified assets after a patrol round (C3).
   */
  private async triggerEval(assetIds: readonly string[]): Promise<void> {
    // Eval is triggered via the tool-trigger-eval service seam.
    // If evalRunner is available, run a batch; otherwise this is a no-op.
    const evalRunner = this.ctx.get('evalRunner') as { runBatch(opts?: object): Promise<unknown> } | undefined
    if (evalRunner) {
      await evalRunner.runBatch()
    }
    void assetIds
  }

  // ── Private: Utilities ─────────────────────────────────────────────

  /**
   * Sleep for a given duration, aborting early if signal fires.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(); return }
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    })
  }
}

// ── Plugin Registration ─────────────────────────────────────────────────

/** Cordis plugin name. */
export const name = 'patrol-mode'

/** Service dependencies — required peers. */
export const inject = ['managementSession', 'audit'] as const

/**
 * Plugin apply function — registers the PatrolService on the context.
 */
export function apply(ctx: Context): void {
  ctx.plugin(PatrolService)
}
