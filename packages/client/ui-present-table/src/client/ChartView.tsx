import { useMemo } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PolarAreaController,
  PointElement,
  RadarController,
  RadialLinearScale,
  ScatterController,
  Tooltip,
} from 'chart.js'
import { Bar, Bubble, Doughnut, Line, PolarArea, Radar, Scatter } from 'react-chartjs-2'
import type { Chart } from 'chart.js'
import type { ChartConfig, ChartType } from './TableCard.tsx'

/** Series palette — literal canvas colors passed to Chart.js dataset props
 *  (not CSS; the token rule applies to TableCard.module.css). Mirrors the R4
 *  prototype palette. */
const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

/** Series color at palette index `i` (cycling). The `??` fallback means array
 *  access never yields `undefined`, avoiding the forbidden non-null assertion. */
function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length] ?? '#3b82f6'
}

function rgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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

/** Thousands-separated integer label for the value-pills (R4 valueLabelsPlugin). */
function formatNumber(n: number): string {
  const s = String(Math.round(n))
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Rounded-pill path on the 2d context (arcTo corners, no native roundRect). */
function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export interface ValueLabelsOpts {
  display?: boolean
}

/**
 * Self-written Chart.js plugin (R4): draws value-pills on top of every dataset
 * via `afterDatasetsDraw` so they are never occluded. Skips scatter/bubble
 * (points already carry the value), and skips non-radial charts with >8 points
 * (would collide). Pill placement: hbar → right of the bar; vbar/line/area/radar
 * → above the point; doughnut/polarArea → at the arc center. Replaces
 * chartjs-plugin-datalabels (no CDN dep, full draw-order/position control).
 */
export const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: Chart, _args: unknown, opts: ValueLabelsOpts | undefined) {
    if (!opts?.display) return
    const ctx = chart.ctx
    const type = (chart.config as unknown as { type: string }).type
    const indexAxis = chart.options.indexAxis
    const isRadial = type === 'doughnut' || type === 'polarArea'
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di)
      if (!meta || !meta.data || meta.hidden) return
      const data = ds.data as unknown[]
      const n = data.length
      if (type === 'scatter' || type === 'bubble') return
      if (n > 8 && !isRadial) return
      meta.data.forEach((el, ei) => {
        if (el == null) return
        const point = data[ei]
        const raw = point != null && typeof point === 'object' ? (point as { y?: number }).y : point
        if (raw == null || raw === '' || Number.isNaN(Number(raw))) return
        const label = formatNumber(Number(raw))
        const ex = (el as { x?: number }).x ?? 0
        const ey = (el as { y?: number }).y ?? 0
        let x = ex
        let y = ey
        if (type === 'bar' && indexAxis === 'y') {
          x = ex + 10
        } else if (type === 'bar') {
          y = ey - 10
        } else if (isRadial) {
          // arc center: x, y unchanged
        } else {
          y = ey - 10
        }
        ctx.save()
        ctx.font = '600 11px -apple-system, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const w = ctx.measureText(label).width
        const padX = 4
        const pillH = 15
        const pillW = w + padX * 2
        pillPath(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, 3)
        ctx.fillStyle = isRadial ? 'rgba(29, 41, 57, 0.78)' : 'rgba(255, 255, 255, 0.95)'
        ctx.fill()
        if (!isRadial) {
          ctx.strokeStyle = 'rgba(102, 112, 133, 0.35)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.fillStyle = isRadial ? '#fff' : '#1d2939'
        ctx.fillText(label, x, y)
        ctx.restore()
      })
    })
  },
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  BarController,
  LineController,
  DoughnutController,
  PolarAreaController,
  RadarController,
  ScatterController,
  BubbleController,
  Tooltip,
  Legend,
  valueLabelsPlugin,
)

export interface ChartViewProps {
  chart: ChartConfig
  headers: string[]
  rows: string[][]
  /** Show value-pills on the chart (valueLabelsPlugin). */
  showLabels?: boolean
}

interface BuiltChart {
  data: unknown
  options: unknown
}

/** Build the Chart.js `data` + `options` for the requested type. `area` is a
 *  filled line; `hbar` is a bar with `indexAxis: 'y'`; scatter/bubble use a
 *  linear x-axis with titled scales; doughnut uses `ArcElement` + cutout;
 *  radar/polarArea use `RadialLinearScale`. */
function buildChart(chart: ChartConfig, headers: string[], rows: string[][], showLabels: boolean): BuiltChart {
  const text = readCssColor('--dsw-alias-content-secondary', '#667085')
  const grid = readCssColor('--dsw-alias-border-primary', 'rgba(102, 112, 133, 0.25)')
  const valueLabels: ValueLabelsOpts = { display: showLabels }
  const legend = { display: chart.y_columns.length > 1, labels: { color: text } }
  const tooltip = {
    backgroundColor: 'rgba(29, 41, 57, 0.92)',
    titleColor: '#fff',
    bodyColor: '#fff',
    borderColor: grid,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 6,
  }
  const labels = rows.map(r => r[chart.x_column] ?? '')
  const yCol = chart.y_columns[0] ?? chart.x_column

  const cartesianScales = {
    x: { ticks: { color: text, autoSkip: true, maxRotation: 45, minRotation: 0 }, grid: { color: grid, display: false } },
    y: { ticks: { color: text }, grid: { color: grid } },
  }

  switch (chart.type) {
    case 'line':
    case 'area': {
      const fill = chart.type === 'area'
      const datasets = chart.y_columns.map((yc, i) => {
        const hex = seriesColor(i)
        return {
          label: headers[yc] ?? `Series ${i + 1}`,
          data: rows.map(r => numericCell(r, yc)),
          borderColor: rgba(hex, 0.8),
          backgroundColor: fill ? rgba(hex, 0.15) : rgba(hex, 0),
          fill,
          tension: 0.3,
          spanNulls: false,
        }
      })
      return {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend, tooltip, valueLabels },
          scales: cartesianScales,
        },
      }
    }
    case 'bar':
    case 'hbar': {
      const datasets = chart.y_columns.map((yc, i) => {
        const hex = seriesColor(i)
        return {
          label: headers[yc] ?? `Series ${i + 1}`,
          data: rows.map(r => numericCell(r, yc)),
          backgroundColor: rgba(hex, 0.8),
        }
      })
      return {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: chart.type === 'hbar' ? 'y' : undefined,
          plugins: { legend, tooltip, valueLabels },
          scales: cartesianScales,
        },
      }
    }
    case 'scatter':
    case 'bubble': {
      const xLabel = headers[chart.x_column] ?? 'x'
      const yLabel = headers[yCol] ?? 'y'
      const hex = seriesColor(0)
      const points = rows.map((r) => {
        const x = numericCell(r, chart.x_column)
        const y = numericCell(r, yCol)
        if (chart.type === 'bubble') {
          const radius = chart.r_column !== undefined ? numericCell(r, chart.r_column) ?? 0 : 0
          return { x, y, r: radius }
        }
        return { x, y }
      })
      const datasets = [{
        label: `${xLabel} × ${yLabel}`,
        data: points,
        backgroundColor: rgba(hex, chart.type === 'bubble' ? 0.55 : 0.7),
      }]
      return {
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend, tooltip, valueLabels },
          scales: {
            x: { type: 'linear', title: { display: true, text: xLabel }, ticks: { color: text }, grid: { color: grid } },
            y: { type: 'linear', title: { display: true, text: yLabel }, ticks: { color: text }, grid: { color: grid } },
          },
        },
      }
    }
    case 'doughnut': {
      const datasets = [{
        label: headers[yCol] ?? 'Series 1',
        data: rows.map(r => numericCell(r, yCol)),
        backgroundColor: labels.map((_, i) => rgba(seriesColor(i), 0.8)),
        borderColor: '#fff',
        borderWidth: 2,
      }]
      return {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: { legend, tooltip, valueLabels },
        },
      }
    }
    case 'radar':
    case 'polarArea': {
      const hex = seriesColor(4)
      const datasets = [{
        label: headers[yCol] ?? 'Series 1',
        data: rows.map(r => numericCell(r, yCol)),
        backgroundColor: chart.type === 'radar'
          ? rgba(hex, 0.15)
          : labels.map((_, i) => rgba(seriesColor(i), 0.6)),
        borderColor: chart.type === 'radar' ? rgba(hex, 0.8) : undefined,
        borderWidth: chart.type === 'radar' ? 2 : 1,
      }]
      return {
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend, tooltip, valueLabels },
          scales: {
            r: {
              suggestedMin: 0,
              grid: { color: grid },
              angleLines: { color: grid },
              pointLabels: { color: text },
              ticks: { color: text, backdropColor: 'transparent' },
            },
          },
        },
      }
    }
  }
}

export default function ChartView({ chart, headers, rows, showLabels = false }: ChartViewProps) {
  const built = useMemo(
    () => buildChart(chart, headers, rows, showLabels),
    [chart, headers, rows, showLabels],
  )
  // chart.js + react-chartjs-2 expect fully-typed ChartData/ChartOptions whose
  // shape varies per chart type; buildChart returns a per-type union, so assert
  // at the component boundary (each branch builds a structurally-correct value).
  const data = built.data as never
  const options = built.options as never
  switch (chart.type) {
    case 'line':
    case 'area':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Line data={data} options={options} />
        </div>
      )
    case 'bar':
    case 'hbar':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Bar data={data} options={options} />
        </div>
      )
    case 'scatter':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Scatter data={data} options={options} />
        </div>
      )
    case 'bubble':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Bubble data={data} options={options} />
        </div>
      )
    case 'doughnut':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Doughnut data={data} options={options} />
        </div>
      )
    case 'radar':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <Radar data={data} options={options} />
        </div>
      )
    case 'polarArea':
      return (
        <div style={{ height: 240, position: 'relative' }}>
          <PolarArea data={data} options={options} />
        </div>
      )
  }
}

export type { ChartType }
