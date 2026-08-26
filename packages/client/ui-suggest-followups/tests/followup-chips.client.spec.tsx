// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { FollowupChips } from '../src/client/FollowupChips.tsx'
import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

const NOW = 1700000000000

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

function makeSettledBlock(argsRaw: string, content = ''): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: NOW,
    callId: 'call-1',
    call: { name: 'suggest_followups', argsRaw },
    callTime: NOW - 1000,
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

describe('FollowupChips', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const snapshot = makeSnapshot()
    const { container } = render(
      <FollowupChips block={makeRunningBlock()} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    expect(container.querySelectorAll('[class*="skeletonChip"]')).toHaveLength(3)
  })

  it('renders fallback text when block.call is null', () => {
    const snapshot = makeSnapshot()
    const block = makeNullCallBlock('Follow-up suggestions:\n  - 按地区: query')
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('按地区')
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock('not json', 'raw output')
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('raw output')
  })

  it('renders fallback when suggestions array is missing', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(JSON.stringify({ wrong: true }), 'fallback text')
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
  })

  it('renders fallback when suggestions array is empty', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(JSON.stringify({ suggestions: [] }), 'empty')
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
  })

  it('renders fallback when suggestion items have invalid shape', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(JSON.stringify({ suggestions: [{ label: 123 }] }), 'bad shape')
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
  })

  it('renders chips with valid suggestions', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    expect(getByText('按地区细分')).toBeDefined()
    expect(getByText('环比对比')).toBeDefined()
    expect(getByText('查看趋势')).toBeDefined()
  })

  it('calls submit with the suggestion value on chip click', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(VALID_ARGS)
    const submit = vi.fn()
    const { getByText } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={submit} />,
    )
    fireEvent.click(getByText('按地区细分'))
    expect(submit).toHaveBeenCalledWith('请按地区维度进一步细分订单金额')
  })

  it('calls submit with correct value for each chip', () => {
    const snapshot = makeSnapshot()
    const block = makeSettledBlock(VALID_ARGS)
    const submit = vi.fn()
    const { getByText } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={submit} />,
    )
    fireEvent.click(getByText('环比对比'))
    expect(submit).toHaveBeenCalledWith('与上月同期数据对比')
  })

  it('returns null when block is from an older turn', () => {
    const snapshot = makeSnapshot({ latestTurnStart: NOW + 5000 })
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows running block even when turn detection is ambiguous', () => {
    const snapshot = makeSnapshot({ latestTurnStart: NOW + 5000 })
    const { container } = render(
      <FollowupChips block={makeRunningBlock()} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    expect(container.querySelectorAll('[class*="skeletonChip"]')).toHaveLength(3)
  })

  it('shows chips when turnOrder is empty', () => {
    const snapshot = {
      ...makeSnapshot(),
      chat: {
        ...makeSnapshot().chat,
        timeline: { turnOrder: [], turns: new Map() },
      },
    } as unknown as ConversationSnapshot
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    expect(getByText('按地区细分')).toBeDefined()
  })

  it('shows chips when turnTimings has no entry for latest turn', () => {
    const snapshot = makeSnapshot()
    ;(snapshot.turnTimings as Map<number, unknown>).clear()
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
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
    const { container } = render(
      <FollowupChips block={block} useSession={makeUseSession(snapshot)} submit={() => {}} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('')
  })
})
