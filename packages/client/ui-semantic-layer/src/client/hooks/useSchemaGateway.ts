import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  TableSummary,
  EventSummary,
  MetricSummary,
  SchemaSearchHit,
  DomainEntry,
  Json,
  SchemaGatewayClient,
} from '../schemaGatewayBridge.ts'

export type { SchemaGatewayClient } from '../schemaGatewayBridge.ts'

export type AssetKind = 'table' | 'event' | 'metric'

export interface SchemaGatewayState {
  domains: DomainEntry[]
  tables: TableSummary[]
  events: EventSummary[]
  metrics: MetricSummary[]
  searchResults: SchemaSearchHit[]
  assetDefinition: Json | null
  loading: boolean
  error: string | null
}

const INITIAL: SchemaGatewayState = {
  domains: [],
  tables: [],
  events: [],
  metrics: [],
  searchResults: [],
  assetDefinition: null,
  loading: false,
  error: null,
}

export function useSchemaGateway(client: SchemaGatewayClient | null) {
  const [state, setState] = useState<SchemaGatewayState>(INITIAL)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadDomains = useCallback(async () => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const domains = await client.listDomains()
      setState(s => ({ ...s, domains, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [client])

  const loadTablesForDomain = useCallback(async (domain?: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const all = await client.listTables()
      const tables = domain ? all.filter(t => t.domains.includes(domain)) : all
      setState(s => ({ ...s, tables, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [client])

  const loadEventsForDomain = useCallback(async (domain?: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const all = await client.listEvents()
      const events = domain ? all.filter(e => e.domains.includes(domain)) : all
      setState(s => ({ ...s, events, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [client])

  const loadMetricsForDomain = useCallback(async (domain?: string) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const all = await client.listMetrics()
      const metrics = domain ? all.filter(m => m.domains.includes(domain)) : all
      setState(s => ({ ...s, metrics, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [client])

  const loadAssetDefinition = useCallback(async (name: string, kind: AssetKind) => {
    if (!client) return
    setState(s => ({ ...s, loading: true, error: null, assetDefinition: null }))
    try {
      let def: Json | null
      if (kind === 'table') def = await client.getTableDefinition(name)
      else if (kind === 'event') def = await client.getEventDefinition(name)
      else def = await client.getMetricDefinition(name)
      setState(s => ({ ...s, assetDefinition: def, loading: false }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }, [client])

  const search = useCallback((query: string, topK?: number) => {
    if (!client) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setState(s => ({ ...s, searchResults: [] }))
      return
    }
    debounceRef.current = setTimeout(async () => {
      setState(s => ({ ...s, loading: true, error: null }))
      try {
        const searchResults = await client.search(query, topK ?? 20)
        setState(s => ({ ...s, searchResults, loading: false }))
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }))
      }
    }, 300)
  }, [client])

  useEffect(() => { void loadDomains() }, [loadDomains])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  return {
    state,
    loadDomains,
    loadTablesForDomain,
    loadEventsForDomain,
    loadMetricsForDomain,
    loadAssetDefinition,
    search,
  }
}
