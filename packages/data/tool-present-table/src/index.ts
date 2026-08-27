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

export interface ChartConfig {
  type: 'line' | 'bar'
  x_column: number
  y_columns: number[]
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
  if (chart !== undefined && chart.type !== 'line' && chart.type !== 'bar') {
    throw new Error('present_table: chart.type must be "line" or "bar"')
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
  if (value.columns && value.columns.length > 0) {
    parts[0] += `, ${value.columns.length} columns`
  }
  if (value.sort_column !== undefined && value.sort_column >= 0) {
    parts[0] += `, sort: col ${value.sort_column}`
  }
  if (value.chart) {
    parts[0] += `, chart: ${value.chart.type}`
  }
  parts[0] += ')'
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
      + 'executed query result.',
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
          type: { type: 'string', required: true, enum: ['line', 'bar'], description: 'Chart type.' },
          x_column: { type: 'number', required: true, description: 'Column index for the x-axis.' },
          y_columns: { type: 'array', items: { type: 'number' }, required: true, description: 'Column indices for y-axis series.' },
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
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatTable(value as PresentTableResult),
      }],
    },
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
        args.kpi_columns as KpiColumn[] | undefined,
        args.chart as ChartConfig | undefined,
      ) as typeof args & { presented: boolean }
    },
  }))
}
