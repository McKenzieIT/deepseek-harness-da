import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dump as dumpYaml } from 'js-yaml'
import { runExperiment, formatComparisonTable } from '../src/harness.ts'
import type { ExperimentConfig, SnapshotLevel } from '../src/types.ts'

let root: string
let casePaths: string[]

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-exp-'))
  mkdirSync(join(root, 'semantic', 'tables'), { recursive: true })
  mkdirSync(join(root, 'semantic', 'events', 'core'), { recursive: true })
  mkdirSync(join(root, 'semantic', 'concepts'), { recursive: true })
  mkdirSync(join(root, 'cases'), { recursive: true })

  writeFileSync(join(root, 'semantic', 'tables', 'dws_pay.yaml'), dumpYaml({
    table_name: 'dws_pay',
    kind: 'dws',
    description: '付费订单日表',
    alt_labels: ['付费', '充值'],
    domains: ['付费经济'],
    columns: [{ name: 'order_id', type: 'string', comment: '订单号' }],
  }))

  writeFileSync(join(root, 'semantic', 'tables', 'dws_active.yaml'), dumpYaml({
    table_name: 'dws_active',
    kind: 'dws',
    description: '活跃用户汇总',
    alt_labels: ['日活', 'DAU'],
    domains: ['用户生命周期'],
    columns: [{ name: 'role_id', type: 'string', comment: '角色' }],
  }))

  writeFileSync(join(root, 'semantic', 'events', 'core', 'login.yaml'), dumpYaml({
    name: 'login',
    description: '登录事件',
    alt_labels: [],
    domains: ['用户生命周期'],
    params_fields: { role_id: { type: 'string', description: '角色ID' } },
  }))

  writeFileSync(join(root, 'semantic', 'concepts', '付费经济.yaml'), dumpYaml({
    name: '付费经济',
    description: '充值消费',
    pref_label: '付费经济',
    alt_labels: [],
  }))

  writeFileSync(join(root, 'semantic', 'concepts', '用户生命周期.yaml'), dumpYaml({
    name: '用户生命周期',
    description: '用户全生命周期',
    pref_label: '用户生命周期',
    alt_labels: [],
  }))

  const case1Path = join(root, 'cases', 'case_001.yaml')
  writeFileSync(case1Path, dumpYaml({
    case_id: 'case_001',
    input: { question: '今天有多少付费订单', turns: [] },
    expected: { result_value: { min_rows: 1 }, match_mode: 'row_count_range' },
    dimensions: { covered_assets: ['dws_pay'] },
  }))

  const case2Path = join(root, 'cases', 'case_002.yaml')
  writeFileSync(case2Path, dumpYaml({
    case_id: 'case_002',
    input: { question: '日活用户数量趋势', turns: [] },
    expected: { result_value: { min_rows: 1 }, match_mode: 'row_count_range' },
    dimensions: { covered_assets: ['dws_active'] },
  }))

  casePaths = [case1Path, case2Path]
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('runExperiment', () => {
  it('produces a comparison table with expected config count', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L0', blending: { mode: 'strategy-b' }, topK: 10 },
      { snapshotLevel: 'L1', blending: { mode: 'strategy-b' }, topK: 10 },
    ]
    const table = runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })
    expect(table.results.length).toBe(2)
    expect(table.results[0]!.cases.length).toBe(2)
    expect(table.results[1]!.cases.length).toBe(2)
    expect(table.timestamp).toBeTruthy()
  })

  it('L1 recall >= L0 recall for alias-dependent queries', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L0', blending: { mode: 'strategy-b' }, topK: 10 },
      { snapshotLevel: 'L1', blending: { mode: 'strategy-b' }, topK: 10 },
    ]
    const table = runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })
    const l0Recall = table.results[0]!.aggregate.meanRecall
    const l1Recall = table.results[1]!.aggregate.meanRecall
    expect(l1Recall).toBeGreaterThanOrEqual(l0Recall)
  })

  it('metrics are within valid ranges', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L1', blending: { mode: 'continuous-blend' }, topK: 10 },
    ]
    const table = runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })
    for (const r of table.results) {
      expect(r.aggregate.meanPrecision).toBeGreaterThanOrEqual(0)
      expect(r.aggregate.meanPrecision).toBeLessThanOrEqual(1)
      expect(r.aggregate.meanRecall).toBeGreaterThanOrEqual(0)
      expect(r.aggregate.meanRecall).toBeLessThanOrEqual(1)
    }
  })

  // GA-AUDIT1-followup ece-15: the experiment harness must reject unsupported
  // / unknown snapshot levels instead of silently degrading to the empty `{}`
  // config (the old `LEVEL_CONFIGS[level] ?? {}` behaviour treated 'L2'/'L3'/
  // typos as L1 semantics with no signal). L2/L3 need runtime args the
  // ExperimentConfig cannot carry; a typo falls through to assertNever.
  it('throws on an unsupported snapshot level (L2 needs runtime args)', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L2', blending: { mode: 'strategy-b' }, topK: 10 },
    ]
    expect(() => runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })).toThrow(/requires runtime args|snapshot level/i)
  })

  it('throws on an unsupported snapshot level (L3 needs runtime args)', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L3', blending: { mode: 'strategy-b' }, topK: 10 },
    ]
    expect(() => runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })).toThrow(/requires runtime args|snapshot level/i)
  })

  it('throws on an unknown snapshot level via the assertNever default arm', () => {
    // Cast a typo through the type boundary to exercise the runtime default:
    // the closed SnapshotLevel union rejects this at compile time in real
    // code; this test guards the assertNever arm for any future drift.
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L9' as unknown as SnapshotLevel, blending: { mode: 'strategy-b' }, topK: 10 },
    ]
    expect(() => runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })).toThrow(/unknown snapshot level/i)
  })
})

describe('formatComparisonTable', () => {
  it('renders readable markdown with columns', () => {
    const configs: ExperimentConfig[] = [
      { snapshotLevel: 'L0', blending: { mode: 'strategy-b' }, topK: 10 },
      { snapshotLevel: 'L1', blending: { mode: 'hard-switch', threshold: 0.5 }, topK: 10 },
    ]
    const table = runExperiment({
      semanticRoot: join(root, 'semantic'),
      casePaths,
      configs,
    })
    const md = formatComparisonTable(table)
    expect(md).toContain('Config')
    expect(md).toContain('Mean P@K')
    expect(md).toContain('Mean R@K')
    expect(md).toContain('strategy-b')
    expect(md).toContain('hard-switch')
    expect(md.split('\n').length).toBeGreaterThanOrEqual(4)
  })
})
