import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dump as dumpYaml } from 'js-yaml'
import { buildGraphSnapshot, snapshotLevel0, snapshotLevel1 } from '../src/graph-snapshot.ts'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'retrieval-exp-'))
  mkdirSync(join(root, 'tables'), { recursive: true })
  mkdirSync(join(root, 'events', 'domain-a'), { recursive: true })
  mkdirSync(join(root, 'concepts'), { recursive: true })

  writeFileSync(join(root, 'tables', 'dws_pay.yaml'), dumpYaml({
    table_name: 'dws_pay',
    kind: 'dws',
    description: '付费订单日表',
    alt_labels: ['付费', '充值'],
    pref_label: '付费表',
    domains: ['付费经济'],
    columns: [{ name: 'order_id', type: 'string', comment: '订单号' }],
    dimension_refs: [{ dim_table: 'dim_server', join_keys: [{ dws_column: 'server_id', dim_column: 'server_id' }] }],
  }))

  writeFileSync(join(root, 'tables', 'dim_server.yaml'), dumpYaml({
    table_name: 'dim_server',
    kind: 'dim',
    description: '服务器维度表',
    alt_labels: [],
    domains: [],
    columns: [{ name: 'server_id', type: 'string', comment: '服务器ID' }, { name: 'server_name', type: 'string', comment: '服务器名' }],
    primary_key: ['server_id'],
    label_columns: ['server_name'],
  }))

  writeFileSync(join(root, 'tables', 'dws_active.yaml'), dumpYaml({
    table_name: 'dws_active',
    kind: 'dws',
    description: '日活跃用户汇总表',
    alt_labels: ['日活', 'DAU'],
    pref_label: '活跃表',
    domains: ['用户生命周期'],
    columns: [{ name: 'role_id', type: 'string', comment: '角色ID' }],
  }))

  writeFileSync(join(root, 'events', 'domain-a', 'login.yaml'), dumpYaml({
    name: 'login',
    description: '登录事件',
    alt_labels: ['登录', '上线'],
    domains: ['用户生命周期'],
    params_fields: { role_id: { type: 'string', description: '角色ID' } },
  }))

  writeFileSync(join(root, 'concepts', '付费经济.yaml'), dumpYaml({
    name: '付费经济',
    description: '充值消费相关',
    pref_label: '付费经济',
    alt_labels: ['充值消费', '氪金'],
  }))

  writeFileSync(join(root, 'concepts', '用户生命周期.yaml'), dumpYaml({
    name: '用户生命周期',
    description: '用户从注册到流失的全生命周期',
    pref_label: '用户生命周期',
    alt_labels: ['留存', '新增'],
  }))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('buildGraphSnapshot', () => {
  it('L0: zero aliases in graph', () => {
    const snap = snapshotLevel0(root)
    expect(snap.level).toBe('L0')
    expect(snap.graph.resolveAlias('付费')).toEqual([])
    expect(snap.graph.resolveAlias('日活')).toEqual([])
    expect(snap.graph.resolveAlias('充值消费')).toEqual([])
    expect(snap.stats.aliasCount).toBe(0)
  })

  it('L0: zero concepts in graph', () => {
    const snap = snapshotLevel0(root)
    expect(snap.stats.conceptCount).toBe(0)
    expect(snap.graph.getRelated('concept:付费经济')).toEqual([])
  })

  it('L0: corpus still indexes tables and events (BM25 functional)', () => {
    const snap = snapshotLevel0(root)
    const hits = snap.linker.retrieve('付费订单', { topK: 5 })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('L1: non-zero aliases for definitions with alt_labels', () => {
    const snap = snapshotLevel1(root)
    expect(snap.graph.resolveAlias('付费')).toContain('dws_pay')
    expect(snap.graph.resolveAlias('日活')).toContain('dws_active')
    expect(snap.graph.resolveAlias('登录')).toContain('login')
    expect(snap.stats.aliasCount).toBeGreaterThan(0)
  })

  it('L1: concepts present as graph nodes with edges', () => {
    const snap = snapshotLevel1(root)
    expect(snap.stats.conceptCount).toBe(2)
    const related = snap.graph.getRelated('concept:付费经济', 'related_to')
    expect(related.map(e => e.targetId)).toContain('dws_pay')
  })

  it('L1: concept aliases resolve correctly', () => {
    const snap = snapshotLevel1(root)
    expect(snap.graph.resolveAlias('充值消费')).toContain('concept:付费经济')
    expect(snap.graph.resolveAlias('氪金')).toContain('concept:付费经济')
  })

  it('extra aliases injection adds to existing aliases', () => {
    const extras = new Map([
      ['dws_pay', ['月卡', '首充']],
      ['dim_server', ['区服']],
    ])
    const snap = buildGraphSnapshot(root, { extraAliases: extras }, 'L2-test')
    expect(snap.graph.resolveAlias('月卡')).toContain('dws_pay')
    expect(snap.graph.resolveAlias('区服')).toContain('dim_server')
    expect(snap.graph.resolveAlias('付费')).toContain('dws_pay')
  })

  it('extra concepts injection adds concept nodes', () => {
    const snap = buildGraphSnapshot(root, {
      extraConcepts: [{ name: '社交', description: '社交玩法', alt_labels: ['好友', '公会'] }],
    }, 'L2-extra-concept')
    expect(snap.graph.resolveAlias('好友')).toContain('concept:社交')
    expect(snap.stats.conceptCount).toBe(3)
  })

  it('stats are accurate', () => {
    const snap = snapshotLevel1(root)
    expect(snap.stats.nodeCount).toBeGreaterThan(0)
    expect(snap.stats.aliasCount).toBeGreaterThan(5)
    expect(snap.stats.conceptCount).toBe(2)
  })
})
