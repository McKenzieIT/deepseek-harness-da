/**
 * `delegate_query` tool — multi-scope query delegation via subagent.
 *
 * The main agent dispatches a natural-language question to a subagent bound to
 * a specific scope. The subagent runs UNDERSTANDING → GENERATION → EXECUTION
 * independently; INTERPRETATION stays in the main agent (cross-scope synthesis +
 * conversation memory preservation).
 *
 * ## Subagent Scope Binding (Question 1 → Answer 乙)
 *
 * The subagent is created with its own session. Before the subagent's pipeline
 * starts, the setup hook calls `ctx.scopes.setActive(scope_id)` in the
 * subagent's context — all existing infra (semantic-layer, corpus, phase-gate)
 * then operates against the delegated scope. The main agent's active scope is
 * NOT changed.
 *
 * Key insight: `ctx.scopes` in the child is a SCOPED Service reference. Cordis
 * scoping means the child's `setActive` writes the registry file (shared state),
 * but the parent's next read of `ctx.scopes.active()` sees the same change.
 * THIS IS A PROBLEM — we can't have the subagent's scope switch affect the parent.
 *
 * Solution: the subagent does NOT call `setActive`. Instead, the subagent's
 * SemanticLayerService is constructed with explicit `semanticRoot` and `scopeId`
 * from the target scope definition — bypassing the scope registry delegation.
 * This is achieved via the subagent's AgentSetup injecting a scoped config
 * override for `ctx.schema`.
 *
 * Alternative (simpler, chosen): the subagent's AgentSetup installs a thin
 * ScopeOverride that makes `ctx.scopes.active()` return the delegated scope
 * for that context only. This is a per-context override (Cordis service fork),
 * not a global state mutation.
 *
 * ## Return Value (Question 2 → Answer 丙: both)
 *
 * The subagent runs U → G → E (3 phases). On completion:
 * - `outcome`: the QueryOutcome from EXECUTION (columns/rows/error/status)
 * - `interpretation`: NOT included (subagent stops after EXECUTION; the main
 *   agent owns INTERPRETATION across all delegated results). Wait — per G-DA5,
 *   "切分点 = UNDERSTANDING + GENERATION + EXECUTION（scope-specific 阶段由
 *   subagent 执行）/ INTERPRETATION 留在主 agent" — so interpretation IS the
 *   main agent's job. But the ticket's Question 2 asks about the subagent's
 *   return. Let's include a BRIEF subagent summary (≤2 sentences) alongside
 *   the structured outcome — so the main agent can synthesize without reading
 *   raw rows when they're large.
 *
 * Revised: subagent runs ALL 4 phases (U+G+E+I). Returns:
 * - `outcome`: QueryOutcome from E (structured)
 * - `interpretation`: subagent's I-phase text (pre-summarized per-scope answer)
 *
 * The main agent then SYNTHESIZES across scopes in its own INTERPRETATION turn.
 *
 * ## Phase-gate Interaction
 *
 * The subagent has its own independent phase-gate state (fresh per-session).
 * The main agent's phase-gate is NOT advanced by delegate_query — the tool call
 * counts as a single UNDERSTANDING/GENERATION-phase tool use (depends on which
 * phase the main agent is in when it calls delegate_query).
 *
 * @module @deepseek-ai/dsh-tool-scope-routing/delegate-query
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DelegateQueryResult } from './types.ts'

/** Timeout for a delegated subagent query (5 minutes). */
const DELEGATE_TIMEOUT_MS = 300_000

export function registerDelegateQuery(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'delegate_query',
    description:
      'Delegate a data query to a specific scope via a subagent. The subagent '
      + 'runs the full data pipeline (understand → generate SQL → execute → interpret) '
      + 'independently against the target scope and returns both the query result '
      + 'and its interpretation. Use this for multi-scope questions where you need '
      + 'to query different scopes separately and then synthesize the results. '
      + 'The current scope is NOT changed by this call.',
    parameters: {
      scope_id: {
        type: 'string',
        description: 'The scope id to delegate the query to.',
        required: true,
      },
      question: {
        type: 'string',
        description:
          'The natural-language question to ask against the target scope. '
          + 'Should be self-contained (the subagent has no conversation history).',
        required: true,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          scope_id: { type: 'string', required: true },
          outcome: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              columns: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'object' } },
              row_count: { type: 'number' },
              error: { type: 'string' },
            },
          },
          interpretation: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value as unknown as DelegateQueryResult
        if (!v.ok) return [{ type: 'text', text: `delegate_query(${v.scope_id}) failed: ${v.error}` }]
        const rows = v.outcome?.row_count ?? 0
        return [{ type: 'text', text: `delegate_query(${v.scope_id}): ${rows} rows. ${v.interpretation ?? ''}` }]
      },
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('delegate_query aborted')

      const scopeId = args.scope_id as string
      const question = args.question as string

      const scopes = ctx.get('scopes')
      if (!scopes) {
        return { ok: false, scope_id: scopeId, error: 'scope registry not mounted' } as any
      }

      const target = scopes.get(scopeId)
      if (!target) {
        return { ok: false, scope_id: scopeId, error: `scope "${scopeId}" not found` } as any
      }

      // ── Subagent spawn ────────────────────────────────────────────────
      //
      // The subagent is a full ReactLoopAgent with:
      // - Its own session (no parent history)
      // - SemanticLayerService config pointing to target.semanticRoot
      // - Phase-gate initialized with target scope_id
      // - The user's question as the initial message
      //
      // Implementation sketch (actual API depends on agentLoop.createAgent):
      //
      //   const handle = await ctx.agentLoop.createAgent(ctx, {
      //     sessionId: SessionId(`delegate-${scopeId}-${randomUUID()}`),
      //     agentOptions: {
      //       provider: mainAgent.options.provider,
      //       model: mainAgent.options.model,
      //     },
      //     seed: { messages: [createUserMessage(question)] },
      //     setup: (childCtx) => {
      //       // Override the scope for this subagent's context
      //       childCtx.schema = new SemanticLayerService(childCtx, {
      //         semanticRoot: target.semanticRoot,
      //         scopeId: target.id,
      //       })
      //       // Phase-gate state starts fresh with the target scope
      //       // (freshPhaseGateState already accepts scopeId param)
      //     },
      //     signal: AbortSignal.timeout(DELEGATE_TIMEOUT_MS),
      //   })
      //
      //   // Wait for the subagent to complete (reach INTERPRETATION COMPLETE or decline)
      //   await handle.agent.whenIdle()
      //
      //   // Extract results from the subagent's session
      //   const outcome = extractQueryOutcome(handle.agent.session)
      //   const interpretation = extractInterpretation(handle.agent.session)
      //
      //   // Dispose the subagent (single-use, no persistence)
      //   await handle.dispose()

      // ── Placeholder (prototype) — returns a sketch of the shape ──────
      return {
        ok: true,
        scope_id: scopeId,
        outcome: {
          status: 'completed' as const,
          columns: ['(prototype — subagent not yet wired)'],
          rows: [],
          row_count: 0,
        },
        interpretation: `[prototype] Would delegate "${question}" to scope ${scopeId} via subagent`,
      } satisfies DelegateQueryResult as any
    },
  }))
}
