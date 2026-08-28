/**
 * qualifyTable — engine-agnostic table-name qualification (C refactor).
 *
 * Phase 1's `SemanticLayerService.qualifyTableName` misread `config.yaml
 * project.name` (game scope `game_10000251`, NOT an ODPS project) → DAU
 * qualified `game_10000251.dws_...` which ODPS could not find (the table
 * lives in `ieu_cdm`). C moves qualification to the query provider
 * (engine-agnostic): `Config.defaultProject` (cordis.patch.yml fills
 * `ieu_cdm`) is the single source of truth for the project prefix, and a
 * per-table `override` (Task 3) takes precedence when present.
 *
 * These tests pin the three resolution paths:
 *  - default: defaultProject + table → `<defaultProject>.<table>`
 *  - override: override + table → `<override>.<table>` (override wins)
 *  - no default: empty defaultProject → bare table (graceful degradation)
 *
 * Run: `pnpm vitest run packages/query/query-maxcompute`
 */
import { describe, it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MaxComputeQueryEngine, type Config } from '../src/index.ts'

/**
 * Construct a MaxComputeQueryEngine WITHOUT starting it — the Service base
 * constructor only registers on ctx (no sidecar spawn until [Service.init]
 * runs via ctx.plugin). `qualifyTable` reads `this.cfg.defaultProject` and
 * never touches the sidecar, so this is a safe pure-method probe.
 */
function newEngine(config: Config): MaxComputeQueryEngine {
  return new MaxComputeQueryEngine(new Context(), config)
}

describe('MaxComputeQueryEngine.qualifyTable', () => {
  it('qualifies a bare table with the configured defaultProject', () => {
    const engine = newEngine({ sidecarPath: 'unused', defaultProject: 'ieu_cdm' })
    expect(engine.qualifyTable('dws_pay_order_di')).toBe('ieu_cdm.dws_pay_order_di')
  })

  it('lets the per-table override take precedence over defaultProject', () => {
    const engine = newEngine({ sidecarPath: 'unused', defaultProject: 'ieu_cdm' })
    expect(engine.qualifyTable('dws_pay_order_di', 'other_project')).toBe('other_project.dws_pay_order_di')
  })

  it('returns the bare table name when defaultProject is empty (no default)', () => {
    const engine = newEngine({ sidecarPath: 'unused', defaultProject: '' })
    expect(engine.qualifyTable('dws_pay_order_di')).toBe('dws_pay_order_di')
  })

  it('returns the bare table name when defaultProject is empty and an override is absent', () => {
    // graceful degradation: empty default + no override → bare (no `undefined.` prefix)
    const engine = newEngine({ sidecarPath: 'unused', defaultProject: '' })
    expect(engine.qualifyTable('dws_pay_order_di')).toBe('dws_pay_order_di')
  })

  it('still honors the override when defaultProject is empty', () => {
    const engine = newEngine({ sidecarPath: 'unused', defaultProject: '' })
    expect(engine.qualifyTable('dws_pay_order_di', 'ieu_cdm')).toBe('ieu_cdm.dws_pay_order_di')
  })
})
