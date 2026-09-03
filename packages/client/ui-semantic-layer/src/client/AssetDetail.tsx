import type { FC } from 'react'
import type { Json } from './schemaGatewayBridge.ts'
import type { AssetKind } from './hooks/useSchemaGateway.ts'

export interface AssetDetailProps {
  definition: Json | null
  kind: AssetKind
  name: string
  loading: boolean
  t: (key: string, params?: Record<string, unknown>) => string
  onNavigateToGraph?: ((assetId: string) => void) | undefined
}

export const AssetDetail: FC<AssetDetailProps> = ({ definition, kind, name, loading, t, onNavigateToGraph }) => {
  if (loading) return <div className="sl-asset-detail sl-asset-detail--loading">{t('loading')}</div>
  if (!definition) return <div className="sl-asset-detail sl-asset-detail--empty">{t('schema.detail.empty')}</div>

  const def = definition as Record<string, Json>

  return (
    <div className="sl-asset-detail">
      <div className="sl-asset-detail__header">
        <h3 className="sl-asset-detail__title">{name}</h3>
        {def.description && <p className="sl-asset-detail__desc">{asString(def.description)}</p>}
        {def.confirmation_status && (
          <span className={`sl-asset-detail__status sl-asset-detail__status--${asString(def.confirmation_status)}`}>
            {asString(def.confirmation_status)}
          </span>
        )}
      </div>

      <div className="sl-asset-detail__body">
        {kind === 'table' && <TableDetail def={def} t={t} />}
        {kind === 'event' && <EventDetail def={def} t={t} />}
        {kind === 'metric' && <MetricDetail def={def} t={t} />}
      </div>

      <div className="sl-asset-detail__footer">
        <button
          className="sl-asset-detail__graph-btn"
          onClick={() => onNavigateToGraph?.(name)}
          disabled={!onNavigateToGraph}
        >
          {t('schema.detail.viewInGraph')}
        </button>
      </div>
    </div>
  )
}

const TableDetail: FC<{ def: Record<string, Json>; t: (key: string) => string }> = ({ def, t }) => {
  const columns = asArray(def.columns)
  const metrics = asRecord(def.metrics)
  const dimensionRefs = asArray(def.dimension_refs)
  const granularity = def.granularity ? asString(def.granularity) : null
  const partitions = asArray(def.partitions)

  return (
    <>
      {granularity && (
        <div className="sl-asset-detail__section">
          <span className="sl-asset-detail__badge">{granularity}</span>
        </div>
      )}

      {columns.length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.columns')} ({columns.length})</h4>
          <table className="sl-asset-detail__table">
            <thead>
              <tr>
                <th>{t('schema.detail.col.name')}</th>
                <th>{t('schema.detail.col.type')}</th>
                <th>{t('schema.detail.col.comment')}</th>
                <th>{t('schema.detail.col.role')}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => {
                const c = col as Record<string, Json>
                return (
                  <tr key={i}>
                    <td>{asString(c.name)}</td>
                    <td>{asString(c.type)}</td>
                    <td>{asString(c.comment)}</td>
                    <td>{asString(c.role)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(metrics).length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.metrics')} ({Object.keys(metrics).length})</h4>
          <ul className="sl-asset-detail__list">
            {Object.entries(metrics).map(([k, v]) => (
              <li key={k}><strong>{k}</strong>: {asString(asRecord(v).description)}</li>
            ))}
          </ul>
        </div>
      )}

      {dimensionRefs.length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.dimensionRefs')} ({dimensionRefs.length})</h4>
          <ul className="sl-asset-detail__list">
            {dimensionRefs.map((ref, i) => {
              const r = ref as Record<string, Json>
              const joinKeys = asArray(r.join_keys)
              return (
                <li key={i}>
                  <strong>{asString(r.dim_table)}</strong>
                  {joinKeys.length > 0 && (
                    <span className="sl-asset-detail__join-keys">
                      {' '}ON {joinKeys.map((k) => {
                        const kk = asRecord(k)
                        return `${asString(kk.source)}=${asString(kk.target)}`
                      }).join(', ')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {partitions.length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.partitions')}</h4>
          <ul className="sl-asset-detail__list">
            {partitions.map((p, i) => <li key={i}>{asString(asRecord(p).name ?? p)}</li>)}
          </ul>
        </div>
      )}
    </>
  )
}

const EventDetail: FC<{ def: Record<string, Json>; t: (key: string) => string }> = ({ def, t }) => {
  const paramsFields = asRecord(def.params_fields)
  const metrics = asRecord(def.metrics)
  const externalRefs = asArray(def.external_refs)
  const eventFilter = def.event_filter ? asString(def.event_filter) : null

  return (
    <>
      {Object.keys(paramsFields).length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.params')} ({Object.keys(paramsFields).length})</h4>
          <table className="sl-asset-detail__table">
            <thead>
              <tr>
                <th>{t('schema.detail.col.name')}</th>
                <th>{t('schema.detail.col.type')}</th>
                <th>{t('schema.detail.col.description')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(paramsFields).map(([k, v]) => {
                const field = v as Record<string, Json>
                return (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{asString(field.type)}</td>
                    <td>{asString(field.description)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(metrics).length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.metrics')} ({Object.keys(metrics).length})</h4>
          <ul className="sl-asset-detail__list">
            {Object.entries(metrics).map(([k, v]) => (
              <li key={k}><strong>{k}</strong>: {asString(asRecord(v).description)}</li>
            ))}
          </ul>
        </div>
      )}

      {externalRefs.length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.externalRefs')}</h4>
          <ul className="sl-asset-detail__list">
            {externalRefs.map((ref, i) => <li key={i}>{asString(ref)}</li>)}
          </ul>
        </div>
      )}

      {eventFilter && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.eventFilter')}</h4>
          <code className="sl-asset-detail__code">{eventFilter}</code>
        </div>
      )}
    </>
  )
}

const MetricDetail: FC<{ def: Record<string, Json>; t: (key: string) => string }> = ({ def, t }) => {
  const computation = def.computation as Record<string, Json> | undefined
  const caliberVariants = asArray(def.caliber_variants)
  const hostTable = def.host_table ? asString(def.host_table) : null
  const hostEvent = def.host_event ? asString(def.host_event) : null

  return (
    <>
      {computation && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.computation')}</h4>
          {computation.sql && <code className="sl-asset-detail__code">{asString(computation.sql)}</code>}
          {computation.metadata && (
            <p className="sl-asset-detail__meta">
              {t('schema.detail.aggregation')}: {asString(asRecord(computation.metadata).aggregation)}
            </p>
          )}
        </div>
      )}

      {caliberVariants.length > 0 && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.caliberVariants')} ({caliberVariants.length})</h4>
          <ul className="sl-asset-detail__list">
            {caliberVariants.map((v, i) => {
              const variant = v as Record<string, Json>
              return <li key={i}><strong>{asString(variant.name)}</strong>: {asString(variant.description)}</li>
            })}
          </ul>
        </div>
      )}

      {(hostTable || hostEvent) && (
        <div className="sl-asset-detail__section">
          <h4>{t('schema.detail.host')}</h4>
          {hostTable && <p>{t('schema.detail.hostTable')}: {hostTable}</p>}
          {hostEvent && <p>{t('schema.detail.hostEvent')}: {hostEvent}</p>}
        </div>
      )}
    </>
  )
}

function asArray(v: Json | undefined): Json[] {
  if (Array.isArray(v)) return v as Json[]
  return []
}

function asRecord(v: Json | undefined): Record<string, Json> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, Json>
  return {}
}

function asString(v: Json | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}
