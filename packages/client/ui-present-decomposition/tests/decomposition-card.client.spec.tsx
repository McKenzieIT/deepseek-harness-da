// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { DecompositionCard } from '../src/client/DecompositionCard.tsx'
import type { DecompositionKey } from '../src/client/locales.ts'
import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

const NOW = 1700000000000

/** Locale stub carrying the real zh templates the component interpolates. */
const t = (key: DecompositionKey): string => {
  const dict: Record<DecompositionKey, string> = {
    'cardTitle': '查询理解',
    'confidence': '置信度 {value}',
    'confidenceLow': '置信度 {value} · 请确认',
    'metricsCaption': '将计算 · {count} 项',
    'timeLabel': '时间',
    'dimensionLabel': '维度',
    'filterLabel': '筛选',
    'sourceLabel': '来源',
    'warning': '理解可能不准确，建议补充口径后重新提问',
    'error': '查询理解失败',
    'errorHint': '可在下方输入框补充口径后重新提问',
  }
  return dict[key]
}

function makeSnapshot(opts: { latestTurnStart?: number } = {}): ConversationSnapshot {
  const turnStart = opts.latestTurnStart ?? NOW - 5000
  return {
    chat: {
      timeline: { turnOrder: [1], turns: new Map() },
      order: [],
      nodes: { get: () => undefined, values: () => [] },
      locations: { getTurn: () => [], getStep: () => [] },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
    },
    turnTimings: new Map([[1, { startTime: turnStart }]]),
    turnEnds: new Map(),
    nodes: [],
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    views: { get: () => undefined },
  } as unknown as ConversationSnapshot
}

function makeUseSession(snapshot: ConversationSnapshot) {
  return <S,>(sel: (s: ConversationSnapshot) => S) => sel(snapshot)
}

/** Latest-turn snapshot by default (the block started after the turn did). */
const latest = makeUseSession(makeSnapshot())
/** Snapshot whose latest turn began after the block settled (stale turn). */
const stale = makeUseSession(makeSnapshot({ latestTurnStart: NOW + 1000 }))

function makeRunningBlock(): ToolCallBlock {
  return {
    callId: 'call-1',
    name: 'present_decomposition',
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: NOW,
    callView: null,
    subCalls: [],
  }
}

function makeSettledBlock(argsRaw: string, content = '', isError = false): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: NOW,
    callId: 'call-1',
    call: { name: 'present_decomposition', argsRaw },
    callTime: NOW - 1000,
    content: [{ type: 'text', text: content }],
    isError,
    callView: null,
    resultView: null,
    subCalls: [],
  } as unknown as ToolCallBlock
}

function makeNullCallBlock(content: string): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: NOW,
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

function renderCard(block: ToolCallBlock, useSession = latest) {
  return render(<DecompositionCard block={block} useSession={useSession} t={t} />)
}

describe('DecompositionCard states', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const { container } = renderCard(makeRunningBlock())
    expect(container.querySelectorAll('[class*="skeletonLine"]')).toHaveLength(3)
  })

  it('renders an alert error box when the tool call failed', () => {
    const block = makeSettledBlock(VALID_ARGS, 'metrics must be non-empty', true)
    const { getByRole, getByText } = renderCard(block)
    expect(getByRole('alert')).toBeDefined()
    expect(getByText('查询理解失败')).toBeDefined()
    expect(getByText('metrics must be non-empty')).toBeDefined()
    expect(getByText('可在下方输入框补充口径后重新提问')).toBeDefined()
  })

  it('omits the error detail when the failed call has no content', () => {
    const block = makeSettledBlock(VALID_ARGS, '', true)
    const { getByRole, container } = renderCard(block)
    expect(getByRole('alert')).toBeDefined()
    expect(container.querySelector('[class*="errorDetail"]')).toBeNull()
  })

  it('renders fallback text when block.call is null', () => {
    const { container } = renderCard(makeNullCallBlock('Query decomposition: 按月统计'))
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('按月统计')
  })

  it('joins only the text-bearing content items in the fallback', () => {
    const block = {
      kind: 'tool-result',
      seq: 1,
      time: NOW,
      callId: 'call-1',
      call: null,
      callTime: null,
      content: [{ type: 'text', text: 'A' }, { type: 'tool_use' }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    } as unknown as ToolCallBlock
    const { container } = renderCard(block)
    expect(container.querySelector('pre')!.textContent).toBe('A')
  })

  it('normalizes a non-string metric value to an empty caliber', () => {
    const args = JSON.stringify({
      summary: '数值口径',
      metrics: [{ name: '裸数值', value: 42 }],
      dimensions: [],
      time_range: '今天',
    })
    const { getByText, container } = renderCard(makeSettledBlock(args))
    expect(getByText('裸数值')).toBeDefined()
    expect(container.querySelector('[class*="metricExpr"]')).toBeNull()
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const { container } = renderCard(makeSettledBlock('not json', 'fallback text'))
    expect(container.querySelector('pre')!.textContent).toBe('fallback text')
  })

  it('renders fallback when argsRaw is JSON null', () => {
    const { container } = renderCard(makeSettledBlock('null', 'raw output'))
    expect(container.querySelector('pre')!.textContent).toBe('raw output')
  })

  it('renders fallback when required fields are missing', () => {
    const { container } = renderCard(makeSettledBlock(JSON.stringify({ wrong: true }), 'raw output'))
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders fallback when summary is empty', () => {
    const args = JSON.stringify({ summary: '', metrics: [{ name: 'm', value: 'v' }], dimensions: [], time_range: '' })
    const { container } = renderCard(makeSettledBlock(args, 'raw output'))
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders fallback when metrics is not an array', () => {
    const args = JSON.stringify({ summary: 's', metrics: 'nope', dimensions: [], time_range: '' })
    const { container } = renderCard(makeSettledBlock(args, 'raw output'))
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders fallback when every metric entry is invalid', () => {
    const args = JSON.stringify({ summary: 's', metrics: [null, 5, { name: '', value: 'v' }], dimensions: [], time_range: '' })
    const { container } = renderCard(makeSettledBlock(args, 'raw output'))
    expect(container.querySelector('pre')).not.toBeNull()
  })
})

describe('DecompositionCard rich card (latest turn, expanded)', () => {
  it('renders summary as the focal title with confidence badge and caption count', () => {
    const { getByRole, getByText, container } = renderCard(makeSettledBlock(VALID_ARGS))
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('查询理解')).toBeDefined()
    expect(getByText('按月统计订单金额')).toBeDefined()
    expect(getByText('置信度 0.85')).toBeDefined()
    expect(getByText('将计算 · 2 项')).toBeDefined()
    // lineage labels and values on one row
    expect(getByText('时间')).toBeDefined()
    expect(getByText('最近 7 天')).toBeDefined()
    expect(getByText('维度')).toBeDefined()
    expect(getByText('月份')).toBeDefined()
    expect(getByText('地区')).toBeDefined()
    expect(getByText('筛选')).toBeDefined()
    expect(getByText('status = completed')).toBeDefined()
    expect(getByText('来源')).toBeDefined()
    expect(getByText('orders_fact')).toBeDefined()
    // metric calibers always visible
    expect(getByText('订单金额')).toBeDefined()
    expect(getByText('SUM(amount)')).toBeDefined()
    expect(getByText('元')).toBeDefined()
    expect(getByText('订单数')).toBeDefined()
    expect(getByText('COUNT(*)')).toBeDefined()
    expect(container.querySelector('[class*="warningLine"]')).toBeNull()
  })

  it('skips absent metric unit and empty metric expression lines', () => {
    const args = JSON.stringify({
      summary: '简单查询',
      metrics: [{ name: '裸指标', value: '' }],
      dimensions: [],
      time_range: '今天',
    })
    const { getByText, container } = renderCard(makeSettledBlock(args))
    expect(getByText('裸指标')).toBeDefined()
    expect(container.querySelector('[class*="metricUnit"]')).toBeNull()
    expect(container.querySelector('[class*="metricExpr"]')).toBeNull()
    // no lineage segments for source/filters
    expect(container.textContent).not.toContain('筛选')
    expect(container.textContent).not.toContain('来源')
  })

  it('omits the lineage row entirely when every optional field is absent', () => {
    const args = JSON.stringify({
      summary: '只有指标',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: [],
      time_range: '',
    })
    const { container } = renderCard(makeSettledBlock(args))
    expect(container.querySelector('[class*="lineage"]')).toBeNull()
  })

  it('normalizes non-array dimensions/filters and out-of-range confidence without crashing', () => {
    const args = JSON.stringify({
      summary: '脏数据防御',
      metrics: [{ name: '指标', value: 'v' }],
      dimensions: 'oops',
      filters: 3,
      time_range: 42,
      confidence: 1.5,
    })
    const { getByText, container } = renderCard(makeSettledBlock(args))
    expect(getByText('脏数据防御')).toBeDefined()
    expect(getByText('指标')).toBeDefined()
    expect(container.querySelector('[class*="lineage"]')).toBeNull()
    expect(container.querySelector('[class*="confidence"]')).toBeNull()
  })

  it('drops non-string dimension and filter entries', () => {
    const args = JSON.stringify({
      summary: '混合维度',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: ['月份', 7, null],
      time_range: '今天',
      filters: [true, 'status = ok'],
    })
    const { getByText, queryByText } = renderCard(makeSettledBlock(args))
    expect(getByText('月份')).toBeDefined()
    expect(getByText('status = ok')).toBeDefined()
    expect(queryByText('7')).toBeNull()
  })

  it('treats empty-string source and unit as absent', () => {
    const args = JSON.stringify({
      summary: '空源',
      metrics: [{ name: 'm', value: 'v', unit: '' }],
      dimensions: [],
      time_range: '今天',
      source: '',
    })
    const { container } = renderCard(makeSettledBlock(args))
    expect(container.querySelector('[class*="metricUnit"]')).toBeNull()
    expect(container.textContent).not.toContain('来源')
  })
})

describe('DecompositionCard trust band', () => {
  it('shows low-confidence warning and warn badge when confidence < 0.7', () => {
    const { getByText, container } = renderCard(makeSettledBlock(LOW_CONFIDENCE_ARGS))
    expect(getByText('置信度 0.50 · 请确认')).toBeDefined()
    expect(getByText('理解可能不准确，建议补充口径后重新提问')).toBeDefined()
    expect(container.querySelector('[class*="lowConfidence"]')).not.toBeNull()
    expect(container.querySelector('[class*="confidenceLow"]')).not.toBeNull()
  })

  it('shows neither badge nor warning when confidence is undefined', () => {
    const args = JSON.stringify({
      summary: '无置信度',
      metrics: [{ name: 'm', value: 'v' }],
      dimensions: ['d'],
      time_range: '今天',
    })
    const { container } = renderCard(makeSettledBlock(args))
    expect(container.querySelector('[class*="confidence"]')).toBeNull()
    expect(container.querySelector('[class*="lowConfidence"]')).toBeNull()
    expect(container.querySelector('[class*="warningLine"]')).toBeNull()
  })
})

describe('DecompositionCard collapsing', () => {
  it('keeps the focal line and mini chips when collapsed on user toggle', () => {
    const { getByRole, getByText, queryByText } = renderCard(makeSettledBlock(VALID_ARGS))
    fireEvent.click(getByRole('button', { expanded: true }))
    const collapsedHeader = getByRole('button', { expanded: false })
    expect(collapsedHeader).toBeDefined()
    // focal line survives
    expect(getByText('按月统计订单金额')).toBeDefined()
    expect(getByText('置信度 0.85')).toBeDefined()
    // mini chips carry time + dimensions + metric NAMES (calibers stay hidden)
    expect(getByText('最近 7 天')).toBeDefined()
    expect(getByText('月份')).toBeDefined()
    expect(getByText('订单金额')).toBeDefined()
    expect(getByText('订单数')).toBeDefined()
    expect(queryByText('SUM(amount)')).toBeNull()
    expect(queryByText('将计算 · 2 项')).toBeNull()
    // toggling back re-expands (hook-stability discipline)
    fireEvent.click(collapsedHeader)
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('SUM(amount)')).toBeDefined()
  })

  it('caps mini chips at three per kind with a +N overflow chip', () => {
    const args = JSON.stringify({
      summary: '多维度多指标',
      metrics: [
        { name: '甲', value: 'a()' },
        { name: '乙', value: 'b()' },
        { name: '丙', value: 'c()' },
        { name: '丁', value: 'd()' },
      ],
      dimensions: ['一', '二', '三', '四', '五'],
      time_range: '今天',
    })
    const { getByRole, getByText, queryByText } = renderCard(makeSettledBlock(args), stale)
    expect(getByRole('button', { expanded: false })).toBeDefined()
    expect(getByText('+2')).toBeDefined() // 5 dimensions - 3
    expect(getByText('+1')).toBeDefined() // 4 metrics - 3
    expect(queryByText('四')).toBeNull()
    expect(queryByText('丁')).toBeNull()
  })

  it('collapses by default on turns the conversation has moved past', () => {
    const { getByRole, getByText, queryByText } = renderCard(makeSettledBlock(VALID_ARGS), stale)
    expect(getByRole('button', { expanded: false })).toBeDefined()
    expect(getByText('按月统计订单金额')).toBeDefined()
    expect(queryByText('SUM(amount)')).toBeNull()
    // user override wins over the derived default
    fireEvent.click(getByRole('button', { expanded: false }))
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('SUM(amount)')).toBeDefined()
  })

  it('carries metric names in the collapsed tail when time and dimensions are absent', () => {
    const args = JSON.stringify({
      summary: '极简',
      metrics: [{ name: '裸指标', value: '' }],
      dimensions: [],
      time_range: '',
    })
    const { getByRole, getByText, container } = renderCard(makeSettledBlock(args), stale)
    expect(getByRole('button', { expanded: false })).toBeDefined()
    expect(container.querySelector('[class*="miniLine"]')).not.toBeNull()
    expect(getByText('裸指标')).toBeDefined()
  })

  it('treats empty turnOrder as latest turn', () => {
    const snapshot = makeSnapshot()
    ;(snapshot.chat.timeline as unknown as { turnOrder: number[] }).turnOrder = []
    const { getByRole } = renderCard(makeSettledBlock(VALID_ARGS), makeUseSession(snapshot))
    expect(getByRole('button', { expanded: true })).toBeDefined()
  })

  it('treats a missing latest-turn timing as latest turn', () => {
    const snapshot = makeSnapshot()
    ;(snapshot.turnTimings as Map<number, unknown>).clear()
    const { getByRole } = renderCard(makeSettledBlock(VALID_ARGS), makeUseSession(snapshot))
    expect(getByRole('button', { expanded: true })).toBeDefined()
  })
})
