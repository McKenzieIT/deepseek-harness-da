import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-present-table'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface KpiColumn {
  column: number
  aggregation: string
  label: string
  format?: string
}

/** The native Chart.js types this tool and the ui-present-table client render
 *  (R4 chart-type expansion). pie-only is excluded (doughnut is preferred);
 *  heatmap/sankey/treemap are non-native and deferred to a separate ECharts
 *  effort. Kept as a runtime list so the schema enum and the fail-loud guard
 *  stay in lockstep with the literal union. */
export const CHART_TYPES = [
  'line', 'bar', 'area', 'hbar', 'scatter', 'doughnut', 'bubble', 'radar', 'polarArea',
] as const

export type ChartType = typeof CHART_TYPES[number]

export interface ChartConfig {
  type: ChartType
  x_column: number
  y_columns: number[]
  /** Column index for the bubble radius (the 3rd numeric metric; bubble only). */
  r_column?: number
}

export interface PresentTableResult {
  presented: boolean
  result_id: string
  title: string
  columns?: string[]
  column_types?: string[]
  sort_column?: number
  kpi_columns?: KpiColumn[]
  chart?: ChartConfig
}

export function presentTableResult(
  result_id: string,
  title: string,
  columns?: string[],
  column_types?: string[],
  sort_column?: number,
  kpi_columns?: KpiColumn[],
  chart?: ChartConfig,
): PresentTableResult {
  if (typeof result_id !== 'string' || result_id.trim() === '') {
    throw new Error('present_table requires a non-empty result_id')
  }
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('present_table requires a non-empty title')
  }
  // Tool args are an external boundary (model/tool JSON); chart.type may be
  // invalid at runtime despite the typed union — keep fail-loud. pie-only and
  // any non-native type are rejected here (R4: doughnut over pie; heatmap/
  // sankey/treemap deferred to a separate ECharts effort).
  if (chart !== undefined && !(CHART_TYPES as readonly string[]).includes(chart.type)) {
    throw new Error(`present_table: chart.type must be one of ${CHART_TYPES.join(', ')}`)
  }
  return {
    presented: true,
    result_id,
    title,
    ...(columns !== undefined ? { columns } : {}),
    ...(column_types !== undefined ? { column_types } : {}),
    ...(sort_column !== undefined ? { sort_column } : {}),
    ...(kpi_columns !== undefined ? { kpi_columns } : {}),
    ...(chart !== undefined ? { chart } : {}),
  }
}

function formatTable(value: PresentTableResult): string {
  if (!value.presented) {
    return 'No table to present.'
  }
  const parts: string[] = [`Table: ${value.title} (result: ${value.result_id}`]
  let header = parts[0] ?? ''
  if (value.columns && value.columns.length > 0) {
    header += `, ${value.columns.length} columns`
  }
  if (value.sort_column !== undefined && value.sort_column >= 0) {
    header += `, sort: col ${value.sort_column}`
  }
  if (value.chart) {
    header += `, chart: ${value.chart.type}`
  }
  header += ')'
  parts[0] = header
  if (value.kpi_columns && value.kpi_columns.length > 0) {
    parts.push('KPIs:')
    for (const kpi of value.kpi_columns) {
      parts.push(`  - ${kpi.label}: ${kpi.aggregation}(col ${kpi.column})${kpi.format ? ` [${kpi.format}]` : ''}`)
    }
  }
  return parts.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'present_table',
    description:
      'Present a query result table to the user with display metadata: title, '
      + 'column layout, sort order, KPI aggregations, and optional chart config. '
      + 'Use in the INTERPRETATION phase to instruct the UI how to render the '
      + 'executed query result. '
      + 'Chart-type heuristic — pick by metric × dimension × grain: '
      + 'metric + time grain (ds) → line (cumulative → area); '
      + 'metric + category dimension → bar (long labels → hbar); '
      + '2 metrics (correlation) → scatter; '
      + '3 metrics → bubble (x, y, r); '
      + 'metric + ≤8 value dimensions + share → doughnut; '
      + 'one entity × N metrics → radar/polarArea. '
      + 'The client validator degrades an infeasible choice to bar '
      + '(e.g. scatter with <2 numeric columns, doughnut with >8 classes, '
      + 'line/area whose x is not a date/ordinal).',
    parameters: {
      result_id: {
        type: 'string',
        required: true,
        description: 'The ID of the query result to present (from query_data execution).',
      },
      title: {
        type: 'string',
        required: true,
        description: 'Human-readable title for the table display.',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column names for display (overrides raw result headers).',
      },
      column_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Semantic type per column (e.g. "number", "date", "string").',
      },
      sort_column: {
        type: 'number',
        description: 'Index of the column to sort by (-1 for no sort).',
      },
      kpi_columns: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            column: { type: 'number', required: true, description: 'Column index.' },
            aggregation: { type: 'string', required: true, description: 'Aggregation function (sum, avg, max, min, count).' },
            label: { type: 'string', required: true, description: 'Display label for the KPI.' },
            format: { type: 'string', description: 'Optional format string (e.g. ",.2f", "%").' },
          },
        },
        description: 'Columns to display as KPI summary cards above the table.',
      },
      chart: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            required: true,
            enum: [...CHART_TYPES],
            description:
              'Chart type. Pick by metric×dimension×grain (see the tool heuristic); '
              + 'the client degrades infeasible choices to bar.',
          },
          x_column: {
            type: 'number', required: true,
            description:
              'Column index for the x-axis '
              + '(category for bar/doughnut/radar; numeric x for scatter/bubble).',
          },
          y_columns: {
            type: 'array', items: { type: 'number' }, required: true,
            description:
              'Column indices for y-axis series '
              + '(scatter/bubble use the first as y).',
          },
          r_column: { type: 'number', description: 'Column index for the bubble radius (3rd numeric metric; bubble only).' },
        },
        description: 'Optional chart visualization config.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presented: { type: 'boolean', required: true },
          result_id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          columns: { type: 'array', items: { type: 'string' } },
          column_types: { type: 'array', items: { type: 'string' } },
          sort_column: { type: 'number' },
          kpi_columns: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                column: { type: 'number', required: true },
                aggregation: { type: 'string', required: true },
                label: { type: 'string', required: true },
                format: { type: 'string' },
              },
            },
          },
          chart: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', required: true },
              x_column: { type: 'number', required: true },
              y_columns: { type: 'array', items: { type: 'number' }, required: true },
              r_column: { type: 'number' },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatTable(value as PresentTableResult),
      }],
    },
    // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<T>
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('present_table aborted')
      }
      return presentTableResult(
        args.result_id,
        args.title,
        args.columns,
        args.column_types,
        args.sort_column,
        args.kpi_columns,
        args.chart,
      ) as typeof args & { presented: boolean }
    },
  }))
}
