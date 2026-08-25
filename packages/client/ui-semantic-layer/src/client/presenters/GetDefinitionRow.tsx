import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import css from './presenters.module.css'

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

function kindBadgeClass(kind: string | undefined): string {
  if (kind === 'table') return css.badgeTable
  if (kind === 'event') return css.badgeEvent
  if (kind === 'metric') return css.badgeMetric
  return css.badge
}

export interface GetDefinitionRowProps {
  block: ToolCallBlock
  inspect?: (() => void) | undefined
}

export function GetDefinitionRow({ block, inspect }: GetDefinitionRowProps) {
  if (!('kind' in block)) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>Loading definition...</span>
        <span className={css.running}>running</span>
      </div>
    )
  }

  const meta = block.meta as DefinitionMeta | undefined
  if (!meta?.found) {
    return (
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>Not Found</span>
        <span className={css.summary}>{meta?.message ?? 'asset not found'}</span>
      </div>
    )
  }

  const relations = Array.isArray(meta.relations) ? meta.relations : []

  return (
    <div>
      <div className={css.row} onClick={inspect}>
        <IconBrowseOutline16 size={14} className={css.icon} />
        <span className={css.title}>{meta.name ?? 'Asset'}</span>
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
              domains: <span className={css.defFieldValue}>{meta.domains.join(', ')}</span>
            </span>
          )}
          {meta.columns !== undefined && (
            <span className={css.defField}>
              columns: <span className={css.defFieldValue}>{meta.columns}</span>
            </span>
          )}
          {meta.metrics !== undefined && meta.metrics > 0 && (
            <span className={css.defField}>
              metrics: <span className={css.defFieldValue}>{meta.metrics}</span>
            </span>
          )}
          {relations.length > 0 && (
            <span className={css.defField}>
              relations: <span className={css.defFieldValue}>{relations.length}</span>
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
