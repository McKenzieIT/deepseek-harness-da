import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SemanticLayerTranslate } from '../locales.ts'
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

function relationTypeClass(derivation: string) {
  if (derivation === 'joins' || derivation === '' || derivation.includes('pk')) return css.relationJoins ?? ''
  if (derivation.includes('derived')) return css.relationDerived ?? ''
  return css.relationRelated ?? ''
}

function relationTypeLabel(derivation: string, t: SemanticLayerTranslate): string {
  if (derivation === '' || derivation.includes('pk')) return t('presenter.relations.kindJoins')
  if (derivation.includes('derived')) return t('presenter.relations.kindDerived')
  if (derivation.includes('related') || derivation === 'semantic') return t('presenter.relations.kindRelated')
  return derivation || t('presenter.relations.kindJoins')
}

export interface DiscoverRelationsRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
  t: SemanticLayerTranslate
}

export function DiscoverRelationsRow({ block, inspect, t }: DiscoverRelationsRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.relations.loading')}</span>
        <span className={css.running}>{t('presenter.running')}</span>
      </div>
    )
  }

  const meta = block.meta as RelationsMeta | undefined
  if (!meta?.ok) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.relations.title')}</span>
        <span className={css.summary}>{t('presenter.failed')}</span>
      </div>
    )
  }

  const added = meta.added ?? []
  const shown = added.slice(0, 8)

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconDataOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.relations.title')}</span>
        <span className={css.summary}>
          {added.length > 0
            ? t('presenter.relations.summaryAdded', { count: added.length })
            : t('presenter.relations.summaryEnriched', { count: meta.enriched ?? 0 })}
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
                {relationTypeLabel(rel.derivation, t)}
              </span>
            </div>
          ))}
          {added.length > 8 && (
            <div className={css.diffItem}>
              <span className={css.hitDomain}>{t('presenter.more', { count: added.length - 8 })}</span>
            </div>
          )}
        </div>
      )}
      {added.length === 0 && meta.enriched !== undefined && meta.enriched > 0 && (
        <div className={css.diffSection}>
          <div className={css.diffItem}>
            <span>{t('presenter.relations.checkedNoNew', { count: meta.enriched })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
