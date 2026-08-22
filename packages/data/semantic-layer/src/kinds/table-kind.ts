/**
 * Table kind plugin — wraps TableDefinition into the DataSourceKindPlugin interface.
 * G1 §D2/D3 aligned: schema field, raw-based getId, CriticFields with partitionCols,
 * relations with G2 types.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/kinds/table-kind
 */
import { TableDefinitionSchema, type TableDefinition } from '../types.ts'
import type { DataSourceKindPlugin, RelationDef, CriticFields, CorpusItem } from '../registry.ts'
import type { EventTerminology } from '../corpus.ts'

export const tableKindPlugin: DataSourceKindPlugin<TableDefinition> = {
  kind: 'table',
  schema: TableDefinitionSchema,
  storageDir: 'tables',

  getId(raw) {
    return typeof raw.table_name === 'string' ? raw.table_name : undefined
  },

  toCorpusItem(def, _terminology?: EventTerminology): CorpusItem | null {
    const parts: string[] = []
    parts.push(def.table_name)
    if (def.description) parts.push(def.description)
    if (def.table_comment) parts.push(def.table_comment)
    for (const col of def.columns) {
      parts.push(col.name)
      if (col.comment) parts.push(col.comment)
    }
    return {
      id: def.table_name,
      ...(parts.length > 0 ? { description: parts.join(' ') } : {}),
      payload: def,
    }
  },

  toPromptContext(def): string {
    const lines: string[] = []
    lines.push(`Table: ${def.table_name}`)
    if (def.table_comment) lines.push(`Comment: ${def.table_comment}`)
    if (def.description) lines.push(`Description: ${def.description}`)
    lines.push(`Kind: ${def.kind}`)
    lines.push(`Engine: ${def.engine}`)
    if (def.granularity) lines.push(`Granularity: ${def.granularity}`)
    if (def.domains.length > 0) lines.push(`Domains: ${def.domains.join(', ')}`)
    if (def.columns.length > 0) {
      lines.push('')
      lines.push('Columns:')
      lines.push('| Name | Type | Comment | Role |')
      lines.push('|------|------|---------|------|')
      for (const col of def.columns) {
        lines.push(`| ${col.name} | ${col.type || '-'} | ${col.comment || '-'} | ${col.role || '-'} |`)
      }
    }
    if (def.partitions.length > 0) {
      lines.push('')
      lines.push('Partitions:')
      for (const p of def.partitions) {
        lines.push(`  - ${p.name} (${p.type || 'string'})`)
      }
    }
    return lines.join('\n')
  },

  toCriticContext(def): CriticFields {
    return {
      partitionCols: def.partitions.map(p => p.name),
    }
  },

  relations(def): RelationDef[] {
    if (!def.dimension_refs || def.dimension_refs.length === 0) return []
    return def.dimension_refs.map(ref => ({
      type: 'joins' as const,
      target: ref.dim_table,
      on: ref.join_keys
        .map(k => `${k.dws_column} = ${k.dim_column}`)
        .join(' AND '),
      ...(ref.derivation ? { description: ref.derivation } : {}),
    }))
  },
}
