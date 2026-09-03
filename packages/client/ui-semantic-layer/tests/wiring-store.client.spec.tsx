// @vitest-environment jsdom
/**
 * GA-WIRING-impl acceptance tests #3 and #4 (+ the S3 click→select mechanism
 * for #5): the session-scoped selection store shares SchemaExplorer's
 * selected-asset signal with the sibling EvidenceSidebar adapter.
 *
 * Altitude: the real `defineStore` engine (`createSelectionStore().create()`)
 * and the real adapter components (SemanticLayerEvidence /
 * SemanticLayerSchemaExplorer / SchemaExplorer). The framework's
 * store-sharing guarantee — one instance per handle × sessionId via
 * resolveStore — is already covered by ui-renderer's scoped-slots suite, so
 * here we exercise ONE shared instance (exactly what the framework produces
 * for two `details.aux` entries on the same handle in one session) and prove
 * the adapter wiring threads `useStore`/`actions` through to EvidenceSidebar's
 * asset-scoped effect.
 *
 * The `useStore` hook is bound with useSyncExternalStore over the instance's
 * subscribe/getSnapshot contract. The production binding (ui-renderer's
 * observableHook) is a uSES bridge over that same contract; for the
 * `selectedAsset` slice (a stable reference between updates) it is
 * functionally identical — no re-render storm, no missed update.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { SemanticLayerEvidence, SemanticLayerSchemaExplorer, PRESET_ID, type SemanticLayerEvidenceProps, type SemanticLayerSchemaExplorerProps } from '../src/client/wiring.tsx'
import { SchemaExplorer } from '../src/client/SchemaExplorer.tsx'
import {
  createSelectionStore,
  type SelectionAsset,
  type SelectionState,
  type SelectionStoreProps,
} from '../src/client/selectionStore.ts'
import type { EvidenceQueryClient } from '../src/client/hooks/useEvidenceQuery.ts'
import type { DomainEntry, SchemaGatewayClient, TableSummary } from '../src/client/schemaGatewayBridge.ts'

/** Snapshot-store instance face the test-local useStore binds over. */
interface InstanceFace {
  getSnapshot(): SelectionState
  subscribe(fn: () => void): () => void
  readonly actions: SelectionStoreProps['actions']
}

/**
 * Bind a `useStore` selector hook over a snapshot-store instance via uSES —
 * the production binding (ui-renderer observableHook) is a uSES bridge over
 * the same subscribe/getSnapshot contract; for the `selectedAsset` slice (a
 * stable reference between updates) it is functionally identical.
 */
function bindUseStore(instance: InstanceFace): SelectionStoreProps['useStore'] {
  const subscribe = instance.subscribe
  const getSnapshot = instance.getSnapshot
  const useStore = <S,>(sel: (s: SelectionState) => S): S =>
    useSyncExternalStore(subscribe, () => sel(getSnapshot()))
  return useStore as SelectionStoreProps['useStore']
}

/** A mock EvidenceQueryClient with `gapAnalysis`/`evalResultQuery` as spies. */
function mockEvidenceClient(): {
  client: EvidenceQueryClient
  gapAnalysis: ReturnType<typeof vi.fn>
  evalResultQuery: ReturnType<typeof vi.fn>
} {
  const coverage = {
    table_count: 0, event_count: 0, metric_count: 0, domain_counts: {},
    confirmation: { draft: 0, confirmed: 0, rejected: 0 },
  }
  const gapAnalysis = vi.fn(async (_assetId: string) => ({ sourceAssetId: _assetId, gaps: [] }))
  const evalResultQuery = vi.fn(async () => ({ results: [], total: 0 }))
  const client: EvidenceQueryClient = {
    coverageQuery: async () => coverage,
    gapAnalysis,
    evalResultQuery,
    assetHealth: async () => null,
    reachabilityDelta: async () => ({
      proposedRelation: { sourceId: '', targetId: '', type: 'joins' },
      newlyReachable: [],
    }),
    beforeAfterDelta: async () => ({
      runIdA: '', runIdB: '', flipped: [],
      summary: { improved: 0, regressed: 0, unchanged: 0 },
    }),
    triggerEvalRun: async () => 'run-1',
    getEvalRunCount: async () => 0,
    getRecentPassRates: async () => [],
    subscribeInvalidation: () => () => {},
  } as unknown as EvidenceQueryClient
  return { client, gapAnalysis, evalResultQuery }
}

/** A mock SchemaGatewayClient with pluggable domain/table rosters. */
function mockSchemaClient(opts: { domains: DomainEntry[]; tables: TableSummary[] }): SchemaGatewayClient {
  return {
    listDomains: async () => opts.domains,
    listTables: async () => opts.tables,
    listEvents: async () => [],
    listMetrics: async () => [],
    getTableDefinition: async () => null,
    getEventDefinition: async () => null,
    getMetricDefinition: async () => null,
    search: async () => [],
    getCoverageStats: async () => ({ table_count: 0, event_count: 0, metric_count: 0, domain_counts: {} }),
  } as unknown as SchemaGatewayClient
}

/** `useSessions` stub that reports the given session as the management preset. */
function activeUseSessions(sessionId: string): unknown {
  return (sel: (s: { byId: Record<string, { agentPreset: string }> }) => unknown) =>
    sel({ byId: { [sessionId]: { agentPreset: PRESET_ID } } })
}

const noopT = (key: string): string => key
const noopUseProjection = (): null => null

/** Kit props for the SemanticLayerEvidence adapter (framework seats stubbed). */
function evidenceAdapterProps(
  sessionId: string,
  evidenceClient: EvidenceQueryClient | null,
  useStore: SelectionStoreProps['useStore'],
  actions: SelectionStoreProps['actions'],
): SemanticLayerEvidenceProps {
  return {
    useSessions: activeUseSessions(sessionId),
    useProjection: noopUseProjection,
    sessionId,
    t: noopT,
    evidenceClient,
    useStore,
    actions,
  } as unknown as SemanticLayerEvidenceProps
}

/** Kit props for the SemanticLayerSchemaExplorer adapter (framework seats stubbed). */
function schemaAdapterProps(
  sessionId: string,
  schemaClient: SchemaGatewayClient | null,
  useStore: SelectionStoreProps['useStore'],
  actions: SelectionStoreProps['actions'],
): SemanticLayerSchemaExplorerProps {
  return {
    useSessions: activeUseSessions(sessionId),
    useProjection: noopUseProjection,
    sessionId,
    t: noopT,
    schemaClient,
    onNavigateToGraph: undefined,
    useStore,
    actions,
  } as unknown as SemanticLayerSchemaExplorerProps
}

describe('GA-WIRING: session-scoped selection store', () => {
  it('shares selection across the two sibling adapters: actions.select drives EvidenceSidebar fetches with the asset id (acceptance #3)', async () => {
    const { client: evidenceClient, gapAnalysis, evalResultQuery } = mockEvidenceClient()
    // One handle, one per-session instance — exactly what the framework
    // produces for two `details.aux` entries on the same handle in one session.
    const store = createSelectionStore()
    const instance = store.create('s1')
    const useStore = bindUseStore(instance)
    const actions = instance.actions

    // Mount BOTH sibling adapters sharing the one instance: SchemaExplorer
    // writes the selection; EvidenceSidebar reads it. schemaClient is null, so
    // SchemaExplorer renders an empty domains view (and AssetDetail's null-
    // definition empty state after a select) — it never crashes.
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <>
          <SemanticLayerSchemaExplorer {...schemaAdapterProps('s1', null, useStore, actions)} />
          <SemanticLayerEvidence {...evidenceAdapterProps('s1', evidenceClient, useStore, actions)} />
        </>,
      )
    })

    // Before selection: the asset-scoped effect early-returns (no asset) → no fetch.
    expect(gapAnalysis).not.toHaveBeenCalled()

    // SchemaExplorer's selected-asset signal — the actions it shares with the
    // evidence adapter — selects a table by its logical name.
    await act(async () => {
      actions.select({ name: 'orders', kind: 'table' })
    })

    // EvidenceSidebar's asset-scoped useEffect fires with selectedAssetId='orders':
    // fetchGapAnalysis('orders') + fetchEvalResults({ assetId: 'orders', limit: 50 }).
    expect(gapAnalysis).toHaveBeenCalledWith('orders')
    expect(evalResultQuery).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'orders', limit: 50 }))

    view.unmount()
  })

  it('clearing the selection re-arms the effect: no stale fetch fires on a later change', async () => {
    const { client: evidenceClient, gapAnalysis } = mockEvidenceClient()
    const store = createSelectionStore()
    const instance = store.create('s1')
    const useStore = bindUseStore(instance)
    const actions = instance.actions

    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <SemanticLayerEvidence {...evidenceAdapterProps('s1', evidenceClient, useStore, actions)} />,
      )
    })
    await act(async () => { actions.select({ name: 'orders', kind: 'table' }) })
    expect(gapAnalysis).toHaveBeenCalledWith('orders')
    gapAnalysis.mockClear()
    // Clearing the selection writes null; the effect re-runs but early-returns
    // (no asset), so no fetch fires for the cleared state.
    await act(async () => { actions.select(null) })
    expect(gapAnalysis).not.toHaveBeenCalled()
    view.unmount()
  })

  it('isolates selection per session: one handle, two per-session instances (acceptance #4)', async () => {
    const { client: ev2, gapAnalysis: gap2, evalResultQuery: eval2 } = mockEvidenceClient()
    // ONE handle (as index.ts constructs in apply), TWO per-session instances
    // (resolveStore indexes by handle × sessionId). Constructive guarantee:
    // a write on s1 never reaches s2's snapshot.
    const store = createSelectionStore()
    const inst1 = store.create('s1')
    const inst2 = store.create('s2')
    inst1.actions.select({ name: 'orders', kind: 'table' })
    expect(inst1.getSnapshot().selectedAsset).toEqual({ name: 'orders', kind: 'table' })
    expect(inst2.getSnapshot().selectedAsset).toBeNull()

    // Behavioral: s2's EvidenceSidebar (bound to inst2) does not fetch for
    // s1's selection — the instances are isolated by session id.
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <SemanticLayerEvidence {...evidenceAdapterProps('s2', ev2, bindUseStore(inst2), inst2.actions)} />,
      )
    })
    expect(gap2).not.toHaveBeenCalled()
    await act(async () => { inst1.actions.select({ name: 'payments', kind: 'table' }) })
    expect(gap2).not.toHaveBeenCalled()
    expect(eval2).not.toHaveBeenCalled()
    view.unmount()
  })

  it('SchemaExplorer writes the clicked table to the store via actions.select (S3; mechanism for #5)', async () => {
    const selectSpy = vi.fn<(asset: SelectionAsset | null) => void>()
    // useStore returns null so AssetDetail never mounts; the point is the
    // click→actions.select write path, not the detail pane.
    const useStore = (() => null) as unknown as SelectionStoreProps['useStore']
    const actions = { select: selectSpy } as unknown as SelectionStoreProps['actions']
    const schemaClient = mockSchemaClient({
      domains: [{ name: 'sales', table_count: 1, event_count: 0, metric_count: 0 }],
      tables: [{
        table_name: 'orders', kind: 'dws', domains: ['sales'],
        description: '', column_count: 0, metric_count: 0,
      }],
    })

    await act(async () => {
      render(<SchemaExplorer client={schemaClient} t={noopT} useStore={useStore} actions={actions} />)
    })

    // loadDomains resolves → the 'sales' domain card renders; clicking it
    // switches to domain-detail and loads the table roster.
    const salesCard = await screen.findByText('sales')
    await act(async () => { fireEvent.click(salesCard) })

    // loadTablesForDomain resolves → the 'orders' table row renders; clicking it
    // calls handleAssetClick('orders','table') → actions.select({name,kind}).
    const ordersRow = await screen.findByText('orders')
    await act(async () => { fireEvent.click(ordersRow) })

    expect(selectSpy).toHaveBeenCalledWith({ name: 'orders', kind: 'table' })
  })
})
