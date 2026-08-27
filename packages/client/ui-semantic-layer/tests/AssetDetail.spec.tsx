// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AssetDetail } from '../src/client/AssetDetail.tsx'
import type { Json } from '../src/client/schemaGatewayBridge.ts'

const t = (key: string): string => key

describe('AssetDetail', () => {
  it('shows loading state', () => {
    const { container } = render(
      <AssetDetail definition={null} kind="table" name="test" loading={true} t={t} />,
    )
    expect(container.textContent).toContain('loading')
  })

  it('shows empty state when no definition', () => {
    const { container } = render(
      <AssetDetail definition={null} kind="table" name="test" loading={false} t={t} />,
    )
    expect(container.textContent).toContain('schema.detail.empty')
  })

  it('renders table definition with columns', () => {
    const def: Json = {
      table_name: 'dws_acc_summary_df',
      description: '账号汇总日表',
      confirmation_status: 'confirmed',
      columns: [
        { name: 'account_id', type: 'bigint', comment: '账号ID', role: 'primary_key' },
        { name: 'level', type: 'int', comment: '等级', role: 'dimension' },
      ],
      metrics: {
        total_login: { description: '总登录次数' },
      },
      dimension_refs: [
        { dim_table: 'dim_server', join_keys: [{ source: 'server_id', target: 'id' }] },
      ],
      granularity: 'daily',
      partitions: [{ name: 'ds' }],
    }
    const { container } = render(
      <AssetDetail definition={def} kind="table" name="dws_acc_summary_df" loading={false} t={t} />,
    )
    expect(container.textContent).toContain('dws_acc_summary_df')
    expect(container.textContent).toContain('账号汇总日表')
    expect(container.textContent).toContain('confirmed')
    expect(container.textContent).toContain('account_id')
    expect(container.textContent).toContain('bigint')
    expect(container.textContent).toContain('primary_key')
    expect(container.textContent).toContain('total_login')
    expect(container.textContent).toContain('dim_server')
    expect(container.textContent).toContain('server_id=id')
    expect(container.textContent).toContain('daily')
    expect(container.textContent).toContain('ds')
  })

  it('renders event definition with params_fields', () => {
    const def: Json = {
      name: 'recharge_event',
      description: '充值事件',
      params_fields: {
        amount: { type: 'float', description: '充值金额' },
        currency: { type: 'string', description: '币种' },
      },
      metrics: { total_recharge: { description: '总充值' } },
      external_refs: ['payment_gateway_v2'],
      event_filter: "type = 'recharge'",
    }
    const { container } = render(
      <AssetDetail definition={def} kind="event" name="recharge_event" loading={false} t={t} />,
    )
    expect(container.textContent).toContain('recharge_event')
    expect(container.textContent).toContain('充值事件')
    expect(container.textContent).toContain('amount')
    expect(container.textContent).toContain('float')
    expect(container.textContent).toContain('充值金额')
    expect(container.textContent).toContain('total_recharge')
    expect(container.textContent).toContain('payment_gateway_v2')
    expect(container.textContent).toContain("type = 'recharge'")
  })

  it('renders metric definition with computation', () => {
    const def: Json = {
      name: 'daily_revenue',
      description: '日收入',
      computation: {
        sql: 'SUM(amount)',
        metadata: { aggregation: 'sum', source: 'dws_payment_df' },
      },
      caliber_variants: [
        { name: '含税', description: '包含增值税' },
      ],
      host_table: 'dws_payment_df',
    }
    const { container } = render(
      <AssetDetail definition={def} kind="metric" name="daily_revenue" loading={false} t={t} />,
    )
    expect(container.textContent).toContain('daily_revenue')
    expect(container.textContent).toContain('SUM(amount)')
    expect(container.textContent).toContain('sum')
    expect(container.textContent).toContain('含税')
    expect(container.textContent).toContain('包含增值税')
    expect(container.textContent).toContain('dws_payment_df')
  })

  it('fires onNavigateToGraph callback', () => {
    const onNav = vi.fn()
    const def: Json = { table_name: 'test_table', columns: [], metrics: {}, dimension_refs: [] }
    const { container } = render(
      <AssetDetail definition={def} kind="table" name="test_table" loading={false} t={t} onNavigateToGraph={onNav} />,
    )
    const btn = container.querySelector('.sl-asset-detail__graph-btn')!
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onNav).toHaveBeenCalledWith('test_table')
  })

  it('disables graph button when no callback', () => {
    const def: Json = { table_name: 'test_table', columns: [], metrics: {}, dimension_refs: [] }
    const { container } = render(
      <AssetDetail definition={def} kind="table" name="test_table" loading={false} t={t} />,
    )
    const btn = container.querySelector('.sl-asset-detail__graph-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
