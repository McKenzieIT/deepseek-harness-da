/**
 * Session-scoped selection store: shares the SchemaExplorer's selected-asset
 * signal with the sibling EvidenceSidebar adapter across the two `details.aux`
 * entries that declare this handle.
 *
 * Direction D of the GA-GRILL-wiring resolution (2026-09-03): projection is
 * log-derived (the host folds the session event log; the client `useProjection`
 * is read-only and cannot publish), so a transient UI selection is NOT a
 * session-log event and cannot ride the projection seat — ruling out option A
 * (`useProjection('selection')`). A module-level singleton (option B) would
 * serialize selection across concurrent management sessions. The framework's
 * session-scoped slot store is the matching mechanism: `defineStore` builds the
 * handle; both `details.aux` entries declare it (`store:`); the ui-renderer
 * `standardKit` resolves one instance per (handle × sessionId) via `storeOf`, so
 * two sibling adapters in one session share one instance while sessions stay
 * isolated (and `pruneStoreScope` clears an instance when its session dies).
 *
 * The handle is constructed at apply time (index.ts `apply()`), not exported at
 * module level — module-cache identity is a disguised singleton surviving plugin
 * reloads, and apply-time construction lets identity follow the fiber (the same
 * pattern ui-conversation's chat store uses for its conversation/details share).
 *
 * Asset-id contract: for LIST selections (domain-detail table/event/metric
 * lists) `SelectionAsset.name` is the schema-gateway bare logical name
 * (table_name / event name / metric name), which IS the id the evidence-query
 * backend indexes eval results by — see `EvalResultFilters.assetId` in
 * packages/data/evidence-query/src/types.ts ("table_name, event name, or metric
 * name") — so it passes straight through as `EvidenceSidebar.selectedAssetId`.
 * The SEARCH path, however, threads `SchemaSearchHit.id` as the name, and
 * `inferKindFromId` shows event/metric search-hit ids carry a kind prefix
 * (`event:`/`evt_`/`metric:`/`m_`) that does NOT match the backend's bare-name
 * expectation — a search-originated event/metric selection would miss the
 * backend. The store itself does no normalization (it stores what callers
 * pass); where to normalize is a separate concern — see follow-up grilling
 * GA-GRILL-search-asset-id-normalization. (The risk-note `table:orders`
 * table-prefix hypothesis is disproven — tables have bare ids — but the
 * event/metric search-hit prefixes are a real, separate mismatch.)
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { AssetKind } from './hooks/useSchemaGateway.ts'

/**
 * A selected schema asset: its logical name (the schema-gateway identifier) and
 * kind. Readonly value object — writers reassign the whole selection, never
 * mutate a field.
 */
export interface SelectionAsset {
  readonly name: string
  readonly kind: AssetKind
}

/** Selection store state, shared across the two `details.aux` entries per session. */
export interface SelectionState {
  /** The currently selected asset, or null while nothing is selected. */
  selectedAsset: SelectionAsset | null
}

/**
 * Declared action shape giving the exported factory a stable return type;
 * drift between this and the actions literal fails assignability at the
 * `defineStore` call.
 */
type SelectionActions = {
  select: (draft: SelectionState, asset: SelectionAsset | null) => void
}

/**
 * Declare the session-scoped selection store: initial state (nothing selected)
 * and the single write surface. The returned handle is the registration
 * currency of the store seat — its identity keys instance sharing, while
 * `resolveStore` indexes the live instances by handle × sessionId.
 *
 * @returns the store handle (spec + types + identity + factory in one).
 */
export function createSelectionStore(): EngineStoreHandle<SelectionState, SelectionActions> {
  return defineStore({
    init: (): SelectionState => ({ selectedAsset: null }),
    actions: {
      // immer draft mutator; the framework bakes the draft parameter away, so
      // the component-facing action is `select(asset)` (see SelectionStoreProps).
      select: (d, asset: SelectionAsset | null) => { d.selectedAsset = asset },
    },
  })
}

/**
 * The store-kit share both `details.aux` adapters receive when they declare
 * `store:` on this handle: a typed `useStore` selector hook plus the baked
 * `actions` table. `PropsRuntime<'details.aux'>` does NOT carry the store share
 * (it composes separately as `PropsStore` at the register call site), so the
 * adapter props types manually `&` this share.
 */
export type SelectionStoreProps = PropsStore<ReturnType<typeof createSelectionStore>>
