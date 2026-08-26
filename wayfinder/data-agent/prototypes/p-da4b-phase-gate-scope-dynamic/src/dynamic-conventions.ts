/**
 * P-DA4b §1 — Dynamic SQL conventions assembly for the GENERATION phase.
 *
 * Replaces the hardcoded `SQL_CONVENTIONS` const (phase-gate.ts:120) with a
 * function that composes the conventions section from:
 *   (a) the active scope's `config.yaml` → `event_view.full_name` + `params_extract_template`
 *   (b) the generic engine conventions → `loadConventions('maxcompute')` key_differences
 *
 * Called inside `system-prompt/assemble` when `phase === Phase.GENERATION`.
 *
 * Design: a pure function (no ctx dependency beyond the two inputs), so it is
 * testable without a Cordis context and composable with delegate_query's
 * per-scope engine instantiation (E-DA4 findings: engine needs event_view
 * injected into candidateTables; the same config feeds the prompt here).
 */
import { loadConventions } from '@deepseek-ai/dsh-query-maxcompute/src/conventions.ts'
import { loadConfig, resolveSemanticLayer } from '@deepseek-ai/dsh-semantic-layer'

/**
 * The scope-specific fields needed to assemble SQL conventions.
 * Extracted from `config.yaml` → `event_view` + `partition`.
 */
export interface ScopeConventionsInput {
  /** e.g. 'ieu_ods.ods_10000251_all_view' (K11) or 'hdyl_data_sg.ods_10000334_all_view' (X63) */
  readonly eventViewFullName: string
  /** e.g. "GET_JSON_OBJECT(params, '$.{field_name}')" */
  readonly paramsExtractTemplate: string
  /** Partition field name, default 'ds' */
  readonly partitionField: string
  /** Partition format, default 'yyyyMMdd' */
  readonly partitionFormat: string
}

/**
 * Extract `ScopeConventionsInput` from a scope's config.yaml via its semanticRoot.
 * Returns null when the semanticRoot is empty or config.yaml is missing/malformed.
 */
export function extractScopeConventions(semanticRoot: string): ScopeConventionsInput | null {
  if (!semanticRoot) return null
  const layerDir = resolveSemanticLayer(semanticRoot)
  if (!layerDir) return null

  let cfg: Record<string, unknown>
  try {
    cfg = loadConfig(layerDir)
  } catch {
    return null
  }

  const ev = cfg['event_view'] as Record<string, unknown> | undefined
  if (!ev?.['full_name']) return null

  const partition = cfg['partition'] as Record<string, unknown> | undefined

  return {
    eventViewFullName: ev['full_name'] as string,
    paramsExtractTemplate: (ev['params_extract_template'] as string) ?? "GET_JSON_OBJECT(params, '$.{field_name}')",
    partitionField: (partition?.['field'] as string) ?? 'ds',
    partitionFormat: (partition?.['format'] as string) ?? 'yyyyMMdd',
  }
}

/**
 * Assemble the SQL conventions prompt section dynamically.
 *
 * When `scopeInput` is null (no scope mounted or config.yaml unreadable),
 * falls back to the generic engine conventions without scope-specific view.
 * This is the GENERATION-only equivalent of the old hardcoded string but
 * scope-aware.
 */
export function assembleSqlConventions(scopeInput: ScopeConventionsInput | null): string {
  const conv = loadConventions('maxcompute')

  // Generic engine conventions (always present)
  const genericParts = [
    'SQL conventions (MaxCompute/hive dialect):',
    ...conv.key_differences.map(d => `- ${d}`),
  ]

  if (scopeInput) {
    // Scope-specific: event view FROM clause + params extraction
    genericParts.push(
      `Event queries: FROM ${scopeInput.eventViewFullName} WHERE event='<event_name>' `
      + `AND ${scopeInput.partitionField}>='<start>' AND ${scopeInput.partitionField}<='<end>';`
      + ` extract event params via ${scopeInput.paramsExtractTemplate.replace('{field_name}', '<field_name>')}.`,
    )
    genericParts.push(
      `Partition predicate ${scopeInput.partitionField}='${scopeInput.partitionFormat}' required for partitioned tables.`,
    )
  } else {
    // Fallback: no scope-specific view (delegate_query paths or misconfigured)
    genericParts.push(
      'Partition predicate ds=\'yyyyMMdd\' required for partitioned tables.',
    )
  }

  // Constants that don't vary by scope
  genericParts.push(
    'SELECT-only; prefer explicit columns over SELECT *;',
    'GET_JSON_OBJECT field paths must reference event_params loaded in UNDERSTANDING.',
  )

  return genericParts.join(' ')
}
