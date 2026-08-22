/**
 * Event kind plugin — wraps EventDefinition into the DataSourceKindPlugin interface.
 * G1 §D2/D3 aligned: schema field, terminology-aware toCorpusItem, raw-based getId,
 * CriticFields with full Record, relations with G2 types.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/kinds/event-kind
 */
import { EventDefinitionSchema, type EventDefinition } from '../types.ts'
import type { DataSourceKindPlugin, RelationDef, CriticFields, CorpusItem } from '../registry.ts'
import { isPlainObject } from '../corpus.ts'

export const eventKindPlugin: DataSourceKindPlugin<EventDefinition> = {
  kind: 'event',
  schema: EventDefinitionSchema,
  storageDir: 'events',

  getId(raw) {
    return typeof raw.name === 'string' ? raw.name : undefined
  },

  toCorpusItem(def, terminology): CorpusItem {
    const parts: string[] = []
    if (def.description) parts.push(def.description)
    // Pack params_fields (field name + field description) — aligns with D2e params+term
    if (def.params_fields) {
      for (const [fname, fdef] of Object.entries(def.params_fields)) {
        if (!isPlainObject(fdef)) continue
        parts.push(fname)
        const d = (fdef as { description?: unknown }).description
        if (typeof d === 'string' && d) parts.push(d)
      }
    }
    // Pack terminology slang aliases
    if (terminology) {
      const slangs = terminology[def.name]
      if (slangs) for (const s of slangs) parts.push(s)
    }
    return {
      id: def.name,
      ...(parts.length > 0 ? { description: parts.join(' ') } : {}),
      ...(def.metrics && Object.keys(def.metrics).length > 0 ? { metrics: def.metrics } : {}),
      payload: def,
    }
  },

  toPromptContext(def): string {
    const lines: string[] = []
    lines.push(`Event: ${def.name}`)
    if (def.description) lines.push(`Description: ${def.description}`)
    if (def.event_filter) lines.push(`Filter: ${def.event_filter}`)
    if (def.domains.length > 0) lines.push(`Domains: ${def.domains.join(', ')}`)
    if (def.params_fields && Object.keys(def.params_fields).length > 0) {
      lines.push('')
      lines.push('Parameters:')
      lines.push('| Field | Type | Description |')
      lines.push('|-------|------|-------------|')
      for (const [fname, fdef] of Object.entries(def.params_fields)) {
        lines.push(`| ${fname} | ${fdef.type || '-'} | ${fdef.description || '-'} |`)
      }
    }
    return lines.join('\n')
  },

  toCriticContext(def): CriticFields {
    return {
      eventParams: def.params_fields ?? {},
    }
  },

  relations(def): RelationDef[] {
    if (!def.external_refs || def.external_refs.length === 0) return []
    return def.external_refs.map(ref => ({
      type: 'joins' as const,
      target: ref.dim_table,
      on: ref.join_keys
        .map(k => `${k.dws_column} = ${k.dim_column}`)
        .join(' AND '),
      ...(ref.derivation ? { description: ref.derivation } : {}),
    }))
  },
}
