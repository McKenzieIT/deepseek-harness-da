import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SemanticLayerTranslate } from '../locales.ts'
import css from './presenters.module.css'
import { kindBadgeClass } from './kindBadge.ts'

interface DefinitionMeta {
  found: boolean
  kind?: string
  name?: string
  domains?: string[]
  description?: string
  columns?: number
  metrics?: number
  relations?: unknown
  confirmation?: string
  message?: string
}

export interface GetDefinitionRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
  t: SemanticLayerTranslate
}

export function GetDefinitionRow({ block, inspect, t }: GetDefinitionRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.definition.loading')}</span>
        <span className={css.running}>{t('presenter.running')}</span>
      </div>
    )
  }

  const meta = block.meta as DefinitionMeta | undefined
  if (!meta?.found) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.definition.notFound')}</span>
        <span className={css.summary}>{meta?.message ?? t('presenter.definition.notFound')}</span>
      </div>
    )
  }

  const relations = Array.isArray(meta.relations) ? meta.relations : []

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>{meta.name ?? t('presenter.definition.asset')}</span>
        {meta.kind !== undefined && (
          <span className={`${css.badge} ${kindBadgeClass(meta.kind)}`}>{meta.kind}</span>
        )}
        {meta.confirmation !== undefined && (
          <span className={css.badge}>{meta.confirmation}</span>
        )}
      </div>
      <div className={css.defSection}>
        <div className={css.defMeta}>
          {meta.domains !== undefined && meta.domains.length > 0 && (
            <span className={css.defField}>
              {t('presenter.definition.domainsLabel')}: <span className={css.defFieldValue}>{meta.domains.join(', ')}</span>
            </span>
          )}
          {meta.columns !== undefined && (
            <span className={css.defField}>
              {t('presenter.definition.columnsLabel')}: <span className={css.defFieldValue}>{meta.columns}</span>
            </span>
          )}
          {meta.metrics !== undefined && meta.metrics > 0 && (
            <span className={css.defField}>
              {t('presenter.definition.metricsLabel')}: <span className={css.defFieldValue}>{meta.metrics}</span>
            </span>
          )}
          {relations.length > 0 && (
            <span className={css.defField}>
              {t('presenter.definition.relationsLabel')}: <span className={css.defFieldValue}>{relations.length}</span>
            </span>
          )}
        </div>
        {meta.description !== undefined && (
          <div className={css.hitDescription}>{meta.description}</div>
        )}
      </div>
    </div>
  )
}
