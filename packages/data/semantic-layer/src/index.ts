/**
 * Cordis adapter for the host-neutral semantic-grounding substrate.
 *
 * `ctx.schema` IS a `SemanticGroundingCore` instance — this plugin constructs
 * one, wires its optional collaborators, provides it under the `schema` name,
 * and bridges the fiber lifetime to `core.dispose()`. It forwards nothing.
 *
 * Why the core is provided directly rather than wrapped in a `Service`
 * subclass: `SemanticGroundingCore` declares 24 `private` members, so it is
 * NOMINALLY typed. A forwarding wrapper is not assignable to it, which would
 * stop every tarball-bound consumer from typing `ctx.schema` with the
 * substrate's own class. Providing the instance makes each
 * `as SemanticGroundingCore` cast true instead of a lie, reaches all 32 public
 * members, and leaves no forwarding code to drift.
 *
 * @module @deepseek-ai/dsh-semantic-layer
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: makes `ctx.get('audit')` resolve to the Audit augmentation, so the
// `setTier2Recorder` call below is checked against the substrate's
// `Tier2Recorder` instead of silently accepting `any`. The seam stays optional
// at runtime (Tier-2 writes fail-loud without it — D5 / ADR-0001).
import type {} from '@deepseek-ai/dsh-audit'
import { SemanticGroundingCore } from '@semantic-grounding/substrate'

declare module '@deepseek-ai/cordis' {
  interface Context {
    schema: SemanticGroundingCore
  }
}

export const name = 'semantic-layer'
/** Service names this plugin registers, read by the Loader and by `Service`. */
export const provide = ['schema']

/**
 * Mount config for the `semantic-layer` row in a bundle's `cordis.patch.yml`.
 *
 * Declared here rather than re-exported from the substrate because a plugin's
 * config type must live in its own package — `gen-config-catalog` enforces
 * that, and it is the right boundary: this is the HOST-facing mount surface,
 * so the adapter owns it and the substrate's internal config type stays free
 * to move. Structurally assignable to the core's constructor parameter, which
 * is what keeps `new SemanticGroundingCore(config)` honest.
 *
 * `corpusVariant`'s union is spelled out instead of importing the substrate's
 * `CorpusVariant`, for the same locality reason; the schemastery `Config`
 * below already pins the same two literals, and the two must track each other.
 */
export interface SemanticLayerConfig {
  /** Semantic-layer scope root (the dir with config.yaml/events/tables). */
  readonly semanticRoot?: string
  /** Default scope id for Tier-2 audit + schema discovery. */
  readonly scopeId?: string
  /** D2h enrichment variant — 'params+term' (default) or 'term-only'. */
  readonly corpusVariant?: 'params+term' | 'term-only'
  /** G3 auto-run DWS→DIM relation discovery after a Service write. */
  readonly autoEnrich?: boolean
}

export const Config: z<SemanticLayerConfig> = z.object({
  semanticRoot: z.string().default(''),
  scopeId: z.string().default(''),
  corpusVariant: z.union(['params+term', 'term-only'] as const).default('params+term'),
  autoEnrich: z.boolean().default(true),
})

export function apply(ctx: Context, config: SemanticLayerConfig): void {
  const core = new SemanticGroundingCore(config)

  // `audit` and `scopes` are OPTIONAL collaborators, so they are deliberately
  // absent from this plugin's `inject` list: `ctx.schema` must mount whether or
  // not they exist. They are wired through nested `ctx.inject(...)` fibers
  // instead, which is sugar for a CHILD `ctx.plugin({ inject, apply })` — the
  // child gates only itself, this plugin's own mount is unaffected.
  //
  // Reactive rather than one-shot because the core takes these by setter while
  // the host may provide them AFTER the semantic layer mounts. A single
  // `core.setTier2Recorder(ctx.get('audit'))` at apply time would latch
  // `undefined` forever and never see a later mount; the pre-cutover Service
  // re-probed `ctx.get('audit')` / `ctx.get('scopes')` on every use, and these
  // child fibers reproduce that late-binding exactly.
  ctx.inject(['audit'], (auditCtx) => {
    // D5 (ADR-0001): there is deliberately no silent no-op recorder here. While
    // `audit` is unmounted the recorder stays undefined and every auditable
    // write THROWS. Audit-off is only ever legitimate as an explicit no-op
    // recorder passed on purpose, never as a wiring accident.
    auditCtx.effect(() => {
      core.setTier2Recorder(auditCtx.get('audit'))
      return () => { core.setTier2Recorder(undefined) }
    }, 'semantic-layer tier2Recorder')
  })

  ctx.inject(['scopes'], (scopeCtx) => {
    scopeCtx.effect(() => {
      core.setScopeRegistry(scopeCtx.get('scopes') as never)
      return () => { core.setScopeRegistry(undefined) }
    }, 'semantic-layer scopeRegistry')
  })

  ctx.effect(() => ctx.provide('schema', core))
  // The fiber↔core lifetime bridge. `core.dispose()` releases the
  // data-source-kind registrations and the graph cache-invalidation listeners
  // the core owns. Without it, a withdrawn kind's nodes survive a fiber reload
  // inside the cached graph.
  ctx.effect(() => () => { core.dispose() }, 'semantic-layer core.dispose')
}

export { SemanticGroundingCore as SemanticLayerService }
export { SemanticGroundingCore }
/**
 * Re-exported because consumers register their own kinds through
 * `ctx.schema.getRegistry().register(...)` and need the plugin type to do it
 * (e.g. `apps/web/tests/semantic-graph-remote.e2e.ts:37`, which imports it
 * alongside this module's default export).
 */
export type { DataSourceKindPlugin } from '@semantic-grounding/substrate'

/**
 * The mountable plugin. `cordis.patch.yml` mounts this row by package name, and
 * `apps/web/tests/semantic-graph-remote.e2e.ts:37` imports it as a default.
 */
export default { name, provide, Config, apply }
