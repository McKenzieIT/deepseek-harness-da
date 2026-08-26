// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('react-chartjs-2', () => ({
  Line: ({ data, options: _options }: { data: unknown; options: unknown }) => (
    <div data-testid="line-chart" data-labels={JSON.stringify((data as { labels: string[] }).labels)} />
  ),
  Bar: ({ data, options: _options }: { data: unknown; options: unknown }) => (
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

afterEach(cleanup)

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
    expect(el).toBeDefined()
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

  it('handles missing cell values gracefully', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView
        chart={{ type: 'line', x_column: 0, y_columns: [1] }}
        headers={['x', 'y']}
        rows={[['a'], ['b', 'not-a-number'], ['c', '10']]}
      />,
    )
    expect(getByTestId('line-chart')).toBeDefined()
  })

  it('shows legend when multiple y_columns', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { container } = render(
      <ChartView
        chart={{ type: 'bar', x_column: 0, y_columns: [1, 2, 3] }}
        headers={['x', 'a', 'b', 'c']}
        rows={[['1', '10', '20', '30']]}
      />,
    )
    expect(container.querySelector('[class*="chartContainer"]')).not.toBeNull()
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

  it('uses fallback x label and y value when row is shorter than column index', async () => {
    const { default: ChartView } = await import('../src/client/ChartView.tsx')
    const { getByTestId } = render(
      <ChartView
        chart={{ type: 'bar', x_column: 3, y_columns: [4] }}
        headers={['a', 'b', 'c', 'd', 'e']}
        rows={[['1'], ['2', '3']]}
      />,
    )
    expect(getByTestId('bar-chart')).toBeDefined()
  })
})
