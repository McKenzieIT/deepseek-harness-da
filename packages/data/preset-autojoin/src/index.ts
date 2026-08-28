/**
 * @deepseek-ai/dsh-preset-autojoin — da wrapper (§4.2) that joins the
 * configured default agent preset to every published agent on `agent/created`.
 *
 * The headless entry (`@deepseek-ai/dsh-headless`, dsh — not da-owned per
 * §4.1/§4.5) creates a bare agent: its `setup` calls `installModelSelection`
 * but NOT `AgentPresets.mount(agentCtx, id)`, so the data-agent preset
 * (phase-gate persona + 4 data tools) never joins the headless agent. This
 * wrapper closes that gap without modifying dsh src: it hooks the
 * `agent/created` lifecycle event and calls `AgentPresets.mount(agent.ctx,
 * defaultId)` to join the deployment's default preset to ANY published agent
 * — headless included.
 *
 * `agent/created` is a fire-and-forget dispatch: the framework does NOT await
 * async listeners (core/agent announce() voids the returned promise), so an
 * async presets.mount() here races the agent-loop's first prompt assembly and
 * is NOT guaranteed to join the preset's tools/persona before the first model
 * request. For guaranteed ordering, join in an awaited setup path (the headless
 * entry must call AgentPresets.mount in its setup, like the api-proxy host path).
 * This wrapper remains a best-effort safety net for agents published without a
 * setup-time join.
 *
 * The join is idempotent and guarded: an agent whose `setup` already joined a
 * preset is skipped via `composedPreset(agent.ctx)`, and an agent published
 * where no default is configured (no roster, or the default id is unknown) is
 * skipped silently — this wrapper never force-joins.
 *
 * @module @deepseek-ai/dsh-preset-autojoin
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings the `agent/created` lifecycle event declaration onto
// Context so `ctx.on('agent/created', …)` is typed. The event is declared in
// `@deepseek-ai/dsh-agent` runtime-types; importing the types side-effects
// the module augmentation without pulling the runtime.
import type {} from '@deepseek-ai/dsh-agent'
// Type-only: brings the `ctx.agentPresets` Context augmentation declared by
// `@deepseek-ai/dsh-agent-presets` so `apply` can read the resolved roster.
import type {} from '@deepseek-ai/dsh-agent-presets'

/**
 * The subset of {@link AgentPresets} this wrapper depends on, as a structural
 * type so unit tests can supply a plain mock without standing up the full
 * roster service (loader, settings, disk discovery).
 *
 * The real `AgentPresets` (from `@deepseek-ai/dsh-agent-presets`) satisfies
 * this interface: `resolve` returns a preset with an `id`, `mount` joins it,
 * and `composedPreset` reads whether the agent already joined one.
 */
export interface AutojoinPresetService {
  /**
   * Resolve one preset by id, or the default when `id` is `undefined`.
   * @param id - the preset id, or `undefined` for the deployment default.
   * @returns the resolved preset (at least its `id`).
   * @throws when no configured root supplies that id (no default configured).
   */
  resolve(id?: string): Promise<{ id: string }>
  /**
   * Compose one agent from a preset: parent the agent's scope key to the
   * preset's standing mount so the mount's registrations cover this agent.
   * @param agentCtx - the agent's scope context.
   * @param id - the preset id, or `undefined` for the default.
   * @returns the preset that was composed.
   */
  mount(agentCtx: Context, id?: string): Promise<unknown>
  /**
   * The preset one live agent runs on, or `undefined` when it joined none.
   * @param agentCtx - the agent's scope context.
   * @returns the preset id, or undefined when the agent joined no preset.
   */
  composedPreset(agentCtx: Context): string | undefined
}

/** Stable Cordis plugin name. */
export const name = 'preset-autojoin'

/**
 * Resolve the preset roster before this plugin's fiber activates, so the
 * `agent/created` listener never observes an agent before the roster exists.
 */
export const inject = ['agentPresets'] as const

/**
 * Build the `agent/created` listener that joins the default preset.
 *
 * Exported so unit tests can drive the resolve→mount→skip logic with a plain
 * mock service, independent of the Cordis event/scope machinery. On a mount
 * failure the listener logs the error at ERROR (visible at the default INFO
 * threshold — the `agent/created` dispatch is fire-and-forget and its WARN
 * report is filtered) and then re-throws so the agent runs bare, exactly as
 * it does without this wrapper.
 * @param presets - the preset roster service (or a structural mock).
 * @returns an `agent/created` listener.
 */
export function createAutojoinListener(presets: AutojoinPresetService) {
  return async ({ agent }: { agent: { ctx: Context } }): Promise<void> => {
    // Idempotent: an agent whose setup already joined a preset (the api-proxy
    // host path) is left alone — this wrapper must not re-parent a scope the
    // roster already bound, and `mount` would throw on a second bind.
    if (presets.composedPreset(agent.ctx) !== undefined) return
    // Guard: only join when a default is configured. A rosterless deployment,
    // or one whose default id no longer resolves, skips silently — this
    // wrapper never force-joins. `resolve(undefined)` throws when no root
    // supplies the default id; any other throw here is the same "no default"
    // answer and is swallowed for the same reason.
    let preset: { id: string }
    try {
      preset = await presets.resolve(undefined)
    } catch {
      return
    }
    // A mount failure (broken composition, leaked service) propagates: the
    // agent runs bare — exactly as it does without this wrapper — rather than
    // the join silently swallowing a composition the operator needs to fix.
    // The `agent/created` dispatch is fire-and-forget: it reports the rejected
    // listener promise, but the cordis logger filters WARN at the default INFO
    // threshold, so a PresetMountError (e.g. a service leaking to the root
    // realm) would be silently swallowed. Log it here at ERROR (visible at the
    // INFO threshold) so future mount failures surface, then re-throw so the
    // dispatch still reports the rejection and the agent runs bare.
    try {
      await presets.mount(agent.ctx, preset.id)
    } catch (error) {
      try {
        agent.ctx.logger.error(error)
      } catch {
        // best-effort: a logging failure must not mask the original mount error.
      }
      throw error
    }
  }
}

/**
 * Mount the preset-autojoin wrapper.
 *
 * Registers one `agent/created` listener on the host context; the listener
 * joins the deployment's default preset to every published agent that joined
 * none in `setup`. The listener is a scoped effect of this plugin, so it
 * unwinds when the plugin unloads.
 * @param ctx - plugin context carrying the resolved `agentPresets` service.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/created', createAutojoinListener(ctx.agentPresets))
}
