import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-present-decomposition'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface Metric {
  name: string
  value: string
  unit?: string
}

export interface PresentDecompositionResult {
  presented: boolean
  summary: string
  metrics: Metric[]
  dimensions: string[]
  time_range: string
  source?: string
  filters?: string[]
  confidence?: number
}

export function presentDecompositionResult(
  summary: string,
  metrics: Metric[],
  dimensions: string[],
  time_range: string,
  source?: string,
  filters?: string[],
  confidence?: number,
): PresentDecompositionResult {
  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error('present_decomposition requires a non-empty summary')
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('present_decomposition requires at least 1 metric')
  }
  for (const m of metrics) {
    if (!m.name || typeof m.name !== 'string' || m.name.trim() === '') {
      throw new Error('present_decomposition: each metric requires a non-empty name')
    }
    if (!m.value || typeof m.value !== 'string' || m.value.trim() === '') {
      throw new Error('present_decomposition: each metric requires a non-empty value')
    }
  }
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
    throw new Error('present_decomposition: confidence must be between 0 and 1')
  }
  return {
    presented: true,
    summary,
    metrics,
    dimensions,
    time_range,
    ...(source !== undefined ? { source } : {}),
    ...(filters !== undefined ? { filters } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  }
}

function formatDecomposition(value: PresentDecompositionResult): string {
  if (!value.presented) {
    return 'No decomposition to present.'
  }
  let text = `Query decomposition: ${value.summary}\n`
  text += `Time range: ${value.time_range}\n`
  text += `Dimensions: ${value.dimensions.join(', ')}\n`
  text += 'Metrics:\n'
  for (const m of value.metrics) {
    text += `  - ${m.name}: ${m.value}${m.unit ? ` (${m.unit})` : ''}\n`
  }
  if (value.source) {
    text += `Source: ${value.source}\n`
  }
  if (value.filters && value.filters.length > 0) {
    text += `Filters: ${value.filters.join(', ')}\n`
  }
  if (value.confidence !== undefined) {
    text += `Confidence: ${value.confidence}`
  }
  return text.trimEnd()
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'present_decomposition',
    description:
      'Present a structured query decomposition to the user: the interpreted '
      + 'summary, metrics, dimensions, and time range extracted from the '
      + 'original question. Use in the INTERPRETATION phase to show the user '
      + 'how their natural-language question was understood before execution.',
    parameters: {
      summary: {
        type: 'string',
        required: true,
        description: 'A natural-language summary of the interpreted query intent.',
      },
      metrics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: 'Metric name.' },
            value: { type: 'string', required: true, description: 'Metric expression or description.' },
            unit: { type: 'string', description: 'Optional unit of measurement.' },
          },
        },
        required: true,
        description: 'The metrics (measures) identified in the query.',
      },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'The dimensions (group-by axes) identified in the query.',
      },
      time_range: {
        type: 'string',
        required: true,
        description: 'The time range the query covers (e.g. "last 7 days", "2024-01 to 2024-03").',
      },
      source: {
        type: 'string',
        description: 'The primary data source or table used.',
      },
      filters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter conditions applied to the query.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score between 0 and 1 for the interpretation.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presented: { type: 'boolean', required: true },
          summary: { type: 'string', required: true },
          metrics: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                value: { type: 'string', required: true },
                unit: { type: 'string' },
              },
            },
          },
          dimensions: { type: 'array', items: { type: 'string' }, required: true },
          time_range: { type: 'string', required: true },
          source: { type: 'string' },
          filters: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatDecomposition(value as PresentDecompositionResult),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('present_decomposition aborted')
      }
      return presentDecompositionResult(
        args.summary,
        args.metrics as Metric[],
        args.dimensions,
        args.time_range,
        args.source,
        args.filters,
        args.confidence,
      ) as typeof args & { presented: boolean }
    },
  }))
}
