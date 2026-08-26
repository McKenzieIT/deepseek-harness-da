// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: unknown }) => (
    <div data-testid="line-chart" data-labels={JSON.stringify((data as { labels: string[] }).labels)} />
  ),
  Bar: ({ data }: { data: unknown }) => (
    <div data-testid="bar-chart" data-labels={JSON.stringify((data as { labels: string[] }).labels)} />
  ),
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale',
  PointElement: 'PointElement',
  LineElement: 'LineElement',
  BarElement: 'BarElement',
  BarController: 'BarController',
  LineController: 'LineController',
  Tooltip: 'Tooltip',
  Legend: 'Legend',
}))

import { TableCard, parseTsv } from '../src/client/TableCard.tsx'
import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

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

function makeSettledBlock(argsRaw: string, content = '', seq = 10): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq,
    time: Date.now(),
    callId: 'call-1',
    call: { name: 'present_table', argsRaw },
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

const TSV_CONTENT = 'name\tage\tcity\nAlice\t30\tBeijing\nBob\t25\tShanghai\nCharlie\t35\tShenzhen\n(3 rows)'

function makeUseSession(queryDataContent: string | null, queryDataSeq = 5) {
  return <T,>(selector: (s: ConversationSnapshot) => T): T => {
    const nodes = queryDataContent !== null
      ? [{
        kind: 'tool-result' as const,
        seq: queryDataSeq,
        time: Date.now() - 2000,
        callId: 'call-query',
        call: { name: 'query_data', argsRaw: '{}' },
        callTime: Date.now() - 3000,
        content: [{ type: 'text' as const, text: queryDataContent }],
        isError: false,
        callView: null,
        resultView: null,
        subCalls: [],
      }]
      : []
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
  result_id: 'r1',
  title: '用户统计',
  columns: ['姓名', '年龄', '城市'],
  column_types: ['string', 'number', 'string'],
  sort_column: 1,
})

const ARGS_WITH_KPI = JSON.stringify({
  result_id: 'r1',
  title: '销售数据',
  kpi_columns: [
    { column: 1, aggregation: 'sum', label: '总年龄' },
    { column: 1, aggregation: 'avg', label: '平均年龄' },
    { column: 1, aggregation: 'max', label: '最大年龄' },
  ],
})

const ARGS_WITH_CHART = JSON.stringify({
  result_id: 'r1',
  title: '趋势图',
  chart: { type: 'line', x_column: 0, y_columns: [1] },
})


describe('parseTsv', () => {
  it('parses standard TSV with row count trailer', () => {
    const result = parseTsv(TSV_CONTENT)
    expect(result).not.toBeNull()
    expect(result!.headers).toEqual(['name', 'age', 'city'])
    expect(result!.rows).toHaveLength(3)
    expect(result!.rows[0]).toEqual(['Alice', '30', 'Beijing'])
  })

  it('parses TSV without row count trailer', () => {
    const result = parseTsv('a\tb\n1\t2')
    expect(result).not.toBeNull()
    expect(result!.headers).toEqual(['a', 'b'])
    expect(result!.rows).toEqual([['1', '2']])
  })

  it('returns null for empty content', () => {
    expect(parseTsv('')).toBeNull()
    expect(parseTsv('   \n  ')).toBeNull()
  })

  it('returns null when content is only a row count line', () => {
    expect(parseTsv('(0 rows)')).toBeNull()
  })

  it('returns header-only when no data rows', () => {
    const result = parseTsv('col1\tcol2')
    expect(result).not.toBeNull()
    expect(result!.headers).toEqual(['col1', 'col2'])
    expect(result!.rows).toHaveLength(0)
  })

  it('handles single-column TSV', () => {
    const result = parseTsv('id\n1\n2\n(2 rows)')
    expect(result).not.toBeNull()
    expect(result!.headers).toEqual(['id'])
    expect(result!.rows).toEqual([['1'], ['2']])
  })
})

describe('TableCard', () => {
  it('renders skeleton when block is a RunningToolCall', () => {
    const { container } = render(
      <TableCard block={makeRunningBlock()} useSession={makeUseSession(null)} />,
    )
    expect(container.querySelectorAll('[class*="skeletonLine"]')).toHaveLength(4)
    expect(container.querySelectorAll('[class*="skeletonKpiRow"]')).toHaveLength(1)
    expect(container.querySelector('[class*="skeletonKpiRow"]')!.children).toHaveLength(3)
  })

  it('renders fallback text when block.call is null', () => {
    const block = makeNullCallBlock('Table: 用户统计 (result: r1)')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toContain('用户统计')
  })

  it('renders fallback when argsRaw is invalid JSON', () => {
    const block = makeSettledBlock('not json', 'fallback text')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('fallback text')
  })

  it('renders fallback when argsRaw is missing required fields', () => {
    const block = makeSettledBlock(JSON.stringify({ wrong: true }), 'raw output')
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
  })

  it('renders "数据已过期" when query_data is unavailable', () => {
    const block = makeSettledBlock(VALID_ARGS, 'text fallback')
    const { getByText, container } = render(
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
    const pre = container.querySelector('pre')
    expect(pre!.textContent).toBe('text fallback')
  })

  it('renders the full table expanded by default with valid data', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, getByRole, container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByRole('button', { expanded: true })).toBeDefined()
    expect(getByText('用户统计')).toBeDefined()
    expect(getByText('3 行')).toBeDefined()
    expect(getByText('姓名')).toBeDefined()
    expect(getByText('年龄')).toBeDefined()
    expect(getByText('城市')).toBeDefined()
    expect(getByText('Alice')).toBeDefined()
    expect(getByText('30')).toBeDefined()
    expect(getByText('Beijing')).toBeDefined()
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
  })

  it('uses args.columns to override TSV headers', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText, queryByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('姓名')).toBeDefined()
    expect(queryByText('name')).toBeNull()
  })

  it('collapses and expands on header click', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { getByRole, queryByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    const header = getByRole('button', { expanded: true })
    expect(queryByText('Alice')).not.toBeNull()
    fireEvent.click(header)
    expect(queryByText('Alice')).toBeNull()
    const collapsedHeader = getByRole('button', { expanded: false })
    fireEvent.click(collapsedHeader)
    expect(queryByText('Alice')).not.toBeNull()
  })

  it('renders KPI cards when kpi_columns are provided', () => {
    const block = makeSettledBlock(ARGS_WITH_KPI)
    const { getByText, container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('总年龄')).toBeDefined()
    expect(getByText('平均年龄')).toBeDefined()
    expect(getByText('最大年龄')).toBeDefined()
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('90')
    expect(kpiValues).toContain('35')
  })

  it('KPI shows em dash when column has no numeric values', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 0, aggregation: 'sum', label: '文本列求和' }],
    }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('—')).toBeDefined()
  })

  it('KPI shows em dash for unknown aggregation', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 1, aggregation: 'median', label: '中位数' }],
    }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('—')).toBeDefined()
  })

  it('KPI applies % format', () => {
    const tsv = 'metric\trate\nA\t0.125\nB\t0.250\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 1, aggregation: 'avg', label: '平均率', format: '%' }],
    }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    expect(getByText('18.8%')).toBeDefined()
  })

  it('KPI applies comma decimal format', () => {
    const tsv = 'item\tamount\nA\t1234.567\nB\t8901.234\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 1, aggregation: 'sum', label: '总金额', format: ',.2f' }],
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    const kpiValues = container.querySelectorAll('[class*="kpiValue"]')
    expect(kpiValues).toHaveLength(1)
    expect(kpiValues[0]?.textContent).toContain('10')
  })

  it('KPI handles min/count aggregations', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [
        { column: 1, aggregation: 'min', label: '最小' },
        { column: 1, aggregation: 'count', label: '计数' },
      ],
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('25')
    expect(kpiValues).toContain('3')
  })

  it('KPI cards remain visible when table is collapsed', () => {
    const block = makeSettledBlock(ARGS_WITH_KPI)
    const { getByRole, getByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    fireEvent.click(getByRole('button', { expanded: true }))
    expect(getByText('总年龄')).toBeDefined()
  })

  it('renders chart when chart intent is present', () => {
    const block = makeSettledBlock(ARGS_WITH_CHART)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(container.querySelector('[data-testid="line-chart"]')).not.toBeNull()
  })

  it('does not show chart when collapsed', () => {
    const block = makeSettledBlock(ARGS_WITH_CHART)
    const { getByRole, container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    fireEvent.click(getByRole('button', { expanded: true }))
    expect(container.querySelector('[data-testid="line-chart"]')).toBeNull()
  })

  it('ignores query_data results with seq >= block seq', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [{
          kind: 'tool-result' as const,
          seq: 15,
          time: Date.now(),
          callId: 'call-query',
          call: { name: 'query_data', argsRaw: '{}' },
          callTime: Date.now() - 1000,
          content: [{ type: 'text', text: TSV_CONTENT }],
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
    const block = makeSettledBlock(VALID_ARGS, 'text fallback', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
  })

  it('ignores errored query_data results', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [{
          kind: 'tool-result' as const,
          seq: 5,
          time: Date.now(),
          callId: 'call-query',
          call: { name: 'query_data', argsRaw: '{}' },
          callTime: Date.now() - 1000,
          content: [{ type: 'text', text: TSV_CONTENT }],
          isError: true,
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
    const block = makeSettledBlock(VALID_ARGS, 'text fallback', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
  })

  it('uses raw TSV headers when args.columns is not provided', () => {
    const argsNoColumns = JSON.stringify({ result_id: 'r1', title: '无列覆盖' })
    const block = makeSettledBlock(argsNoColumns)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('name')).toBeDefined()
    expect(getByText('age')).toBeDefined()
    expect(getByText('city')).toBeDefined()
  })

  it('renders virtual table for >100 rows', () => {
    const rows = Array.from({ length: 150 }, (_, i) => `row${i}\t${i}\tcity${i}`).join('\n')
    const tsv = `name\tnum\tcity\n${rows}\n(150 rows)`
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    expect(container.querySelector('[class*="virtualScroll"]')).not.toBeNull()
  })

  it('renders plain table for <=100 rows', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(container.querySelector('[class*="virtualScroll"]')).toBeNull()
    expect(container.querySelector('tbody')).not.toBeNull()
  })

  it('shows CSV download when rows hit MAX_DISPLAY_ROWS', () => {
    const rows = Array.from({ length: 10001 }, (_, i) => `r${i}\t${i}\tc${i}`).join('\n')
    const tsv = `name\tnum\tcity\n${rows}`
    const block = makeSettledBlock(VALID_ARGS)
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    expect(getByText('下载 CSV')).toBeDefined()
  })

  it('CSV download triggers blob creation and click', () => {
    const rows = Array.from({ length: 10001 }, (_, i) => `r,${i}\t${i}\t"c${i}"`).join('\n')
    const tsv = `name\tnum\tcity\n${rows}`
    const block = makeSettledBlock(VALID_ARGS)
    const revokeUrl = vi.fn()
    const createUrl = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
    const clicked = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clicked } as unknown as HTMLElement
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement
    })
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    fireEvent.click(getByText('下载 CSV'))
    expect(createUrl).toHaveBeenCalled()
    expect(clicked).toHaveBeenCalled()
    expect(revokeUrl).toHaveBeenCalledWith('blob:test')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render KPI row without kpi_columns', () => {
    const block = makeSettledBlock(VALID_ARGS)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(container.querySelector('[class*="kpiRow"]')).toBeNull()
  })

  it('does not render KPI row when kpi_columns is empty', () => {
    const args = JSON.stringify({ result_id: 'r1', title: 'test', kpi_columns: [] })
    const block = makeSettledBlock(args)
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(container.querySelector('[class*="kpiRow"]')).toBeNull()
  })

  it('KPI formats non-integer avg without explicit format', () => {
    const tsv = 'x\tval\na\t1\nb\t2\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 1, aggregation: 'avg', label: '均值' }],
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('1.5')
  })

  it('KPI handles format string without valid decimal digits', () => {
    const tsv = 'x\tval\na\t100\nb\t200\n(2 rows)'
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 1, aggregation: 'sum', label: '合计', format: ',.f' }],
    }))
    const { container } = render(
      <TableCard block={block} useSession={makeUseSession(tsv)} />,
    )
    const kpiValues = Array.from(container.querySelectorAll('[class*="kpiValue"]')).map(el => el.textContent)
    expect(kpiValues).toContain('300')
  })

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
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('')
  })

  it('handles content blocks without text field in data expired', () => {
    const block = {
      kind: 'tool-result',
      seq: 10,
      time: Date.now(),
      callId: 'call-1',
      call: { name: 'present_table', argsRaw: JSON.stringify({ result_id: 'r1', title: 'test' }) },
      callTime: Date.now() - 1000,
      content: [{ type: 'image', source: { data: '' } }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    } as unknown as ToolCallBlock
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(null)} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
  })

  it('skips non-tool-result nodes and non-query_data results when scanning', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [
          {
            kind: 'tool-result',
            seq: 3,
            time: Date.now() - 2000,
            callId: 'call-query',
            call: { name: 'query_data', argsRaw: '{}' },
            callTime: Date.now() - 3000,
            content: [{ type: 'text', text: TSV_CONTENT }],
            isError: false,
            callView: null,
            resultView: null,
            subCalls: [],
          },
          {
            kind: 'tool-result',
            seq: 5,
            time: Date.now() - 3000,
            callId: 'call-other',
            call: { name: 'bash', argsRaw: '{}' },
            callTime: Date.now() - 4000,
            content: [{ type: 'text', text: 'not query data' }],
            isError: false,
            callView: null,
            resultView: null,
            subCalls: [],
          },
          {
            kind: 'user-message',
            seq: 7,
            time: Date.now() - 5000,
            content: [{ type: 'text', text: 'hello' }],
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
    const block = makeSettledBlock(VALID_ARGS, '', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} />,
    )
    expect(getByText('Alice')).toBeDefined()
  })

  it('skips query_data with empty content text', () => {
    const useSession = <T,>(selector: (s: ConversationSnapshot) => T): T => {
      return selector({
        nodes: [
          {
            kind: 'tool-result',
            seq: 3,
            time: Date.now() - 3000,
            callId: 'call-query-empty',
            call: { name: 'query_data', argsRaw: '{}' },
            callTime: Date.now() - 4000,
            content: [{ type: 'text', text: '   ' }],
            isError: false,
            callView: null,
            resultView: null,
            subCalls: [],
          },
          {
            kind: 'tool-result',
            seq: 5,
            time: Date.now() - 2000,
            callId: 'call-query-good',
            call: { name: 'query_data', argsRaw: '{}' },
            callTime: Date.now() - 3000,
            content: [{ type: 'text', text: TSV_CONTENT }],
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
    const block = makeSettledBlock(VALID_ARGS, '', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} />,
    )
    expect(getByText('Alice')).toBeDefined()
  })

  it('shows data expired when query_data content is non-text only', () => {
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
    const block = makeSettledBlock(JSON.stringify({ result_id: 'r1', title: 'test' }), 'fallback', 10)
    const { getByText } = render(
      <TableCard block={block} useSession={useSession} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
  })

  it('shows data expired when parseTsv returns null on query_data content', () => {
    const block = makeSettledBlock(VALID_ARGS, 'fallback')
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession('(0 rows)')} />,
    )
    expect(getByText('数据已过期')).toBeDefined()
  })

  it('handles KPI with out-of-bounds column index', () => {
    const block = makeSettledBlock(JSON.stringify({
      result_id: 'r1',
      title: 'test',
      kpi_columns: [{ column: 99, aggregation: 'sum', label: '越界' }],
    }))
    const { getByText } = render(
      <TableCard block={block} useSession={makeUseSession(TSV_CONTENT)} />,
    )
    expect(getByText('—')).toBeDefined()
  })
})
