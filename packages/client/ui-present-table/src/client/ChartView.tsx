import { useMemo } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import type { ChartConfig } from './TableCard.tsx'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Tooltip,
  Legend,
)

const COLORS = [
  'rgba(59, 130, 246, 0.8)',
  'rgba(16, 185, 129, 0.8)',
  'rgba(245, 158, 11, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(139, 92, 246, 0.8)',
]

/** Read one theme CSS variable, falling back when the token is absent. */
function readCssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value !== '' ? value : fallback
}

/** Parse one cell into a chart value; empty/non-numeric cells become null gaps. */
function numericCell(row: string[] | undefined, index: number): number | null {
  const raw = row?.[index] ?? ''
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export interface ChartViewProps {
  chart: ChartConfig
  headers: string[]
  rows: string[][]
}

export default function ChartView({ chart, headers, rows }: ChartViewProps) {
  const chartData = useMemo(() => {
    const labels = rows.map(r => r[chart.x_column] ?? '')
    const datasets = chart.y_columns.map((colIdx, i) => ({
      label: headers[colIdx] ?? `Series ${i + 1}`,
      data: rows.map(r => numericCell(r, colIdx)),
      backgroundColor: COLORS[i % COLORS.length],
      borderColor: COLORS[i % COLORS.length],
      borderWidth: chart.type === 'line' ? 2 : 0,
      tension: 0.3,
      spanNulls: false,
    }))
    return { labels, datasets }
  }, [chart, headers, rows])

  const options = useMemo(() => {
    const text = readCssColor('--dsw-alias-content-secondary', '#667085')
    const grid = readCssColor('--dsw-alias-border-primary', 'rgba(102, 112, 133, 0.25)')
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: chart.y_columns.length > 1, labels: { color: text } },
      },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid, display: false } },
        y: { ticks: { color: text }, grid: { color: grid } },
      },
    }
  }, [chart.y_columns.length])

  return (
    <div style={{ height: 240, position: 'relative' }}>
      {chart.type === 'line'
        ? <Line data={chartData} options={options} />
        : <Bar data={chartData} options={options} />}
    </div>
  )
}
