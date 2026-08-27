// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { SchemaExplorer } from '../src/client/SchemaExplorer.tsx'
import type { SchemaGatewayClient, DomainEntry, TableSummary, EventSummary, MetricSummary, SchemaSearchHit } from '../src/client/schemaGatewayBridge.ts'

const t = (key: string): string => key

const DOMAINS: DomainEntry[] = [
  { name: '角色', table_count: 5, event_count: 2, metric_count: 3 },
  { name: '付费经济', table_count: 8, event_count: 4, metric_count: 6 },
  { name: '社交', table_count: 3, event_count: 1, metric_count: 2 },
]

const TABLES: TableSummary[] = [
  { table_name: 'dws_acc_summary_df', kind: 'dws', domains: ['角色'], description: '账号汇总', column_count: 69, metric_count: 6 },
  { table_name: 'dim_role', kind: 'dim', domains: ['角色'], description: '角色维度表', column_count: 15, metric_count: 0 },
]

const EVENTS: EventSummary[] = [
  { name: 'recharge_event', domains: ['付费经济'], description: '充值事件', param_count: 5, metric_count: 2 },
]

const METRICS: MetricSummary[] = [
  { name: 'daily_revenue', domains: ['付费经济'], description: '日收入', source: 'dws_payment_df', aggregation: 'sum' },
]

const SEARCH_RESULTS: SchemaSearchHit[] = [
  { id: 'dws_acc_summary_df', score: 0.85, description: '账号汇总' },
  { id: 'event:recharge_event', score: 0.72 },
]

function makeClient(): SchemaGatewayClient {
  return {
    listDomains: vi.fn<[], Promise<DomainEntry[]>>().mockResolvedValue(DOMAINS),
    listTables: vi.fn<[], Promise<TableSummary[]>>().mockResolvedValue(TABLES),
    listEvents: vi.fn<[], Promise<EventSummary[]>>().mockResolvedValue(EVENTS),
    listMetrics: vi.fn<[], Promise<MetricSummary[]>>().mockResolvedValue(METRICS),
    getTableDefinition: vi.fn().mockResolvedValue({ table_name: 'dws_acc_summary_df', columns: [], metrics: {}, dimension_refs: [] }),
    getEventDefinition: vi.fn().mockResolvedValue({ name: 'recharge_event', params_fields: {}, metrics: {} }),
    getMetricDefinition: vi.fn().mockResolvedValue({ name: 'daily_revenue', computation: {} }),
    search: vi.fn<[string, number?], Promise<SchemaSearchHit[]>>().mockResolvedValue(SEARCH_RESULTS),
    getCoverageStats: vi.fn().mockResolvedValue({ table_count: 10, event_count: 5, metric_count: 3, domain_counts: {} }),
  }
}

describe('SchemaExplorer', () => {
  let client: SchemaGatewayClient

  beforeEach(() => {
    client = makeClient()
    vi.useFakeTimers()
  })

  it('renders domain cards on mount', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    await waitFor(() => {
      expect(container.textContent).toContain('角色')
      expect(container.textContent).toContain('付费经济')
      expect(container.textContent).toContain('社交')
    })
    expect(client.listDomains).toHaveBeenCalledOnce()
  })

  it('shows domain counts', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    await waitFor(() => {
      expect(container.textContent).toContain('5 T')
      expect(container.textContent).toContain('2 E')
      expect(container.textContent).toContain('3 M')
    })
  })

  it('navigates to domain detail on click', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    await waitFor(() => expect(container.textContent).toContain('角色'))
    const domainCards = container.querySelectorAll('[class*="domainCard"]')
    fireEvent.click(domainCards[0])
    await waitFor(() => {
      expect(client.listTables).toHaveBeenCalled()
      expect(container.textContent).toContain('dws_acc_summary_df')
    })
  })

  it('shows tables tab with kind badges', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    await waitFor(() => expect(container.textContent).toContain('角色'))
    const domainCards = container.querySelectorAll('[class*="domainCard"]')
    fireEvent.click(domainCards[0])
    await waitFor(() => {
      expect(container.textContent).toContain('dws')
      expect(container.textContent).toContain('dim')
    })
  })

  it('performs debounced search', async () => {
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    const input = container.querySelector('input')!
    fireEvent.change(input, { target: { value: '充值' } })
    expect(client.search).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(client.search).toHaveBeenCalledWith('充值', 20)
  })

  it('renders nothing when client is null', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={null} t={t} />)
    await waitFor(() => {
      expect(container.querySelector('input')).not.toBeNull()
    })
  })

  it('shows breadcrumb in domain-detail mode with back navigation', async () => {
    vi.useRealTimers()
    const { container } = render(<SchemaExplorer client={client} t={t} />)
    await waitFor(() => expect(container.textContent).toContain('角色'))
    const domainCards = container.querySelectorAll('[class*="domainCard"]')
    fireEvent.click(domainCards[0])
    await waitFor(() => expect(container.textContent).toContain('schema.domains'))
    const backLink = container.querySelector('[class*="breadcrumbLink"]')!
    fireEvent.click(backLink)
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="domainCard"]').length).toBe(3)
    })
  })

  it('calls onNavigateToGraph when button clicked in asset detail', async () => {
    vi.useRealTimers()
    const onNav = vi.fn()
    const { container } = render(<SchemaExplorer client={client} t={t} onNavigateToGraph={onNav} />)
    await waitFor(() => expect(container.textContent).toContain('角色'))
    const domainCards = container.querySelectorAll('[class*="domainCard"]')
    fireEvent.click(domainCards[0])
    await waitFor(() => expect(container.textContent).toContain('dws_acc_summary_df'))
    const assetRows = container.querySelectorAll('[class*="assetRow"]')
    fireEvent.click(assetRows[0])
    await waitFor(() => expect(container.querySelector('.sl-asset-detail__graph-btn')).not.toBeNull())
    const btn = container.querySelector('.sl-asset-detail__graph-btn')!
    fireEvent.click(btn)
    expect(onNav).toHaveBeenCalledWith('dws_acc_summary_df')
  })
})
