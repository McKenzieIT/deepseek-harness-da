import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import css from './presenters.module.css'

interface SearchSchemaMeta {
  ok: boolean
  hits?: Array<{ id: string; kind?: string; domains?: string[]; description?: string }>
  message?: string
}

function kindBadgeClass(kind: string | undefined) {
  if (kind === 'table') return css.badgeTable ?? ''
  if (kind === 'event') return css.badgeEvent ?? ''
  if (kind === 'metric') return css.badgeMetric ?? ''
  return css.badge ?? ''
}

export interface SearchSchemaRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
}

export function SearchSchemaRow({ block, inspect }: SearchSchemaRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>Searching schema...</span>
        <span className={css.running}>running</span>
      </div>
    )
  }

  const meta = block.meta as SearchSchemaMeta | undefined
  if (!meta?.ok) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>Search Schema</span>
        <span className={css.summary}>{meta?.message ?? 'failed'}</span>
      </div>
    )
  }

  const hits = meta.hits ?? []
  const shown = hits.slice(0, 5)

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconSearchOutline16 size={14} className={css.icon} />
        <span className={css.title}>Search Schema</span>
        <span className={css.summary}>{hits.length} asset{hits.length !== 1 ? 's' : ''}</span>
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
              <span className={css.hitDomain}>+{hits.length - 5} more</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
