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
import css from './TableCard.module.css'

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
      data: rows.map(r => parseFloat(r[colIdx] ?? '0') || 0),
      backgroundColor: COLORS[i % COLORS.length],
      borderColor: COLORS[i % COLORS.length],
      borderWidth: chart.type === 'line' ? 2 : 0,
      tension: 0.3,
    }))
    return { labels, datasets }
  }, [chart, headers, rows])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: chart.y_columns.length > 1 },
    },
    scales: {
      x: { grid: { display: false } },
    },
  }), [chart.y_columns.length])

  return (
    <div className={css.chartContainer}>
      {chart.type === 'line'
        ? <Line data={chartData} options={options} />
        : <Bar data={chartData} options={options} />}
    </div>
  )
}
