// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { FollowupChips } from '../src/client/FollowupChips.tsx'
import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

const NOW = 1700000000000

/** Locale stub carrying the real zh templates the component interpolates. */
const t = (key: string): string => {
  const dict: Record<string, string> = {
    'caption': '继续追问',
    'listAria': '后续建议列表',
    'send': '发送',
    'sendAria': '发送后续查询:{label}',
    'expired': '该建议来自上一轮,已过期',
    'error': '后续建议生成失败',
    'errorHint': '可直接在下方输入框继续提问',
  }
  return dict[key] ?? key
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

function makeRunningBlock(): ToolCallBlock {
  return {
    callId: 'call-1',
    name: 'suggest_followups',
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
    call: { name: 'suggest_followups', argsRaw },
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
  suggestions: [
    { label: '按地区细分', value: '请按地区维度进一步细分订单金额' },
    { label: '环比对比', value: '与上月同期数据对比' },
    { label: '查看趋势', value: '展示最近 30 天的趋势图' },
  ],
})

function renderList(block: ToolCallBlock, snapshot: ConversationSnapshot, submit = () => {}) {
  return render(
    <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={submit} t={t} />,
  )
}

describe('FollowupChips', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeRunningBlock(), snapshot)
    expect(container.querySelectorAll('[class*="skeletonRow"]')).toHaveLength(3)
  })

  it('renders fallback text when block.call is null', () => {
    const snapshot = makeSnapshot()
    const block = makeNullCallBlock('Follow-up suggestions:\n  - 按地区: query')
    const { container } = renderList(block, snapshot)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('按地区')
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock('not json', 'raw output'), snapshot)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('raw output')
  })

  it('renders fallback when suggestions array is missing', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock(JSON.stringify({ wrong: true }), 'fallback text'), snapshot)
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders fallback when suggestions array is empty', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock(JSON.stringify({ suggestions: [] }), 'empty'), snapshot)
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders fallback when suggestion items have invalid shape', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock(JSON.stringify({ suggestions: [{ label: 123 }] }), 'bad shape'), snapshot)
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders rows with label and the full value visible', () => {
    const snapshot = makeSnapshot()
    const { getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    expect(getByText('按地区细分')).toBeDefined()
    expect(getByText('请按地区维度进一步细分订单金额')).toBeDefined()
    expect(getByText('与上月同期数据对比')).toBeDefined()
  })

  it('exposes a send aria-label naming the suggestion', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    const first = container.querySelector<HTMLButtonElement>('button[data-followup-item]')!
    expect(first.getAttribute('aria-label')).toBe('发送后续查询:按地区细分')
  })

  it('calls submit with the suggestion value on row click', () => {
    const snapshot = makeSnapshot()
    const submit = vi.fn()
    const { getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot, submit)
    fireEvent.click(getByText('按地区细分'))
    expect(submit).toHaveBeenCalledWith('请按地区维度进一步细分订单金额')
  })

  it('renders rows with duplicate values without key collisions', () => {
    const snapshot = makeSnapshot()
    const args = JSON.stringify({
      suggestions: [
        { label: '同名建议一', value: '完全相同的查询' },
        { label: '同名建议二', value: '完全相同的查询' },
      ],
    })
    const { getByText } = renderList(makeSettledBlock(args), snapshot)
    expect(getByText('同名建议一')).toBeDefined()
    expect(getByText('同名建议二')).toBeDefined()
  })

  it('renders disabled rows for an older turn instead of removing them', () => {
    const snapshot = makeSnapshot({ latestTurnStart: NOW + 5000 })
    const { container, getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    expect(getByText('按地区细分')).toBeDefined()
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-followup-item]')
    expect(buttons).toHaveLength(3)
    buttons.forEach((b) => { expect(b.disabled).toBe(true) })
    expect(buttons[0]!.getAttribute('title')).toBe('该建议来自上一轮,已过期')
  })

  it('does not submit when clicking an expired row', () => {
    const snapshot = makeSnapshot({ latestTurnStart: NOW + 5000 })
    const submit = vi.fn()
    const { getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot, submit)
    fireEvent.click(getByText('按地区细分'))
    expect(submit).not.toHaveBeenCalled()
  })

  it('renders an error box when the tool call failed', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(VALID_ARGS, 'suggest_followups 允许最多 5 条建议', true)
    const { container, getByText } = renderList(block, snapshot)
    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(getByText('后续建议生成失败')).toBeDefined()
    expect(getByText('suggest_followups 允许最多 5 条建议')).toBeDefined()
    // No chips may render from a failed call's argsRaw.
    expect(container.querySelector('button[data-followup-item]')).toBeNull()
  })

  it('moves focus between rows with arrow keys (roving)', () => {
    const snapshot = makeSnapshot()
    const { container } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    const list = container.querySelector('ul')!
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-followup-item]'))
    buttons[0]!.focus()
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1])
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(list, { key: 'End' })
    expect(document.activeElement).toBe(buttons[2])
    fireEvent.keyDown(list, { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('shows running block even when turn detection is ambiguous', () => {
    const snapshot = makeSnapshot({ latestTurnStart: NOW + 5000 })
    const { container } = renderList(makeRunningBlock(), snapshot)
    expect(container.querySelectorAll('[class*="skeletonRow"]')).toHaveLength(3)
  })

  it('shows rows when turnOrder is empty', () => {
    const snapshot = {
      ...makeSnapshot(),
      chat: {
        ...makeSnapshot().chat,
        timeline: { turnOrder: [], turns: new Map() },
      },
    } as unknown as ConversationSnapshot
    const { getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    expect(getByText('按地区细分')).toBeDefined()
  })

  it('shows rows when turnTimings has no entry for latest turn', () => {
    const snapshot = makeSnapshot()
    ;(snapshot.turnTimings as Map<number, unknown>).clear()
    const { getByText } = renderList(makeSettledBlock(VALID_ARGS), snapshot)
    expect(getByText('按地区细分')).toBeDefined()
  })

  it('renders fallback with non-text content blocks gracefully', () => {
    const snapshot = makeSnapshot()
    const block = {
      kind: 'tool-result',
      seq: 1,
      time: NOW,
      callId: 'call-1',
      call: null,
      callTime: null,
      content: [{ type: 'image', source: 'data:...' }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    } as unknown as ToolCallBlock
    const { container } = renderList(block, snapshot)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('')
  })
})
