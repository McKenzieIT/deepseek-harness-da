import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import css from './presenters.module.css'

interface AddedRelation {
  table: string
  dim_table: string
  join_keys: Array<{ dws_column: string; dim_column: string }>
  derivation: string
}

interface RelationsMeta {
  ok: boolean
  enriched?: number
  written?: number
  added?: AddedRelation[]
}

function relationTypeClass(derivation: string): string {
  if (derivation === 'joins' || derivation === '' || derivation.includes('pk')) return css.relationJoins
  if (derivation.includes('derived')) return css.relationDerived
  return css.relationRelated
}

function relationTypeLabel(derivation: string): string {
  if (derivation === '' || derivation.includes('pk')) return 'joins'
  if (derivation.includes('derived')) return 'derived_from'
  if (derivation.includes('related') || derivation === 'semantic') return 'related_to'
  return derivation || 'joins'
}

export interface DiscoverRelationsRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
}

export function DiscoverRelationsRow({ block, inspect }: DiscoverRelationsRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>Discovering relations...</span>
        <span className={css.running}>running</span>
      </div>
    )
  }

  const meta = block.meta as RelationsMeta | undefined
  if (!meta?.ok) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>Discover Relations</span>
        <span className={css.summary}>failed</span>
      </div>
    )
  }

  const added = meta.added ?? []
  const shown = added.slice(0, 8)

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>Discover Relations</span>
        <span className={css.summary}>
          {added.length > 0
            ? `+${added.length} relation${added.length !== 1 ? 's' : ''}`
            : `${meta.enriched ?? 0} enriched`}
        </span>
      </div>
      {added.length > 0 && (
        <div className={css.diffSection}>
          {shown.map((rel, i) => (
            <div key={i} className={`${css.diffItem} ${css.diffAdded}`}>
              <span className={css.diffAddedMarker}>+</span>
              <span>{rel.table}</span>
              <span>→</span>
              <span>{rel.dim_table}</span>
              <span className={`${css.relationBadge} ${relationTypeClass(rel.derivation)}`}>
                {relationTypeLabel(rel.derivation)}
              </span>
            </div>
          ))}
          {added.length > 8 && (
            <div className={css.diffItem}>
              <span className={css.hitDomain}>+{added.length - 8} more</span>
            </div>
          )}
        </div>
      )}
      {added.length === 0 && meta.enriched !== undefined && meta.enriched > 0 && (
        <div className={css.diffSection}>
          <div className={css.diffItem}>
            <span>{meta.enriched} table{meta.enriched !== 1 ? 's' : ''} checked, no new relations found</span>
          </div>
        </div>
      )}
    </div>
  )
}
