import { useState, useCallback, type FC } from 'react'
import type { DomainEntry, TableSummary, EventSummary, MetricSummary, SchemaSearchHit } from './schemaGatewayBridge.ts'
import { useSchemaGateway, type AssetKind, type SchemaGatewayClient } from './hooks/useSchemaGateway.ts'
import { AssetDetail } from './AssetDetail.tsx'
import styles from './SchemaExplorer.module.css'

type ViewState =
  | { mode: 'domains' }
  | { mode: 'domain-detail'; domain: string; tab: 'tables' | 'events' | 'metrics' }
  | { mode: 'search' }

export interface SchemaExplorerProps {
  client: SchemaGatewayClient | null
  t: (key: string, params?: Record<string, unknown>) => string
  onNavigateToGraph?: ((assetId: string) => void) | undefined
}

export const SchemaExplorer: FC<SchemaExplorerProps> = ({ client, t, onNavigateToGraph }) => {
  const { state, loadTablesForDomain, loadEventsForDomain, loadMetricsForDomain, loadAssetDefinition, search } = useSchemaGateway(client)
  const [view, setView] = useState<ViewState>({ mode: 'domains' })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<{ name: string; kind: AssetKind } | null>(null)

  const handleDomainClick = useCallback((domain: DomainEntry) => {
    setView({ mode: 'domain-detail', domain: domain.name, tab: 'tables' })
    setSelectedAsset(null)
    void loadTablesForDomain(domain.name)
  }, [loadTablesForDomain])

  const handleTabChange = useCallback((tab: 'tables' | 'events' | 'metrics', domain: string) => {
    setView(v => v.mode === 'domain-detail' ? { ...v, tab } : v)
    setSelectedAsset(null)
    if (tab === 'tables') void loadTablesForDomain(domain)
    else if (tab === 'events') void loadEventsForDomain(domain)
    else void loadMetricsForDomain(domain)
  }, [loadTablesForDomain, loadEventsForDomain, loadMetricsForDomain])

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value)
    if (value.trim()) {
      setView({ mode: 'search' })
      search(value, 20)
    } else {
      setView({ mode: 'domains' })
    }
  }, [search])

  const handleAssetClick = useCallback((name: string, kind: AssetKind) => {
    setSelectedAsset({ name, kind })
    void loadAssetDefinition(name, kind)
  }, [loadAssetDefinition])

  const handleBack = useCallback(() => {
    setView({ mode: 'domains' })
    setSelectedAsset(null)
    setSearchQuery('')
  }, [])

  return (
    <div className={styles.root}>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('schema.search.placeholder')}
          value={searchQuery}
          onChange={e => handleSearchInput(e.target.value)}
        />
      </div>

      {view.mode === 'domain-detail' && (
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbLink} onClick={handleBack}>
            {t('schema.domains')}
          </span>
          <span>›</span>
          <span>{view.domain}</span>
        </div>
      )}

      {view.mode === 'domain-detail' && (
        <div className={styles.tabs}>
          {(['tables', 'events', 'metrics'] as const).map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${view.tab === tab ? styles.tabActive : ''}`}
              onClick={() => handleTabChange(tab, view.domain)}
            >
              {t(`schema.tab.${tab}`)}
            </button>
          ))}
        </div>
      )}

      <div className={styles.content}>
        {state.loading && <div className={styles.loading}>{t('loading')}</div>}
        {state.error && <div className={styles.error}>{state.error}</div>}

        {!state.loading && view.mode === 'domains' && (
          <DomainList domains={state.domains} onSelect={handleDomainClick} />
        )}

        {!state.loading && view.mode === 'domain-detail' && view.tab === 'tables' && (
          <TableList
            items={state.tables}
            selected={selectedAsset?.kind === 'table' ? selectedAsset.name : null}
            onSelect={name => handleAssetClick(name, 'table')}
          />
        )}

        {!state.loading && view.mode === 'domain-detail' && view.tab === 'events' && (
          <EventList
            items={state.events}
            selected={selectedAsset?.kind === 'event' ? selectedAsset.name : null}
            onSelect={name => handleAssetClick(name, 'event')}
          />
        )}

        {!state.loading && view.mode === 'domain-detail' && view.tab === 'metrics' && (
          <MetricList
            items={state.metrics}
            selected={selectedAsset?.kind === 'metric' ? selectedAsset.name : null}
            onSelect={name => handleAssetClick(name, 'metric')}
          />
        )}

        {!state.loading && view.mode === 'search' && (
          <SearchResults
            results={state.searchResults}
            onSelect={handleAssetClick}
          />
        )}
      </div>

      {selectedAsset && (
        <AssetDetail
          definition={state.assetDefinition}
          kind={selectedAsset.kind}
          name={selectedAsset.name}
          loading={state.loading}
          t={t}
          onNavigateToGraph={onNavigateToGraph}
        />
      )}
    </div>
  )
}

const DomainList: FC<{ domains: DomainEntry[]; onSelect: (d: DomainEntry) => void }> = ({ domains, onSelect }) => {
  if (!domains.length) return null
  return (
    <div className={styles.domainGrid}>
      {domains.map(d => (
        <div key={d.name} className={styles.domainCard} onClick={() => onSelect(d)}>
          <span className={styles.domainName}>{d.name}</span>
          <span className={styles.domainCounts}>
            <span>{d.table_count} T</span>
            <span>{d.event_count} E</span>
            <span>{d.metric_count} M</span>
          </span>
        </div>
      ))}
    </div>
  )
}

interface AssetListProps<T> { items: T[]; selected: string | null; onSelect: (name: string) => void }

const TableList: FC<AssetListProps<TableSummary>> = ({ items: tables, selected, onSelect }) => (
  <div className={styles.assetList}>
    {tables.map(t => (
      <div
        key={t.table_name}
        className={`${styles.assetRow} ${selected === t.table_name ? styles.assetRowSelected : ''}`}
        onClick={() => onSelect(t.table_name)}
      >
        <span className={`${styles.badge} ${styles.badgeTable}`}>{t.kind}</span>
        <span>{t.table_name}</span>
      </div>
    ))}
  </div>
)

const EventList: FC<AssetListProps<EventSummary>> = ({ items: events, selected, onSelect }) => (
  <div className={styles.assetList}>
    {events.map(e => (
      <div
        key={e.name}
        className={`${styles.assetRow} ${selected === e.name ? styles.assetRowSelected : ''}`}
        onClick={() => onSelect(e.name)}
      >
        <span className={`${styles.badge} ${styles.badgeEvent}`}>event</span>
        <span>{e.name}</span>
      </div>
    ))}
  </div>
)

const MetricList: FC<AssetListProps<MetricSummary>> = ({ items: metrics, selected, onSelect }) => (
  <div className={styles.assetList}>
    {metrics.map(m => (
      <div
        key={m.name}
        className={`${styles.assetRow} ${selected === m.name ? styles.assetRowSelected : ''}`}
        onClick={() => onSelect(m.name)}
      >
        <span className={`${styles.badge} ${styles.badgeMetric}`}>metric</span>
        <span>{m.name}</span>
      </div>
    ))}
  </div>
)

const SearchResults: FC<{ results: SchemaSearchHit[]; onSelect: (name: string, kind: AssetKind) => void }> = ({ results, onSelect }) => {
  if (!results.length) return <div className={styles.empty}>No results</div>
  return (
    <div className={styles.assetList}>
      {results.map((hit) => {
        const kind = inferKindFromId(hit.id)
        return (
          <div key={hit.id} className={styles.searchHit} onClick={() => onSelect(hit.id, kind)}>
            <span className={`${styles.badge} ${kind === 'table' ? styles.badgeTable : kind === 'event' ? styles.badgeEvent : styles.badgeMetric}`}>
              {kind}
            </span>
            <span className={styles.searchHitName}>{hit.id}</span>
            <span className={styles.searchHitScore}>{hit.score.toFixed(2)}</span>
          </div>
        )
      })}
    </div>
  )
}

function inferKindFromId(id: string): AssetKind {
  if (id.startsWith('event:') || id.startsWith('evt_')) return 'event'
  if (id.startsWith('metric:') || id.startsWith('m_')) return 'metric'
  return 'table'
}
