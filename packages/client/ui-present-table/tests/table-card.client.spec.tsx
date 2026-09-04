// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'

vi.mock('react-chartjs-2', () => {
  const make = (testid: string) =>
    ({ data, options }: { data: unknown; options: unknown }) => (
      <div
        data-testid={testid}
        data-labels={JSON.stringify((data as { labels?: string[] | undefined }).labels ?? null)}
        data-datasets={JSON.stringify((data as { datasets: { data: unknown[] }[] }).datasets)}
        data-options={JSON.stringify(options)}
      />
    )
  return {
    Line: make('line-chart'),
    Bar: make('bar-chart'),
    Scatter: make('scatter-chart'),
    Bubble: make('bubble-chart'),
    Doughnut: make('doughnut-chart'),
    Radar: make('radar-chart'),
    PolarArea: make('polararea-chart'),
  }
})

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale',
  RadialLinearScale: 'RadialLinearScale',
  PointElement: 'PointElement',
  LineElement: 'LineElement',
  BarElement: 'BarElement',
  ArcElement: 'ArcElement',
  Filler: 'Filler',
  BarController: 'BarController',
  LineController: 'LineController',
  DoughnutController: 'DoughnutController',
  PolarAreaController: 'PolarAreaController',
  RadarController: 'RadarController',
  ScatterController: 'ScatterController',
  BubbleController: 'BubbleController',
  Tooltip: 'Tooltip',
  Legend: 'Legend',
}))

import { TableCard, parseQueryData, candidatesEqual, validateChartType } from '../src/client/TableCard.tsx'
import type { QueryCandidate, FetchResultEntry } from '../src/client/TableCard.tsx'
import { zh } from '../src/client/locales.ts'
import type { TableKey } from '../src/client/locales.ts'
import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

const t = (key: TableKey): string => zh[key]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Real renderCompleted output shape: result_id line, TSV rows, trailer. */
const REAL_TSV = 'result_id: qr_test01\ndate\trevenue\tusers\n2026-08-01\t100\t88\n2026-08-02\t200\t91\n(2 rows)'

const TRUNCATED_TSV = 'result_id: qr_big\ndate\trevenue\n2026-08-01\t100\n2026-08-02\t200\n(... 58 more rows elided)\n(60 rows)'

const LEGACY_TSV = 'name\tage\tcity\nAlice\t30\tBeijing\nBob\t25\tShanghai\n(2 rows)'

function makeRunningBlock(): ToolCallBlock {
  return {
    callId: 'call-1',
    name: 'present_table',
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: Date.now(),
    callView: null,
    subCalls: [],
  }
}

function makeSettledBlock(argsRaw: string, content = '', seq = 10, isError = false): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq,
    time: Date.now(),
    callId: 'call-1',
    call: { name: 'present_table', argsRaw },
    callTime: Date.now() - 1000,
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
    seq: 10,
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

interface QueryNodeSpec {
  seq: number
  text: string
  argsRaw?: string | null | undefined
  isError?: boolean
  name?: string
}

function makeUseSession(queryNodes: QueryNodeSpec[] = []) {
  return <T,>(selector: (s: ConversationSnapshot) => T): T => {
    const nodes = queryNodes.map(q => ({
      kind: 'tool-result' as const,
      seq: q.seq,
      time: Date.now() - 2000,
      callId: `call-query-${q.seq}`,
      call: { name: q.name ?? 'query_data', argsRaw: q.argsRaw !== undefined ? q.argsRaw : '{}' },
      callTime: Date.now() - 3000,
      content: [{ type: 'text' as const, text: q.text }],
      isError: q.isError ?? false,
      callView: null,
      resultView: null,
      subCalls: [],
    }))
    return selector({
      nodes,
      turnTimings: new Map(),
      turnEnds: new Map(),
      partial: null,
      runningCalls: [],
      pending: [],
      queue: [],
      running: false,
      subagent: null,
      composerPhase: 'idle',
      removed: false,
      sessionId: 'session-1',
      views: { get: () => undefined },
      chat: {
        order: [],
        nodes: { get: () => undefined, values: () => [] },
        locations: { getTurn: () => [], getStep: () => [] },
        timeline: { turnOrder: [], turns: new Map() },
        legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
      },
    } as unknown as ConversationSnapshot)
  }
}

const VALID_ARGS = JSON.stringify({
  result_id: 'qr_test01',
  title: '收入统计',
  columns: ['日期', '收入', '用户数'],
  column_types: ['date', 'number', 'number'],
  sort_column: 1,
})

const ARGS_NO_COLUMNS = JSON.stringify({ result_id: 'qr_test01', title: '无列覆盖' })

describe('parseQueryData', () => {
  it('parses the real render format: strips result_id line and trailer', () => {
    const result = parseQueryData(REAL_TSV)
    expect(result).not.toBeNull()
    expect(result!.headers).toEqual(['date', 'revenue', 'users'])
    expect(result!.rows).toEqual([['2026-08-01', '100', '88'], ['2026-08-02', '200', '91']])
    expect(result!.resultId).toBe('qr_test01')
    expect(result!.totalRows).toBe(2)
    expect(result!.truncated).toBe(false)
  })

  it('strips elision markers and marks the result truncated', () => {
    const result = parseQueryData(TRUNCATED_TSV)
    expect(result!.rows).toEqual([['2026-08-01', '100'], ['2026-08-02', '200']])
    expect(result!.totalRows).toBe(60)
    expect(result!.truncated).toBe(true)
  })

  it('strips an engine-truncation-only marker', () => {
    const content = 'a\tb\n1\t2\n(... result truncated by the engine)\n(2 rows)'
    const result = parseQueryData(content)
    expect(result!.rows).toEqual([['1', '2']])
    expect(result!.truncated).toBe(true)
  })

  it('parses legacy format without result_id or trailer', () => {
    const result = parseQueryData('a\tb\n1\t2')
    expect(result!.headers).toEqual(['a', 'b'])
    expect(result!.rows).toEqual([['1', '2']])
    expect(result!.resultId).toBeNull()
    expect(result!.totalRows).toBeNull()
  })

  it('marks truncated when the trailer reports more rows than shown', () => {
    const result = parseQueryData('a\tb\n1\t2\n(5 rows)')
    expect(result!.rows).toHaveLength(1)
    expect(result!.totalRows).toBe(5)
    expect(result!.truncated).toBe(true)
  })

  it('returns null for empty content', () => {
    expect(parseQueryData('')).toBeNull()
    expect(parseQueryData('   \n  ')).toBeNull()
  })

  it('returns null when content is only a row count line', () => {
    expect(parseQueryData('(0 rows)')).toBeNull()
  })

  it('returns header-only when no data rows', () => {
    const result = parseQueryData('result_id: qr_x\ncol1\tcol2\n(0 rows)')
    expect(result!.headers).toEqual(['col1', 'col2'])
    expect(result!.rows).toHaveLength(0)
  })

  it('handles single-column TSV', () => {
    const result = parseQueryData('id\n1\n2\n(2 rows)')
    expect(result!.headers).toEqual(['id'])
    expect(result!.rows).toEqual([['1'], ['2']])
  })
})

describe('candidatesEqual', () => {
  const base: QueryCandidate[] = [
    { seq: 5, text: 'a', argsRaw: null },
    { seq: 3, text: 'b', argsRaw: '{"sql":"SELECT 1"}' },
  ]

  it('returns true for identical candidates', () => {
    expect(candidatesEqual(base, [
      { seq: 5, text: 'a', argsRaw: null },
      { seq: 3, text: 'b', argsRaw: '{"sql":"SELECT 1"}' },
    ])).toBe(true)
  })

  it('returns false for different lengths', () => {
    expect(candidatesEqual(base, [base[0] as QueryCandidate])).toBe(false)
  })

  it('returns false when a field differs', () => {
    expect(candidatesEqual(base, [
      { seq: 5, text: 'a', argsRaw: null },
      { seq: 3, text: 'b-changed', argsRaw: '{"sql":"SELECT 1"}' },
    ])).toBe(false)
    expect(candidatesEqual(base, [
      { seq: 5, text: 'a', argsRaw: null },
      { seq: 2, text: 'b', argsRaw: '{"sql":"SELECT 1"}' },
    ])).toBe(false)
  })
})

describe('TableCard states', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const { container } = render(
      <TableCard block={makeRunningBlock()} useSession={makeUseSession()} t={t} />,
    )
    expect(container.querySelectorAll('[class*="skeletonLine"]')).toHaveLength(4)
    expect(container.querySelector('[class*="skeletonKpiRow"]')!.children).toHaveLength(3)
  })

  it('renders fallback text when block.call is null', () => {
    const block = makeNullCallBlock('Table: 收入统计 (result: r1)')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession()} t={t} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('收入统计')
  })

  it('renders an error banner when the tool call failed', () => {
    const block = makeSettledBlock(VALID_ARGS, 'present_table: chart.type must be "line" or "bar"', 10, true)
    const { getByText, queryByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByText(zh.error)).toBeDefined()
    expect(queryByText('收入统计')).toBeNull()
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const block = makeSettledBlock('not json', 'fallback text')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession()} t={t} />,
    )
    expect(container.querySelector('pre')!.textContent).toBe('fallback text')
  })

  it('renders fallback when argsRaw is missing required fields', () => {
    const block = makeSettledBlock(JSON.stringify({ wrong: true }), 'raw output')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession()} t={t} />,
    )
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('renders expired banner when no query_data is available', () => {
    const block = makeSettledBlock(VALID_ARGS, 'text fallback')
    const { getByText, container } = render(
      <TableCard block={block} useSession={makeUseSession()} t={t} />,
    )
    expect(getByText(zh.expired)).toBeDefined()
    expect(container.querySelector('pre')!.textContent).toBe('text fallback')
  })

  it('renders mismatch banner when result_ids never match', () => {
    const block = makeSettledBlock(
      JSON.stringify({ result_id: 'qr_other', title: '别的结果' }), 'text fallback', 10,
    )
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByText(zh.mismatch)).toBeDefined()
    expect(getByText(zh.mismatchHint)).toBeDefined()
  })

  it('shows expired when query_data content is non-text only', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [{
          kind: 'tool-result',
          seq: 5,
          time: Date.now() - 2000,
          callId: 'call-query',
          call: { name: 'query_data', argsRaw: '{}' },
          callTime: Date.now() - 3000,
          content: [{ type: 'image', source: { data: '' } }],
          isError: false,
          callView: null,
          resultView: null,
          subCalls: [],
        }],
        turnTimings: new Map(),
        turnEnds: new Map(),
        partial: null,
        runningCalls: [],
        pending: [],
        queue: [],
        running: false,
        subagent: null,
        composerPhase: 'idle',
        removed: false,
        sessionId: 'session-1',
        views: { get: () => undefined },
        chat: {
          order: [],
          nodes: { get: () => undefined, values: () => [] },
          locations: { getTurn: () => [], getStep: () => [] },
          timeline: { turnOrder: [], turns: new Map() },
          legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
        },
      } as unknown as ConversationSnapshot)
    }
    const block = makeSettledBlock(VALID_ARGS, 'fallback', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} t={t} />,
    )
    expect(getByText(zh.expired)).toBeDefined()
  })
})

describe('TableCard data binding', () => {
  it('binds the query_data node whose result_id matches args.result_id', () => {
    const earlier = 'result_id: qr_test01\ntag\tvalue\nearly\t1\n(1 rows)'
    const later = 'result_id: qr_other\ntag\tvalue\nlater\t2\n(1 rows)'
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, queryByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 3, text: earlier }, { seq: 5, text: later }])}
        t={t}
      />,
    )
    expect(getByText('early')).toBeDefined()
    expect(queryByText('later')).toBeNull()
  })

  it('falls back to the most recent legacy node when no result_ids exist', () => {
    const older = 'name\tage\nOld\t1\n(1 rows)'
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { getByText, queryByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 3, text: older }, { seq: 5, text: LEGACY_TSV }])}
        t={t}
      />,
    )
    expect(getByText('Alice')).toBeDefined()
    expect(queryByText('Old')).toBeNull()
  })

  it('prefers an id match over a more recent legacy node', () => {
    const legacyRecent = LEGACY_TSV
    const idNode = 'result_id: qr_test01\ndate\trevenue\n2026-08-01\t100\n(1 rows)'
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_test01', title: '按 id 绑定' }))
    const { getByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 3, text: idNode }, { seq: 5, text: legacyRecent }])}
        t={t}
      />,
    )
    expect(getByText('2026-08-01')).toBeDefined()
  })

  it('skips errored and later query_data nodes and caps the scan at 6 candidates', () => {
    const nodes: QueryNodeSpec[] = []
    for (let seq = 1; seq <= 6; seq++) {
      nodes.push({ seq, text: `result_id: qr_${seq}\nk\tv\nrow${seq}\t${seq}\n(1 rows)` })
    }
    nodes.push({ seq: 7, text: 'result_id: qr_err\nk\tv\nerr\t7\n(1 rows)', isError: true })
    nodes.push({ seq: 11, text: 'result_id: qr_future\nk\tv\nfuture\t9\n(1 rows)' })
    const { getByText, queryByText } = render(
      <TableCard
        block={makeSettledBlock(JSON.stringify({ result_id: 'qr_1', title: 'cap 扫描' }), '', 10)}
        useSession={makeUseSession(nodes)}
        t={t}
      />,
    )
    expect(getByText('row1')).toBeDefined()
    expect(queryByText('future')).toBeNull()
  })

  it('skips non-query_data tool results when scanning', () => {
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { getByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([
          { seq: 3, text: LEGACY_TSV },
          { seq: 4, text: 'not query data', name: 'bash' },
        ])}
        t={t}
      />,
    )
    expect(getByText('Alice')).toBeDefined()
  })
})

describe('TableCard rendering', () => {
  it('renders the full table with real-format data, columns override, and row count', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, getByRole, container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('收入统计')).toBeDefined()
    expect(getByText(`2 ${zh.rows}`)).toBeDefined()
    expect(getByText('日期')).toBeDefined()
    expect(getByText('2026-08-01')).toBeDefined()
    expect(container.querySelector('table')).not.toBeNull()
  })

  it('shows shown/total row count when the result is truncated', () => {
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_big', title: '截断' }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: TRUNCATED_TSV }])} t={t} />,
    )
    expect(getByText(`2 / 60 ${zh.rows}`)).toBeDefined()
  })

  it('uses raw TSV headers when args.columns is not provided', () => {
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByText('date')).toBeDefined()
    expect(getByText('revenue')).toBeDefined()
  })

  it('collapses and expands on header click, keeping KPI cards visible', () => {
    const args = JSON.stringify({
      result_id: 'qr_test01',
      title: '销售数据',
      kpi_columns: [{ column: 1, aggregation: 'sum', label: '总收入' }],
    })
    const block = makeSettledBlock(args)
    const { getByRole, queryByText, getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(queryByText('2026-08-01')).not.toBeNull()
    fireEvent.click(getByRole('button', { expanded: true }))
    expect(queryByText('2026-08-01')).toBeNull()
    expect(getByText('总收入')).toBeDefined()
    fireEvent.click(getByRole('button', { expanded: false }))
    expect(queryByText('2026-08-01')).not.toBeNull()
  })
})

describe('TableCard sorting', () => {
  function revenueCells(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('tbody td:nth-child(2)')).map(el => el.textContent)
  }

  it('applies sort_column as the initial descending sort', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_test01',
      title: '初始排序',
      sort_column: 1,
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(revenueCells(container)).toEqual(['200', '100'])
    expect(container.querySelector('th[aria-sort="descending"]')).not.toBeNull()
  })

  it('ignores an out-of-range sort_column', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_test01',
      title: '越界排序',
      sort_column: 9,
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(revenueCells(container)).toEqual(['100', '200'])
    expect(container.querySelector('th[aria-sort]')!.getAttribute('aria-sort')).toBe('none')
  })

  it('treats sort_column -1 as no initial sort', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_test01',
      title: '负值排序',
      sort_column: -1,
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(revenueCells(container)).toEqual(['100', '200'])
    expect(container.querySelector('th[aria-sort]')!.getAttribute('aria-sort')).toBe('none')
  })

  it('cycles asc → desc → none on header click with numeric compare', () => {
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    const revenueHeader = getAllByRole('button', { name: zh.sortAria })[1]!
    fireEvent.click(revenueHeader)
    expect(revenueCells(container)).toEqual(['100', '200'])
    expect(container.querySelector('th[aria-sort="ascending"]')).not.toBeNull()
    fireEvent.click(revenueHeader)
    expect(revenueCells(container)).toEqual(['200', '100'])
    fireEvent.click(revenueHeader)
    expect(revenueCells(container)).toEqual(['100', '200'])
    expect(container.querySelector('th[aria-sort="ascending"]')).toBeNull()
    expect(container.querySelector('th[aria-sort="descending"]')).toBeNull()
  })

  it('falls back to string compare when declared numeric cells are not numeric', () => {
    const tsv = 'result_id: qr_mix\nk\tv\nb\tN/A\na\t10\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_mix',
      title: '混合',
      column_types: ['string', 'number'],
    }))
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    const valueHeader = getAllByRole('button', { name: zh.sortAria })[1]!
    fireEvent.click(valueHeader)
    const valueCells = Array.from(container.querySelectorAll('tbody td:nth-child(2)')).map(el => el.textContent)
    expect(valueCells).toEqual(['10', 'N/A'])
  })

  it('sorts date columns chronologically when declared', () => {
    const tsv = 'result_id: qr_d\nd\tv\n2026-08-02\t1\n2026-08-01\t2\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_d',
      title: '日期',
      column_types: ['date', 'number'],
    }))
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    fireEvent.click(getAllByRole('button', { name: zh.sortAria })[0]!)
    const dateCells = Array.from(container.querySelectorAll('tbody td:nth-child(1)')).map(el => el.textContent)
    expect(dateCells).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('falls back to string compare when declared date cells are unparseable', () => {
    const tsv = 'result_id: qr_dd\nd\tv\nzzz\t1\naaa\t2\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'qr_dd',
      title: '坏日期',
      column_types: ['date', 'number'],
    }))
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    fireEvent.click(getAllByRole('button', { name: zh.sortAria })[0]!)
    const dateCells = Array.from(container.querySelectorAll('tbody td:nth-child(1)')).map(el => el.textContent)
    expect(dateCells).toEqual(['aaa', 'zzz'])
  })

  it('aligns numeric columns right via the num class', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(container.querySelectorAll('th[class*="num"]')).toHaveLength(2)
    expect(container.querySelectorAll('td[class*="num"]')).toHaveLength(4)
  })

  it('renders an all-empty column as string kind without crashing', () => {
    const tsv = 'result_id: qr_e\na\tb\nx\t\ny\t\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_e', title: '空列' }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText('x')).toBeDefined()
  })
})

describe('TableCard KPI cards', () => {
  it('renders KPI aggregations', () => {
    const args = JSON.stringify({
      result_id: 'qr_test01',
      title: '销售数据',
      kpi_columns: [
        { column: 1, aggregation: 'sum', label: '总收入' },
        { column: 1, aggregation: 'avg', label: '平均收入' },
        { column: 1, aggregation: 'max', label: '峰值收入' },
      ],
    })
    const block = makeSettledBlock(args)
    const { getByText, container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByText('总收入')).toBeDefined()
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('300')
    expect(kpiValues).toContain('200')
  })

  it('adds the sample-note warning when the result is truncated', () => {
    const args = JSON.stringify({
      result_id: 'qr_big',
      title: '截断 KPI',
      kpi_columns: [{ column: 1, aggregation: 'sum', label: '总收入' }],
    })
    const block = makeSettledBlock(args)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: TRUNCATED_TSV }])} t={t} />,
    )
    expect(getByText(zh.kpiSampleNote)).toBeDefined()
  })

  it('shows em dash for text columns and unknown aggregations', () => {
    const args = JSON.stringify({
      result_id: 'qr_test01',
      title: '空 KPI',
      kpi_columns: [
        { column: 0, aggregation: 'sum', label: '文本列求和' },
        { column: 1, aggregation: 'median', label: '中位数' },
        { column: 99, aggregation: 'sum', label: '越界' },
      ],
    })
    const block = makeSettledBlock(args)
    const { getAllByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: LEGACY_TSV }])} t={t} />,
    )
    expect(getAllByText('—')).toHaveLength(3)
  })

  it('applies % and comma-decimal formats', () => {
    const tsv = 'metric\trate\tamount\nA\t0.125\t1234.567\nB\t0.250\t8901.234\n(2 rows)'
    const args = JSON.stringify({
      result_id: 'r1',
      title: '格式',
      kpi_columns: [
        { column: 1, aggregation: 'avg', label: '平均率', format: '%' },
        { column: 2, aggregation: 'sum', label: '总金额', format: ',.2f' },
      ],
    })
    const block = makeSettledBlock(args)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText('18.8%')).toBeDefined()
    expect(getByText('10,135.80')).toBeDefined()
  })

  it('does not render KPI row when kpi_columns is empty', () => {
    const args = JSON.stringify({ result_id: 'qr_test01', title: 'test', kpi_columns: [] })
    const block = makeSettledBlock(args)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(container.querySelector('[class*="kpiRow"]')).toBeNull()
  })
})

describe('TableCard SQL transparency', () => {
  it('reveals the SQL extracted from the bound query_data argsRaw', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, container } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV, argsRaw: JSON.stringify({ sql: 'SELECT 1' }) }])}
        t={t}
      />,
    )
    expect(getByText(zh.viewSql)).toBeDefined()
    expect(container.querySelector('[class*="sqlText"]')!.textContent).toBe('SELECT 1')
  })

  it('hides the SQL box when argsRaw is null, lacks sql, or is invalid JSON', () => {
    const renderWith = (argsRaw: string | null | undefined) => {
      const block = makeSettledBlock(VALID_ARGS)
      const { queryByText } = render(
        <TableCard
          block={block}
          useSession={makeUseSession([{ seq: 5, text: REAL_TSV, argsRaw }])}
          t={t}
        />,
      )
      return queryByText(zh.viewSql)
    }
    expect(renderWith(undefined)).toBeNull()
    expect(renderWith(null)).toBeNull()
    expect(renderWith('{}')).toBeNull()
    expect(renderWith('{bad json')).toBeNull()
  })
})

describe('TableCard actions', () => {
  it('offers CSV download for any row count and triggers the download', () => {
    vi.useFakeTimers()
    const block = makeSettledBlock(VALID_ARGS)
    const revokeUrl = vi.fn()
    const createUrl = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
    const clicked = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clicked } as unknown as HTMLElement
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag)
    })
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    fireEvent.click(getByText(zh.downloadCsv))
    // ui-present-misc-11: revoke is deferred (setTimeout 1000ms for Safari lazy blob read)
    vi.advanceTimersByTime(1000)
    expect(createUrl).toHaveBeenCalled()
    expect(clicked).toHaveBeenCalled()
    expect(revokeUrl).toHaveBeenCalledWith('blob:test')
    vi.useRealTimers()
  })

  it('CSV-escapes cells containing commas and quotes', () => {
    const tsv = 'result_id: qr_esc\ndesc\tvalue\nhas, comma\t1\nhas "quote"\t2\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_esc', title: '转义' }))
    const blobs: string[] = []
    const createUrl = vi.fn(() => 'blob:esc')
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: vi.fn() })
    function FakeBlob(this: unknown, blobParts: BlobPart[]): void {
      const first = blobParts[0]
      blobs.push(typeof first === 'string' ? first : '[non-string]')
    }
    vi.stubGlobal('Blob', FakeBlob)
    const clicked = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clicked } as unknown as HTMLElement
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag)
    })
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    fireEvent.click(getByText(zh.downloadCsv))
    expect(createUrl).toHaveBeenCalled()
    expect(blobs[0]).toContain('"has, comma"')
    expect(blobs[0]).toContain('"has ""quote"""')
  })

  it('copies the table as Markdown and shows a copied confirmation', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    fireEvent.click(getByText(zh.copyMd))
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenCalledTimes(1)
    const md = writeText.mock.calls[0]![0] as string
    expect(md).toContain('### 收入统计')
    expect(md).toContain('| 日期 | 收入 | 用户数 |')
    expect(md).toContain('| 2026-08-01 | 100 | 88 |')
    expect(getByText(zh.copied)).toBeDefined()
    await vi.advanceTimersByTimeAsync(1500)
    expect(getByText(zh.copyMd)).toBeDefined()
  })

  it('is a no-op without a clipboard API', () => {
    vi.stubGlobal('navigator', {})
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    fireEvent.click(getByText(zh.copyMd))
    expect(getByText(zh.copyMd)).toBeDefined()
  })
})

describe('TableCard virtual table', () => {
  function makeWideTsv(rows: number): string {
    const body = Array.from({ length: rows }, (_, i) => `row${i}\t${i}\tcity${i}`).join('\n')
    return `result_id: qr_many\nname\tnum\tcity\n${body}\n(${rows} rows)`
  }

  it('renders the grid virtual table with table semantics for >100 rows', () => {
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_many', title: '大表' }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: makeWideTsv(150) }])} t={t} />,
    )
    const grid = container.querySelector('[role="table"]')
    expect(grid).not.toBeNull()
    expect(grid!.getAttribute('aria-rowcount')).toBe('151')
    expect(container.querySelector('[class*="gridHead"]')).not.toBeNull()
    expect(container.querySelector('tbody')).toBeNull()
  })

  it('sorts through the grid virtual table header buttons', () => {
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_many', title: '大表排序' }))
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: makeWideTsv(150) }])} t={t} />,
    )
    const numHeader = getAllByRole('button', { name: zh.sortAria })[1]!
    fireEvent.click(numHeader)
    expect(container.querySelector('[role="columnheader"][aria-sort="ascending"]')).not.toBeNull()
  })

  it('renders the plain table for <=100 rows', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(container.querySelector('[class*="gridHead"]')).toBeNull()
    expect(container.querySelector('tbody')).not.toBeNull()
  })

  it('caps parsed rows at MAX_DISPLAY_ROWS and reports the capped count', () => {
    const body = Array.from({ length: 10001 }, (_, i) => `r${i}\t${i}`).join('\n')
    const tsv = `result_id: qr_huge\nk\tv\n${body}\n(10001 rows)`
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_huge', title: '巨表' }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText(`10000 / 10001 ${zh.rows}`)).toBeDefined()
  })
})

describe('TableCard chart section', () => {
  const chartArgs = JSON.stringify({
    result_id: 'qr_test01',
    title: '趋势图',
    chart: { type: 'line', x_column: 0, y_columns: [1] },
  })

  it('lazy-renders the default chart type inside Suspense', async () => {
    const block = makeSettledBlock(chartArgs)
    const { findByTestId, getByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByRole('group', { name: zh.chartGroup })).toBeDefined()
    const chart = await findByTestId('line-chart')
    expect(JSON.parse(chart.getAttribute('data-labels')!)).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('switches chart type through the toolbar and hides the chart', async () => {
    const block = makeSettledBlock(chartArgs)
    const { findByTestId, getByRole, queryByTestId } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    await findByTestId('line-chart')
    fireEvent.click(getByRole('button', { name: zh.chartBar }))
    expect(await findByTestId('bar-chart')).toBeDefined()
    fireEvent.click(getByRole('button', { name: zh.chartLine }))
    expect(await findByTestId('line-chart')).toBeDefined()
    fireEvent.click(getByRole('button', { name: zh.chartData }))
    expect(queryByTestId('line-chart')).toBeNull()
    expect(queryByTestId('bar-chart')).toBeNull()
  })

  it('toggles 显示数值 and passes showLabels to the chart as valueLabels.display', async () => {
    const block = makeSettledBlock(chartArgs)
    const { findByTestId, getByRole, container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    await findByTestId('line-chart')
    const before = JSON.parse(
      container.querySelector('[data-testid="line-chart"]')!.getAttribute('data-options')!,
    ) as { plugins: { valueLabels: { display: boolean } } }
    expect(before.plugins.valueLabels.display).toBe(false)
    fireEvent.click(getByRole('button', { name: zh.chartLabels }))
    await findByTestId('line-chart')
    const after = JSON.parse(
      container.querySelector('[data-testid="line-chart"]')!.getAttribute('data-options')!,
    ) as { plugins: { valueLabels: { display: boolean } } }
    expect(after.plugins.valueLabels.display).toBe(true)
  })

  it('shows a degradation banner + falls back to bar for an infeasible type', async () => {
    // scatter over a date x + one numeric y → <2 numeric columns → degrade to bar
    const scatterArgs = JSON.stringify({
      result_id: 'qr_test01',
      title: '散点降级',
      chart: { type: 'scatter', x_column: 0, y_columns: [1] },
    })
    const block = makeSettledBlock(scatterArgs)
    const { findByTestId, findByText, queryByTestId } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(await findByText(zh.degradeScatter)).toBeDefined()
    expect(await findByTestId('bar-chart')).toBeDefined()
    expect(queryByTestId('scatter-chart')).toBeNull()
  })

  it('renders the requested type when the validator accepts it', async () => {
    const scatterArgs = JSON.stringify({
      result_id: 'qr_test01',
      title: '散点',
      column_types: ['number', 'number'],
      chart: { type: 'scatter', x_column: 0, y_columns: [1] },
    })
    const tsv = 'result_id: qr_test01\tx\ty\n10\t100\n20\t200\n(2 rows)'
    const block = makeSettledBlock(scatterArgs)
    const { findByTestId, queryByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(await findByTestId('scatter-chart')).toBeDefined()
    expect(queryByText(zh.degradeScatter)).toBeNull()
  })

  it('does not show chart when collapsed', () => {
    const block = makeSettledBlock(chartArgs)
    const { getByRole, queryByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    fireEvent.click(getByRole('button', { expanded: true }))
    expect(queryByRole('group', { name: zh.chartGroup })).toBeNull()
  })
})

describe('TableCard fallback content blocks', () => {
  it('handles content blocks without text field in fallback', () => {
    const block = {
      kind: 'tool-result',
      seq: 10,
      time: Date.now(),
      callId: 'call-1',
      call: null,
      callTime: null,
      content: [{ type: 'image', source: { data: '' } }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    } as unknown as ToolCallBlock
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession()} t={t} />,
    )
    expect(container.querySelector('pre')!.textContent).toBe('')
  })
})

describe('TableCard coverage completions', () => {
  it('computes min and count KPI aggregations', () => {
    const args = JSON.stringify({
      result_id: 'qr_test01',
      title: '极值',
      kpi_columns: [
        { column: 1, aggregation: 'min', label: '最小收入' },
        { column: 1, aggregation: 'count', label: '计数' },
      ],
    })
    const block = makeSettledBlock(args)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('100')
    expect(kpiValues).toContain('2')
  })

  it('formats a non-integer average without explicit format', () => {
    const tsv = 'x\tval\na\t1\nb\t2\n(2 rows)'
    const args = JSON.stringify({
      result_id: 'r1',
      title: '均值',
      kpi_columns: [{ column: 1, aggregation: 'avg', label: '均值' }],
    })
    const block = makeSettledBlock(args)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText('1.5')).toBeDefined()
  })

  it('treats a malformed comma-decimal format as zero decimals', () => {
    const tsv = 'x\tval\na\t100\nb\t200\n(2 rows)'
    const args = JSON.stringify({
      result_id: 'r1',
      title: '坏格式',
      kpi_columns: [{ column: 1, aggregation: 'sum', label: '合计', format: ',.f' }],
    })
    const block = makeSettledBlock(args)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText('300')).toBeDefined()
  })

  it('extracts no SQL when the query node argsRaw is null', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { queryByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV, argsRaw: null }])}
        t={t}
      />,
    )
    expect(queryByText(zh.viewSql)).toBeNull()
  })

  it('skips non-tool-result nodes during the backward scan', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [
          { kind: 'user-message', seq: 7, time: Date.now() - 5000, content: [{ type: 'text', text: 'hello' }] },
          {
            kind: 'tool-result' as const,
            seq: 5,
            time: Date.now() - 2000,
            callId: 'call-query',
            call: { name: 'query_data', argsRaw: '{}' },
            callTime: Date.now() - 3000,
            content: [{ type: 'text' as const, text: LEGACY_TSV }],
            isError: false,
            callView: null,
            resultView: null,
            subCalls: [],
          },
        ],
        turnTimings: new Map(),
        turnEnds: new Map(),
        partial: null,
        runningCalls: [],
        pending: [],
        queue: [],
        running: false,
        subagent: null,
        composerPhase: 'idle',
        removed: false,
        sessionId: 'session-1',
        views: { get: () => undefined },
        chat: {
          order: [],
          nodes: { get: () => undefined, values: () => [] },
          locations: { getTurn: () => [], getStep: () => [] },
          timeline: { turnOrder: [], turns: new Map() },
          legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
        },
      } as unknown as ConversationSnapshot)
    }
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} t={t} />,
    )
    expect(getByText('Alice')).toBeDefined()
  })

  it('skips unparseable query candidates when binding', () => {
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { getByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 3, text: '(0 rows)' }, { seq: 5, text: LEGACY_TSV }])}
        t={t}
      />,
    )
    expect(getByText('Alice')).toBeDefined()
  })

  it('sorts sniffed string columns lexicographically', () => {
    const block = makeSettledBlock(ARGS_NO_COLUMNS)
    const { container, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: LEGACY_TSV }])} t={t} />,
    )
    fireEvent.click(getAllByRole('button', { name: zh.sortAria })[0]!)
    const nameCells = Array.from(container.querySelectorAll('tbody td:nth-child(1)')).map(el => el.textContent)
    expect(nameCells).toEqual(['Alice', 'Bob'])
  })

  it('renders ragged rows with missing cells as empty strings', () => {
    const tsv = 'result_id: qr_rag\na\tb\nfull\t1\nshort\nshort2\nmid\t3\n(4 rows)'
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_rag', title: '缺列' }))
    const { container, getByText, getAllByRole } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: tsv }])} t={t} />,
    )
    expect(getByText('short')).toBeDefined()
    const shortRow = Array.from(container.querySelectorAll('tbody tr'))[1]!
    expect(shortRow.children).toHaveLength(1)
    expect(shortRow.children[0]!.textContent).toBe('short')
    const fullRow = Array.from(container.querySelectorAll('tbody tr'))[0]!
    expect(fullRow.children[1]!.className).toContain('num')
    fireEvent.click(getAllByRole('button', { name: zh.sortAria })[1]!)
    const sortedNames = Array.from(container.querySelectorAll('tbody td:nth-child(1)')).map(el => el.textContent)
    expect(sortedNames).toEqual(['short', 'short2', 'full', 'mid'])
  })

  it('swallows clipboard rejection without crashing', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    fireEvent.click(getByText(zh.copyMd))
    await vi.advanceTimersByTimeAsync(0)
    expect(getByText(zh.copyMd)).toBeDefined()
  })
})

/** A full result from the result store — more rows than the same-turn TSV scan,
 *  so an entry-rendered table is distinguishable from a TSV-rendered one. */
const ENTRY_FULL = {
  columns: ['date', 'revenue', 'users'],
  rows: [
    ['2026-08-01', '100', '88'],
    ['2026-08-02', '200', '91'],
    ['2026-08-03', '300', '95'],
  ],
  metadata: { row_count: 3 },
}

/** An entry whose cells include null/undefined (coerced to '') and that carries
 *  no metadata — covers the entry-coercion + the metadata-absent branches. */
const ENTRY_NULL_CELLS = {
  columns: ['a', 'b'],
  rows: [['x', null], ['y', undefined], ['z', 42]],
}

/** An entry whose metadata declares truncation + a total row count — covers
 *  the entry metadata.truncated + metadata.row_count present branches. */
const ENTRY_TRUNCATED = {
  columns: ['d', 'v'],
  rows: [['2026-09-01', '100'], ['2026-09-02', '200']],
  metadata: { truncated: true, row_count: 60 },
}

describe('TableCard fetchResult wiring', () => {
  it('renders full rows from fetchResult when it resolves (primary over TSV scan)', async () => {
    const fetchResult = vi.fn().mockResolvedValue(ENTRY_FULL)
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])}
        fetchResult={fetchResult}
        t={t}
      />,
    )
    // 2026-08-03 exists only in the entry, not the 2-row TSV → entry rendered.
    expect(await findByText('2026-08-03')).toBeDefined()
    expect(fetchResult).toHaveBeenCalledWith('qr_test01')
  })

  it('falls back to the same-turn TSV when fetchResult resolves undefined (not-found)', async () => {
    const fetchResult = vi.fn().mockResolvedValue(undefined)
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText, queryByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])}
        fetchResult={fetchResult}
        t={t}
      />,
    )
    // TSV rows render (cache-miss fallback); the entry-only row never appears.
    expect(await findByText('2026-08-01')).toBeDefined()
    expect(queryByText('2026-08-03')).toBeNull()
  })

  it('shows expired banner + retry when fetchResult resolves undefined and no TSV binds', async () => {
    const fetchResult = vi.fn().mockResolvedValue(undefined)
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession()}
        fetchResult={fetchResult}
        t={t}
      />,
    )
    expect(await findByText(zh.expired)).toBeDefined()
    expect(await findByText(zh.retry)).toBeDefined()
  })

  it('shows expired banner + retry when fetchResult rejects (transport/host error)', async () => {
    const fetchResult = vi.fn().mockRejectedValue(new Error('network'))
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])}
        fetchResult={fetchResult}
        t={t}
      />,
    )
    expect(await findByText(zh.expired)).toBeDefined()
    expect(await findByText(zh.retry)).toBeDefined()
  })

  it('falls back to the TSV when no fetchResult face is provided (result-cache absent)', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, queryByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} t={t} />,
    )
    expect(getByText('2026-08-01')).toBeDefined()
    expect(queryByText('2026-08-03')).toBeNull()
    expect(queryByText(zh.retry)).toBeNull()
  })

  it('re-fetches when the user clicks retry (retry = refetch)', async () => {
    const fetchResult = vi.fn().mockRejectedValue(new Error('network'))
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText, getByText } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])}
        fetchResult={fetchResult}
        invalidateResult={vi.fn()}
        t={t}
      />,
    )
    await findByText(zh.retry)
    expect(fetchResult).toHaveBeenCalledTimes(1)
    fireEvent.click(getByText(zh.retry))
    await new Promise((r) => { setTimeout(r, 0) })
    expect(fetchResult).toHaveBeenCalledTimes(2)
  })

  it('invalidates + refetches when a fresh query_data re-runs for the same result_id (R5 fresh-vs-folded)', async () => {
    const fetchResult = vi.fn().mockResolvedValue(ENTRY_FULL)
    const invalidateResult = vi.fn()
    const block = makeSettledBlock(VALID_ARGS)
    const useSession5 = makeUseSession([{ seq: 5, text: REAL_TSV }])
    const useSession8 = makeUseSession([{ seq: 8, text: REAL_TSV }])
    const { rerender, findByText } = render(
      <TableCard
        block={block}
        useSession={useSession5}
        fetchResult={fetchResult}
        invalidateResult={invalidateResult}
        t={t}
      />,
    )
    await findByText('2026-08-03')
    // seq=5 is fresh (> last invalidated -1) ⇒ invalidate once + fetch once.
    expect(invalidateResult).toHaveBeenCalledWith('qr_test01')
    expect(fetchResult).toHaveBeenCalledTimes(1)
    // A fresh same-turn re-run (seq 5→8) ⇒ invalidate again + refetch.
    rerender(
      <TableCard
        block={block}
        useSession={useSession8}
        fetchResult={fetchResult}
        invalidateResult={invalidateResult}
        t={t}
      />,
    )
    await new Promise((r) => { setTimeout(r, 0) })
    expect(invalidateResult).toHaveBeenCalledTimes(2)
    expect(fetchResult).toHaveBeenCalledTimes(2)
  })

  it('does not re-fetch on collapse/expand (fold preserves the cached entry)', async () => {
    const fetchResult = vi.fn().mockResolvedValue(ENTRY_FULL)
    const block = makeSettledBlock(VALID_ARGS)
    const { findByText, getByRole } = render(
      <TableCard
        block={block}
        useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])}
        fetchResult={fetchResult}
        t={t}
      />,
    )
    await findByText('2026-08-03')
    expect(fetchResult).toHaveBeenCalledTimes(1)
    // Collapse then expand — freshSeq unchanged, so the effect does not re-run.
    fireEvent.click(getByRole('button', { expanded: true }))
    fireEvent.click(getByRole('button', { expanded: false }))
    expect(fetchResult).toHaveBeenCalledTimes(1)
  })

  it('coerces null/undefined result-store cells to empty strings', async () => {
    const fetchResult = vi.fn().mockResolvedValue(ENTRY_NULL_CELLS)
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_test01', title: '空单元' }))
    const { findByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} fetchResult={fetchResult} t={t} />,
    )
    // 'z' and '42' (number coerced to string) render; the null/undefined cells
    // become empty strings (no crash, no "null" text).
    expect(await findByText('z')).toBeDefined()
    expect(await findByText('42')).toBeDefined()
  })

  it('honors entry metadata.truncated + row_count (shown / total)', async () => {
    const fetchResult = vi.fn().mockResolvedValue(ENTRY_TRUNCATED)
    const block = makeSettledBlock(JSON.stringify({ result_id: 'qr_test01', title: '截断条目' }))
    const { findByText } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} fetchResult={fetchResult} t={t} />,
    )
    expect(await findByText(`2 / 60 ${zh.rows}`)).toBeDefined()
  })

  it('swallows a fetch that resolves after unmount (cancelled guard holds)', async () => {
    let resolveFetch: (v: FetchResultEntry | undefined) => void = () => {}
    const fetchResult = vi.fn(() => new Promise<FetchResultEntry | undefined>((r) => { resolveFetch = r }))
    const block = makeSettledBlock(VALID_ARGS)
    const { unmount } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} fetchResult={fetchResult} t={t} />,
    )
    expect(fetchResult).toHaveBeenCalledTimes(1)
    unmount()
    // Settles after unmount — the .then must not set state or throw.
    resolveFetch(ENTRY_FULL)
    await new Promise((r) => { setTimeout(r, 0) })
  })

  it('swallows a fetch rejection that lands after unmount (no unhandled rejection)', async () => {
    let rejectFetch: (e: unknown) => void = () => {}
    const fetchResult = vi.fn(() => new Promise<never>((_, rej) => { rejectFetch = rej }))
    const block = makeSettledBlock(VALID_ARGS)
    const { unmount } = render(
      <TableCard block={block} useSession={makeUseSession([{ seq: 5, text: REAL_TSV }])} fetchResult={fetchResult} t={t} />,
    )
    unmount()
    rejectFetch(new Error('network'))
    await new Promise((r) => { setTimeout(r, 0) })
  })
})

describe('validateChartType (R4 client validator → degrade to bar)', () => {
  // index: 0=date, 1=number, 2=number, 3=string, 4=number
  const KINDS = ['date', 'number', 'number', 'string', 'number'] as const
  const ROWS = [['a', '1'], ['b', '2']]

  it('accepts bar and hbar unconditionally', () => {
    for (const type of ['bar', 'hbar'] as const) {
      expect(validateChartType(type, { type, x_column: 0, y_columns: [1] }, KINDS, ROWS)).toEqual({ ok: true })
    }
  })

  it('accepts line/area when x is a date', () => {
    expect(validateChartType('line', { type: 'line', x_column: 0, y_columns: [1] }, KINDS, ROWS).ok).toBe(true)
    expect(validateChartType('area', { type: 'area', x_column: 0, y_columns: [1] }, KINDS, ROWS).ok).toBe(true)
  })

  it('degrades line/area to bar when x is not a date', () => {
    const r = validateChartType('line', { type: 'line', x_column: 4, y_columns: [1] }, KINDS, ROWS)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reasonKey).toBe('degradeLineDate')
      expect(r.fallback).toBe('bar')
    }
  })

  it('accepts scatter when x and y are numeric (≥2 numeric columns)', () => {
    expect(validateChartType('scatter', { type: 'scatter', x_column: 1, y_columns: [2] }, KINDS, ROWS).ok).toBe(true)
  })

  it('degrades scatter to bar when x is not numeric', () => {
    const r = validateChartType('scatter', { type: 'scatter', x_column: 0, y_columns: [1] }, KINDS, ROWS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasonKey).toBe('degradeScatter')
  })

  it('accepts bubble when x, y, and r_column are numeric (≥3 numeric columns)', () => {
    expect(validateChartType('bubble', { type: 'bubble', x_column: 1, y_columns: [2], r_column: 4 }, KINDS, ROWS).ok).toBe(true)
  })

  it('degrades bubble to bar when r_column is missing or non-numeric', () => {
    const noR = validateChartType('bubble', { type: 'bubble', x_column: 1, y_columns: [2] }, KINDS, ROWS)
    expect(noR.ok).toBe(false)
    if (!noR.ok) expect(noR.reasonKey).toBe('degradeBubble')
    const badR = validateChartType('bubble', { type: 'bubble', x_column: 1, y_columns: [2], r_column: 3 }, KINDS, ROWS)
    expect(badR.ok).toBe(false)
    if (!badR.ok) expect(badR.reasonKey).toBe('degradeBubble')
  })

  it('accepts doughnut when x has ≤8 distinct classes', () => {
    expect(validateChartType('doughnut', { type: 'doughnut', x_column: 0, y_columns: [1] }, KINDS, ROWS).ok).toBe(true)
  })

  it('degrades doughnut to bar when x has >8 distinct classes', () => {
    const manyRows = Array.from({ length: 9 }, (_, i) => [`c${i}`, '1'])
    const r = validateChartType('doughnut', { type: 'doughnut', x_column: 0, y_columns: [1] }, ['string', 'number'] as const, manyRows)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasonKey).toBe('degradeDoughnut')
  })

  it('accepts radar/polarArea when x is categorical and y is numeric (entity × N metric)', () => {
    expect(validateChartType('radar', { type: 'radar', x_column: 3, y_columns: [1] }, KINDS, ROWS).ok).toBe(true)
    expect(validateChartType('polarArea', { type: 'polarArea', x_column: 3, y_columns: [1] }, KINDS, ROWS).ok).toBe(true)
  })

  it('degrades radar/polarArea to bar when x is not categorical (not entity × N metric)', () => {
    const r = validateChartType('radar', { type: 'radar', x_column: 0, y_columns: [1] }, KINDS, ROWS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasonKey).toBe('degradeRadar')
  })

  it('reads y_kind at index -1 when y_columns is empty (scatter degrades)', () => {
    const r = validateChartType('scatter', { type: 'scatter', x_column: 1, y_columns: [] }, KINDS, ROWS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasonKey).toBe('degradeScatter')
  })

  it('treats a missing x_column cell as an empty string for doughnut cardinality', () => {
    // ragged row r[0] undefined → the ?? '' fallback in the distinct-value set
    const ragged = [['a', '1'], ['b', '2'], [] as string[]]
    const r = validateChartType('doughnut', { type: 'doughnut', x_column: 0, y_columns: [1] }, ['string', 'number'] as const, ragged)
    expect(r.ok).toBe(true)
  })
})
