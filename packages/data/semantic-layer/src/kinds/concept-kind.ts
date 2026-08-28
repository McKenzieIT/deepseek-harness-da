/**
 * Concept kind plugin — wraps ConceptDefinition into the DataSourceKindPlugin interface.
 * CL-2: concepts are first-class graph nodes representing semantic domains.
 * Edges are derived from asset.domains (not declared by the concept itself).
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/kinds/concept-kind
 */
import { ConceptDefinitionSchema, type ConceptDefinition } from '../types.ts'
import type { DataSourceKindPlugin, RelationDef, CorpusItem } from '../registry.ts'

export const conceptKindPlugin: DataSourceKindPlugin<ConceptDefinition> = {
  kind: 'concept',
  schema: ConceptDefinitionSchema,
  storageDir: 'concepts',

  getId(raw) {
    return typeof raw.name === 'string' ? `concept:${raw.name}` : undefined
  },

  toCorpusItem(def): CorpusItem | null {
    const parts: string[] = [def.name]
    if (def.description) parts.push(def.description)
    if (def.pref_label) parts.push(def.pref_label)
    if (def.alt_labels) {
      for (const s of def.alt_labels) parts.push(s)
    }
    return {
      id: `concept:${def.name}`,
      description: parts.join(' '),
    }
  },

  toPromptContext(def): string {
    const lines: string[] = []
    lines.push(`Concept: ${def.name}`)
    if (def.description) lines.push(`Description: ${def.description}`)
    if (def.pref_label) lines.push(`Preferred Label: ${def.pref_label}`)
    if (def.alt_labels && def.alt_labels.length > 0) {
      lines.push(`Aliases: ${def.alt_labels.join(', ')}`)
    }
    return lines.join('\n')
  },

  relations(_def): RelationDef[] {
    return []
  },
}
