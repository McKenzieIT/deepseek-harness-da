// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { DecompositionCard } from '../src/client/DecompositionCard.tsx'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

function makeRunningBlock(): ToolCallBlock {
  return {
    callId: 'call-1',
    name: 'present_decomposition',
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: Date.now(),
    callView: null,
    subCalls: [],
  }
}

function makeSettledBlock(argsRaw: string, content = ''): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: Date.now(),
    callId: 'call-1',
    call: { name: 'present_decomposition', argsRaw },
    callTime: Date.now() - 1000,
    content: [{ type: 'text', text: content }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  } as unknown as ToolCallBlock
}

function makeNullCallBlock(content: string): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: Date.now(),
    callId: 'call-1',
    call: null,
    callTime: null,
    content: [{ type: 'text', text: content }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  } as unknown as ToolCallBlock
}

const VALID_ARGS = JSON.stringify({
  summary: '按月统计订单金额',
  metrics: [
    { name: '订单金额', value: 'SUM(amount)', unit: '元' },
    { name: '订单数', value: 'COUNT(*)' },
  ],
  dimensions: ['月份', '地区'],
  time_range: '最近 7 天',
  source: 'orders_fact',
  filters: ['status = completed', 'region = CN'],
  confidence: 0.85,
})

const LOW_CONFIDENCE_ARGS = JSON.stringify({
  summary: '不确定的查询',
  metrics: [{ name: '指标', value: 'x' }],
  dimensions: ['日期'],
  time_range: '最近 30 天',
  confidence: 0.5,
})

describe('DecompositionCard', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const { container } = render(<DecompositionCard block={makeRunningBlock()} />)
    expect(container.querySelectorAll('[class*="skeletonLine"]')).toHaveLength(3)
  })

  it('renders fallback text when block.call is null', () => {
    const block = makeNullCallBlock('Query decomposition: 按月统计')
    const { container } = render(<DecompositionCard block={block} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('按月统计')
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const block = makeSettledBlock('not json', 'fallback text')
    const { container } = render(<DecompositionCard block={block} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('fallback text')
  })

  it('renders fallback when argsRaw is missing required fields', () => {
    const block = makeSettledBlock(JSON.stringify({ wrong: true }), 'raw output')
    const { container } = render(<DecompositionCard block={block} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
  })

  it('renders the full card expanded by default with valid args', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { container, getByRole, getByText } = render(<DecompositionCard block={block} />)
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('按月统计订单金额')).toBeDefined()
    expect(getByText('订单金额')).toBeDefined()
    expect(getByText('SUM(amount) 元')).toBeDefined()
    expect(getByText('订单数')).toBeDefined()
    expect(getByText('COUNT(*)')).toBeDefined()
    expect(getByText('月份')).toBeDefined()
    expect(getByText('地区')).toBeDefined()
    expect(getByText('最近 7 天')).toBeDefined()
    expect(getByText('orders_fact')).toBeDefined()
    expect(getByText('status = completed')).toBeDefined()
    expect(getByText('region = CN')).toBeDefined()
    // No warning when confidence >= 0.7
    expect(container.querySelector('[class*="confidenceWarning"]')).toBeNull()
  })

  it('shows confidence warning when confidence < 0.7', () => {
    const block = makeSettledBlock(LOW_CONFIDENCE_ARGS)
    const { getByText, container } = render(<DecompositionCard block={block} />)
    expect(getByText('理解可能不准确，请确认')).toBeDefined()
    expect(container.querySelector('[class*="lowConfidence"]')).not.toBeNull()
  })

  it('collapses and expands on header click', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByRole, queryByText } = render(<DecompositionCard block={block} />)
    const header = getByRole('button', { expanded: true })
    expect(queryByText('按月统计订单金额')).not.toBeNull()
    fireEvent.click(header)
    expect(queryByText('按月统计订单金额')).toBeNull()
    const collapsedHeader = getByRole('button', { expanded: false })
    fireEvent.click(collapsedHeader)
    expect(queryByText('按月统计订单金额')).not.toBeNull()
  })

  it('does not render source/filters when not present in args', () => {
    const args = JSON.stringify({
      summary: '简单查询',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: ['d'],
      time_range: '今天',
    })
    const block = makeSettledBlock(args)
    const { container } = render(<DecompositionCard block={block} />)
    const labels = Array.from(container.querySelectorAll('[class*="metaLabel"]'))
    const labelTexts = labels.map(l => l.textContent)
    expect(labelTexts).not.toContain('数据源')
    expect(labelTexts).not.toContain('筛选')
  })

  it('does not render filters row when filters is empty array', () => {
    const args = JSON.stringify({
      summary: '简单查询',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: ['d'],
      time_range: '今天',
      filters: [],
    })
    const block = makeSettledBlock(args)
    const { container } = render(<DecompositionCard block={block} />)
    const labels = Array.from(container.querySelectorAll('[class*="metaLabel"]'))
    const labelTexts = labels.map(l => l.textContent)
    expect(labelTexts).not.toContain('筛选')
  })

  it('renders no confidence warning when confidence is undefined', () => {
    const args = JSON.stringify({
      summary: '无置信度',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: ['d'],
      time_range: '今天',
    })
    const block = makeSettledBlock(args)
    const { container } = render(<DecompositionCard block={block} />)
    expect(container.querySelector('[class*="lowConfidence"]')).toBeNull()
    expect(container.querySelector('[class*="confidenceWarning"]')).toBeNull()
  })
})
