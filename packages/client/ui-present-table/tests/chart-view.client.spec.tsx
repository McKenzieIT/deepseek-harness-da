// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function capturedDatasets(testId: string, container: HTMLElement): Record<string, unknown>[] {
  const el = container.querySelector(`[data-testid="${testId}"]`)!
  return JSON.parse(el.getAttribute('data-datasets')!) as Record<string, unknown>[]
}

function capturedOptions(testId: string, container: HTMLElement): Record<string, unknown> {
  const el = container.querySelector(`[data-testid="${testId}"]`)!
  return JSON.parse(el.getAttribute('data-options')!) as Record<string, unknown>
}

describe('ChartView', () => {
  it('renders a line chart when type is line', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView
        chart={{ type: 'line', x_column: 0, y_columns: [1] }}
        headers={['month', 'revenue']}
        rows={[['Jan', '100'], ['Feb', '200'], ['Mar', '300']]}
      />,
    )
    const el = getByTestId('line-chart')
    expect(JSON.parse(el.getAttribute('data-labels')!)).toEqual(['Jan', 'Feb', 'Mar'])
  })

  it('renders a bar chart when type is bar', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView
        chart={{ type: 'bar', x_column: 0, y_columns: [1, 2] }}
        headers={['category', 'sales', 'profit']}
        rows={[['A', '50', '10'], ['B', '80', '20']]}
      />,
    )
    expect(getByTestId('bar-chart')).toBeDefined()
  })

  it('maps missing and non-numeric cells to null gaps instead of 0', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView
        chart={{ type: 'line', x_column: 0, y_columns: [1] }}
        headers={['x', 'y']}
        rows={[['a', '10'], ['b', 'not-a-number'], ['c'], ['d', '']]}
      />,
    )
    const datasets = capturedDatasets('line-chart', container)
    expect(datasets[0]!.data).toEqual([10, null, null, null])
  })

  it('uses fallback text and grid colors when theme tokens are absent', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView
        chart={{ type: 'bar', x_column: 0, y_columns: [1] }}
        headers={['x', 'y']}
        rows={[['a', '1']]}
      />,
    )
    const el = container.querySelector('[data-testid="bar-chart"]')!
    const options = JSON.parse(el.getAttribute('data-options')!) as {
      scales: { y: { ticks: { color: string }; grid: { color: string } } }
    }
    expect(options.scales.y.ticks.color).toBe('#667085')
    expect(options.scales.y.grid.color).toBe('rgba(102, 112, 133, 0.25)')
  })

  it('reads tick and grid colors from theme CSS variables', async () => {
    const spy = vi.fn().mockReturnValue({
      getPropertyValue: (name: string) => name === '--dsw-alias-content-secondary' ? '#abc123' : '',
    })
    vi.stubGlobal('getComputedStyle', spy)
    window.getComputedStyle = spy
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView
        chart={{ type: 'line', x_column: 0, y_columns: [1] }}
        headers={['x', 'y']}
        rows={[['a', '1']]}
      />,
    )
    const el = container.querySelector('[data-testid="line-chart"]')!
    const options = JSON.parse(el.getAttribute('data-options')!) as {
      scales: { y: { ticks: { color: string }; grid: { color: string } } }
    }
    expect(options.scales.y.ticks.color).toBe('#abc123')
    expect(options.scales.y.grid.color).toBe('rgba(102, 112, 133, 0.25)')
    expect(spy).toHaveBeenCalled()
  })

  it('uses fallback series label when y_column index exceeds headers', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView
        chart={{ type: 'line', x_column: 0, y_columns: [5] }}
        headers={['x', 'y']}
        rows={[['a', '1'], ['b', '2']]}
      />,
    )
    expect(getByTestId('line-chart')).toBeDefined()
  })

  it('uses fallback x label and null y value when row is shorter than column index', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView
        chart={{ type: 'bar', x_column: 3, y_columns: [4] }}
        headers={['a', 'b', 'c', 'd', 'e']}
        rows={[['1'], ['2', '3']]}
      />,
    )
    const datasets = capturedDatasets('bar-chart', container)
    expect(datasets[0]!.data).toEqual([null, null])
  })
})

describe('ChartView chart types (R4 expansion)', () => {
  const headers = ['ds', 'amt', 'uv', 'arpu']
  const rows = [
    ['07-01', '100', '88', '1.1'],
    ['07-02', '200', '91', '2.2'],
  ]

  it('renders area as a filled line (dataset.fill true)', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'area', x_column: 0, y_columns: [1] }} headers={headers} rows={rows} />,
    )
    const datasets = capturedDatasets('line-chart', container)
    expect(datasets[0]!.fill).toBe(true)
  })

  it('renders hbar as a bar with indexAxis y', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'hbar', x_column: 0, y_columns: [1] }} headers={headers} rows={rows} />,
    )
    const options = capturedOptions('bar-chart', container)
    expect(options.indexAxis).toBe('y')
  })

  it('renders scatter with {x,y} points from x_column + y_columns[0]', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'scatter', x_column: 1, y_columns: [2] }} headers={headers} rows={rows} />,
    )
    const datasets = capturedDatasets('scatter-chart', container)
    expect(datasets[0]!.data).toEqual([{ x: 100, y: 88 }, { x: 200, y: 91 }])
  })

  it('renders bubble with {x,y,r} points from x_column + y_columns[0] + r_column', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'bubble', x_column: 1, y_columns: [2], r_column: 3 }} headers={headers} rows={rows} />,
    )
    const datasets = capturedDatasets('bubble-chart', container)
    expect(datasets[0]!.data).toEqual([{ x: 100, y: 88, r: 1.1 }, { x: 200, y: 91, r: 2.2 }])
  })

  it('renders doughnut with a cutout option', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container, getByTestId } = render(
      <ChartView chart={{ type: 'doughnut', x_column: 0, y_columns: [1] }} headers={headers} rows={rows} />,
    )
    expect(getByTestId('doughnut-chart')).toBeDefined()
    const options = capturedOptions('doughnut-chart', container)
    expect(options.cutout).toBeDefined()
  })

  it('renders radar with a radial r scale', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'radar', x_column: 0, y_columns: [1] }} headers={headers} rows={rows} />,
    )
    const options = capturedOptions('radar-chart', container) as { scales: Record<string, unknown> }
    expect(options.scales.r).toBeDefined()
  })

  it('renders polarArea with a radial r scale', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'polarArea', x_column: 0, y_columns: [1] }} headers={headers} rows={rows} />,
    )
    const options = capturedOptions('polararea-chart', container) as { scales: Record<string, unknown> }
    expect(options.scales.r).toBeDefined()
  })

  it('renders bar with a fallback series label when y_column exceeds headers', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView chart={{ type: 'bar', x_column: 0, y_columns: [5] }} headers={['x', 'y']} rows={[['a', '1']]} />,
    )
    expect(getByTestId('bar-chart')).toBeDefined()
  })

  it('renders scatter with fallback axis labels when headers are short', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView chart={{ type: 'scatter', x_column: 3, y_columns: [4] }} headers={['x', 'y']} rows={[['1', '2']]} />,
    )
    expect(getByTestId('scatter-chart')).toBeDefined()
  })

  it('renders doughnut using x_column as the value column when y_columns is empty', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView chart={{ type: 'doughnut', x_column: 0, y_columns: [] }} headers={['k', 'v']} rows={[['a', '1'], ['b', '2']]} />,
    )
    expect(getByTestId('doughnut-chart')).toBeDefined()
  })

  it('renders doughnut with a fallback label when yCol exceeds headers', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView chart={{ type: 'doughnut', x_column: 0, y_columns: [5] }} headers={['k']} rows={[['a', '1']]} />,
    )
    expect(getByTestId('doughnut-chart')).toBeDefined()
  })

  it('renders radar with a fallback label when yCol exceeds headers', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView chart={{ type: 'radar', x_column: 0, y_columns: [5] }} headers={['k']} rows={[['a', '1']]} />,
    )
    expect(getByTestId('radar-chart')).toBeDefined()
  })

  it('renders bubble with r=0 when r_column is missing or non-numeric', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const missing = render(
      <ChartView chart={{ type: 'bubble', x_column: 1, y_columns: [2] }} headers={['d', 'x', 'y']} rows={[['a', '1', '2']]} />,
    )
    const missingData = JSON.parse(missing.container.querySelector('[data-testid="bubble-chart"]')!.getAttribute('data-datasets')!)
    expect(missingData[0].data).toEqual([{ x: 1, y: 2, r: 0 }])
    const nonNumeric = render(
      <ChartView
        chart={{ type: 'bubble', x_column: 1, y_columns: [2], r_column: 0 }}
        headers={['d', 'x', 'y']}
        rows={[['notnum', '1', '2']]}
      />,
    )
    const nonNumData = JSON.parse(nonNumeric.container.querySelector('[data-testid="bubble-chart"]')!.getAttribute('data-datasets')!)
    expect(nonNumData[0].data).toEqual([{ x: 1, y: 2, r: 0 }])
  })
})

describe('ChartView valueLabels toggle (valueLabelsPlugin options)', () => {
  it('sets plugins.valueLabels.display true when showLabels is set', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'bar', x_column: 0, y_columns: [1] }} headers={['x', 'y']} rows={[['a', '1']]} showLabels />,
    )
    const options = capturedOptions('bar-chart', container) as { plugins: { valueLabels: { display: boolean } } }
    expect(options.plugins.valueLabels.display).toBe(true)
  })

  it('defaults plugins.valueLabels.display false when showLabels is absent', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView chart={{ type: 'bar', x_column: 0, y_columns: [1] }} headers={['x', 'y']} rows={[['a', '1']]} />,
    )
    const options = capturedOptions('bar-chart', container) as { plugins: { valueLabels: { display: boolean } } }
    expect(options.plugins.valueLabels.display).toBe(false)
  })
})

describe('valueLabelsPlugin afterDatasetsDraw', () => {
  interface MockPoint { x: number; y: number }

  function mockCtx(): Record<string, unknown> {
    const fn = (): ReturnType<typeof vi.fn> => vi.fn()
    return {
      save: fn(), restore: fn(),
      font: '', textAlign: '', textBaseline: '',
      measureText: vi.fn().mockReturnValue({ width: 10 }),
      beginPath: fn(), moveTo: fn(), arcTo: fn(), closePath: fn(),
      fill: fn(), stroke: fn(), fillText: fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 0,
    }
  }

  function mockChart(opts: {
    type: string
    values?: unknown[]
    points?: (MockPoint | null)[]
    hidden?: boolean
    metaNull?: boolean
    dataNull?: boolean
    indexAxis?: 'x' | 'y'
  }) {
    const ctx = mockCtx()
    const values = opts.values ?? [100]
    const points = opts.points ?? values.map(() => ({ x: 5, y: 5 }) as MockPoint)
    return {
      ctx,
      config: { type: opts.type },
      options: { indexAxis: opts.indexAxis, plugins: { valueLabels: { display: true } } },
      data: { datasets: [{ data: values }] },
      getDatasetMeta: (_di: number) => {
        if (opts.metaNull) return null
        if (opts.dataNull) return { data: null, hidden: false }
        return { data: points, hidden: opts.hidden ?? false }
      },
    }
  }

  async function draw(chart: ReturnType<typeof mockChart>, display = true): Promise<ReturnType<typeof vi.fn>> {
    const { valueLabelsPlugin } = await import('../src/client/ChartView.tsx')
    valueLabelsPlugin.afterDatasetsDraw(chart as never, {}, { display })
    return (chart.ctx as { fillText: ReturnType<typeof vi.fn> }).fillText
  }

  it('no-ops when display is false', async () => {
    expect(await draw(mockChart({ type: 'bar' }), false)).not.toHaveBeenCalled()
  })

  it('skips scatter (points already carry the value)', async () => {
    expect(await draw(mockChart({ type: 'scatter' }))).not.toHaveBeenCalled()
  })

  it('skips bubble', async () => {
    expect(await draw(mockChart({ type: 'bubble' }))).not.toHaveBeenCalled()
  })

  it('skips non-radial charts with >8 points (would collide)', async () => {
    expect(await draw(mockChart({ type: 'bar', values: Array.from({ length: 9 }, () => 1) }))).not.toHaveBeenCalled()
  })

  it('skips a hidden dataset', async () => {
    expect(await draw(mockChart({ type: 'bar', hidden: true }))).not.toHaveBeenCalled()
  })

  it('skips when getDatasetMeta returns null', async () => {
    expect(await draw(mockChart({ type: 'bar', metaNull: true }))).not.toHaveBeenCalled()
  })

  it('skips when meta.data is null', async () => {
    expect(await draw(mockChart({ type: 'bar', dataNull: true }))).not.toHaveBeenCalled()
  })

  it('skips a null element but draws the rest', async () => {
    expect(await draw(mockChart({ type: 'bar', values: [100, 200], points: [null, { x: 5, y: 5 }] }))).toHaveBeenCalledTimes(1)
  })

  it('skips null/empty/non-numeric values but draws the valid one', async () => {
    expect(await draw(mockChart({ type: 'bar', values: [null, '', 'N/A', 100] }))).toHaveBeenCalledTimes(1)
  })

  it('reads .y from object point data (Chart.js {x,y} format)', async () => {
    const fillText = await draw(mockChart({ type: 'line', values: [{ y: 42 }] }))
    expect(fillText).toHaveBeenCalledWith('42', expect.any(Number), expect.any(Number))
  })

  it('draws labels for a vertical bar (above)', async () => {
    const fillText = await draw(mockChart({ type: 'bar' }))
    expect(fillText).toHaveBeenCalledWith('100', expect.any(Number), expect.any(Number))
  })

  it('draws labels for an hbar (indexAxis y → right side)', async () => {
    expect(await draw(mockChart({ type: 'bar', indexAxis: 'y' }))).toHaveBeenCalled()
  })

  it('draws labels for a line', async () => {
    expect(await draw(mockChart({ type: 'line' }))).toHaveBeenCalled()
  })

  it('draws labels for a doughnut (radial center)', async () => {
    expect(await draw(mockChart({ type: 'doughnut' }))).toHaveBeenCalled()
  })

  it('draws labels for polarArea (radial center)', async () => {
    expect(await draw(mockChart({ type: 'polarArea' }))).toHaveBeenCalled()
  })

  it('draws labels for a radar', async () => {
    expect(await draw(mockChart({ type: 'radar' }))).toHaveBeenCalled()
  })

  it('draws labels at x/y=0 when the element lacks geometry', async () => {
    // element without x/y → the ?? 0 fallback (defensive against malformed elements)
    const chart = mockChart({ type: 'bar', values: [100], points: [{} as MockPoint] })
    expect(await draw(chart)).toHaveBeenCalledWith('100', expect.any(Number), expect.any(Number))
  })
})
