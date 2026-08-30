// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: { data: unknown; options: unknown }) => (
    <div
      data-testid="line-chart"
      data-labels={JSON.stringify((data as { labels: string[] }).labels)}
      data-datasets={JSON.stringify((data as { datasets: { data: (number | null)[] }[] }).datasets)}
      data-options={JSON.stringify(options)}
    />
  ),
  Bar: ({ data, options }: { data: unknown; options: unknown }) => (
    <div
      data-testid="bar-chart"
      data-labels={JSON.stringify((data as { labels: string[] }).labels)}
      data-datasets={JSON.stringify((data as { datasets: { data: (number | null)[] }[] }).datasets)}
      data-options={JSON.stringify(options)}
    />
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function capturedDatasets(testId: string, container: HTMLElement): { data: (number | null)[] }[] {
  const el = container.querySelector(`[data-testid="${testId}"]`)!
  return JSON.parse(el.getAttribute('data-datasets')!) as { data: (number | null)[] }[]
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
