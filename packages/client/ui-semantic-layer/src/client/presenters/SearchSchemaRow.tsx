import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SemanticLayerTranslate } from '../locales.ts'
import css from './presenters.module.css'
import { kindBadgeClass } from './kindBadge.ts'

interface SearchSchemaMeta {
  ok: boolean
  hits?: Array<{ id: string; kind?: string; domains?: string[]; description?: string }>
  message?: string
}

export interface SearchSchemaRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
  t: SemanticLayerTranslate
}

export function SearchSchemaRow({ block, inspect, t }: SearchSchemaRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.search.loading')}</span>
        <span className={css.running}>{t('presenter.running')}</span>
      </div>
    )
  }

  const meta = block.meta as SearchSchemaMeta | undefined
  if (!meta?.ok) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.search.title')}</span>
        <span className={css.summary}>{meta?.message ?? t('presenter.failed')}</span>
      </div>
    )
  }

  const hits = meta.hits ?? []
  const shown = hits.slice(0, 5)

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>{t('presenter.search.title')}</span>
        <span className={css.summary}>{t('presenter.search.hits', { count: hits.length })}</span>
      </div>
      {shown.length > 0 && (
        <div className={css.hitList}>
          {shown.map(hit => (
            <div key={hit.id} className={css.hitItem}>
              <span className={css.hitName}>{hit.id}</span>
              {hit.kind !== undefined && (
                <span className={`${css.badge} ${kindBadgeClass(hit.kind)}`}>{hit.kind}</span>
              )}
              {hit.domains !== undefined && hit.domains.length > 0 && (
                <span className={css.hitDomain}>{hit.domains.join(', ')}</span>
              )}
              {hit.description !== undefined && (
                <span className={css.hitDescription}>{hit.description}</span>
              )}
            </div>
          ))}
          {hits.length > 5 && (
            <div className={css.hitItem}>
              <span className={css.hitDomain}>{t('presenter.more', { count: hits.length - 5 })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
