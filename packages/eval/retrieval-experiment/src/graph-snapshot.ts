import { loadEvents, loadTables, loadConcepts } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'
import {
  EventDefinitionSchema,
  TableDefinitionSchema,
  ConceptDefinitionSchema,
  type EventDefinition,
  type TableDefinition,
  type MetricDefinition,
} from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import { RelationGraph, type NodeAliasData } from '@deepseek-ai/dsh-semantic-layer/src/relation-graph.ts'
import type { RelationDef } from '@deepseek-ai/dsh-semantic-layer/src/registry.ts'
import { eventKindPlugin } from '@deepseek-ai/dsh-semantic-layer/src/kinds/event-kind.ts'
import { tableKindPlugin } from '@deepseek-ai/dsh-semantic-layer/src/kinds/table-kind.ts'
import { conceptKindPlugin } from '@deepseek-ai/dsh-semantic-layer/src/kinds/concept-kind.ts'
import {
  extractMetricsFromTable,
  extractMetricsFromEvent,
  deriveMetricRelations,
  projectMetricCorpusItem,
} from '@deepseek-ai/dsh-semantic-layer/src/metrics.ts'
import { Bm25Linker, type DataSourceDoc } from '@deepseek-ai/dsh-nl2sql-engine/src/bm25-linking.ts'
import type { GraphSnapshotConfig, GraphSnapshot, GraphSnapshotStats, ConceptDef } from './types.ts'

interface ConceptRow {
  readonly name: string
  readonly description: string
  readonly pref_label?: string | undefined
  readonly alt_labels: string[]
}

function loadAndParse(semanticRoot: string): {
  tables: TableDefinition[]
  events: EventDefinition[]
  concepts: ConceptRow[]
} {
  const tables: TableDefinition[] = []
  for (const t of loadTables(semanticRoot)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (r.success) tables.push(r.data)
  }
  const events: EventDefinition[] = []
  for (const e of loadEvents(semanticRoot)) {
    const r = EventDefinitionSchema.safeParse(e.raw)
    if (r.success) events.push(r.data)
  }
  const concepts: ConceptRow[] = []
  for (const c of loadConcepts(semanticRoot)) {
    const r = ConceptDefinitionSchema.safeParse(c.raw)
    if (r.success) {
      concepts.push({
        name: r.data.name,
        description: r.data.description,
        ...(r.data.pref_label !== undefined ? { pref_label: r.data.pref_label } : {}),
        alt_labels: r.data.alt_labels,
      })
    }
  }
  return { tables, events, concepts }
}

function stripTableAliases(def: TableDefinition): TableDefinition {
  const { pref_label: _, ...rest } = def
  return { ...rest, alt_labels: [] }
}

function stripEventAliases(def: EventDefinition): EventDefinition {
  const { pref_label: _, ...rest } = def
  return { ...rest, alt_labels: [] }
}

function stripMetricAliases(def: MetricDefinition): MetricDefinition {
  const { pref_label: _, ...rest } = def
  return { ...rest, alt_labels: [] }
}

function stripConceptAliases(c: ConceptRow): ConceptRow {
  return { name: c.name, description: c.description, alt_labels: [] }
}

function injectExtraAliases(
  aliasData: NodeAliasData[],
  extras: ReadonlyMap<string, readonly string[]>,
): void {
  for (const [nodeId, extraLabels] of extras) {
    const existing = aliasData.find(a => a.nodeId === nodeId)
    if (existing) {
      const merged = [...(existing.altLabels ?? []), ...extraLabels]
      const idx = aliasData.indexOf(existing)
      aliasData[idx] = { nodeId, prefLabel: existing.prefLabel, altLabels: merged }
    } else {
      aliasData.push({ nodeId, altLabels: extraLabels })
    }
  }
}

/**
 * Build a graph snapshot at a given coverage level. Loads definitions from
 * disk, transforms them per config, then constructs the RelationGraph + BM25
 * corpus pair. The logic mirrors SemanticLayerService.getRelationGraph() and
 * loadRetrievalCorpusAll() but operates on in-memory transformed definitions.
 */
export function buildGraphSnapshot(
  semanticRoot: string,
  config: GraphSnapshotConfig,
  label: string,
): GraphSnapshot {
  const raw = loadAndParse(semanticRoot)
  const strip = config.stripAliases === true

  const tables = strip ? raw.tables.map(stripTableAliases) : raw.tables
  const events = strip ? raw.events.map(stripEventAliases) : raw.events

  let concepts: ConceptRow[]
  if (config.stripConcepts === true) {
    concepts = []
  } else {
    const base: ConceptRow[] = strip
      ? raw.concepts.map(stripConceptAliases)
      : [...raw.concepts]
    if (config.extraConcepts) {
      for (const ec of config.extraConcepts) {
        base.push({
          name: ec.name,
          description: ec.description ?? '',
          ...(ec.pref_label !== undefined ? { pref_label: ec.pref_label } : {}),
          alt_labels: [...(ec.alt_labels ?? [])],
        })
      }
    }
    concepts = base
  }

  const entries: { sourceId: string; relations: RelationDef[] }[] = []
  const aliasData: NodeAliasData[] = []
  const assetDomains: { sourceId: string; domains: string[] }[] = []

  for (const t of tables) {
    entries.push({ sourceId: t.table_name, relations: tableKindPlugin.relations(t) })
    if (t.pref_label || t.alt_labels.length > 0) {
      aliasData.push({ nodeId: t.table_name, prefLabel: t.pref_label, altLabels: t.alt_labels })
    }
    if (t.domains.length > 0) assetDomains.push({ sourceId: t.table_name, domains: t.domains })
    for (const m of extractMetricsFromTable(t)) {
      const md = strip ? stripMetricAliases(m) : m
      entries.push({ sourceId: md.name, relations: deriveMetricRelations(md) })
      if (md.pref_label || md.alt_labels.length > 0) {
        aliasData.push({ nodeId: md.name, prefLabel: md.pref_label, altLabels: md.alt_labels })
      }
    }
  }

  for (const e of events) {
    entries.push({ sourceId: e.name, relations: eventKindPlugin.relations(e) })
    if (e.pref_label || e.alt_labels.length > 0) {
      aliasData.push({ nodeId: e.name, prefLabel: e.pref_label, altLabels: e.alt_labels })
    }
    if (e.domains.length > 0) assetDomains.push({ sourceId: e.name, domains: e.domains })
    for (const m of extractMetricsFromEvent(e)) {
      const md = strip ? stripMetricAliases(m) : m
      entries.push({ sourceId: md.name, relations: deriveMetricRelations(md) })
      if (md.pref_label || md.alt_labels.length > 0) {
        aliasData.push({ nodeId: md.name, prefLabel: md.pref_label, altLabels: md.alt_labels })
      }
    }
  }

  const conceptNames = new Set<string>()
  for (const c of concepts) {
    conceptNames.add(c.name)
    entries.push({ sourceId: `concept:${c.name}`, relations: [] })
    if (c.pref_label || c.alt_labels.length > 0) {
      aliasData.push({ nodeId: `concept:${c.name}`, prefLabel: c.pref_label, altLabels: c.alt_labels })
    }
  }

  if (conceptNames.size > 0) {
    for (const { sourceId, domains } of assetDomains) {
      for (const d of domains) {
        if (conceptNames.has(d)) {
          entries.push({ sourceId: `concept:${d}`, relations: [{ type: 'related_to', target: sourceId }] })
        }
      }
    }
  }

  if (config.extraAliases) {
    injectExtraAliases(aliasData, config.extraAliases)
  }

  const graph = new RelationGraph()
  graph.build(entries, aliasData)

  const corpus = buildCorpusFromDefs(tables, events, concepts)
  const linker = new Bm25Linker(corpus)

  const stats: GraphSnapshotStats = {
    nodeCount: entries.length,
    aliasCount: aliasData.reduce((n, a) => n + (a.altLabels?.length ?? 0) + (a.prefLabel ? 1 : 0), 0),
    conceptCount: conceptNames.size,
  }

  return { level: label, graph, linker, stats }
}

function buildCorpusFromDefs(
  tables: readonly TableDefinition[],
  events: readonly EventDefinition[],
  concepts: readonly ConceptRow[],
): readonly DataSourceDoc[] {
  const out: DataSourceDoc[] = []
  for (const t of tables) {
    const item = tableKindPlugin.toCorpusItem(t)
    if (item) out.push(item as DataSourceDoc)
    for (const m of extractMetricsFromTable(t)) {
      const mi = projectMetricCorpusItem(m)
      if (mi) out.push(mi as DataSourceDoc)
    }
  }
  for (const e of events) {
    const item = eventKindPlugin.toCorpusItem(e)
    if (item) out.push(item as DataSourceDoc)
    for (const m of extractMetricsFromEvent(e)) {
      const mi = projectMetricCorpusItem(m)
      if (mi) out.push(mi as DataSourceDoc)
    }
  }
  for (const c of concepts) {
    type ConceptInput = Parameters<typeof conceptKindPlugin.toCorpusItem>[0]
    const asConcept = { name: c.name, description: c.description, alt_labels: c.alt_labels } as ConceptInput
    if (c.pref_label !== undefined) {
      (asConcept as Record<string, unknown>).pref_label = c.pref_label
    }
    const item = conceptKindPlugin.toCorpusItem(asConcept)
    if (item) out.push(item as DataSourceDoc)
  }
  return out
}

export function snapshotLevel0(semanticRoot: string): GraphSnapshot {
  return buildGraphSnapshot(semanticRoot, { stripAliases: true, stripConcepts: true }, 'L0')
}

export function snapshotLevel1(semanticRoot: string): GraphSnapshot {
  return buildGraphSnapshot(semanticRoot, {}, 'L1')
}

export function snapshotLevel2(
  semanticRoot: string,
  extraAliases: ReadonlyMap<string, readonly string[]>,
  extraConcepts?: readonly ConceptDef[] | undefined,
): GraphSnapshot {
  return buildGraphSnapshot(semanticRoot, { extraAliases, extraConcepts }, 'L2')
}

export function snapshotLevel3(
  semanticRoot: string,
  extraAliases: ReadonlyMap<string, readonly string[]>,
  extraConcepts?: readonly ConceptDef[] | undefined,
): GraphSnapshot {
  return buildGraphSnapshot(semanticRoot, { extraAliases, extraConcepts }, 'L3')
}
