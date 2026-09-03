import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CodeBindingFunction, CodeJsonValue, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import type { ResultEntry } from '@deepseek-ai/dsh-result-cache'

export const name = 'tool-compute'
export const inject = ['tools', 'codeRuntime', 'resultCache']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface ComputeResult {
  computed: boolean
  result_id: string
  description: string
  row_count: number
}

function computeResultId(code: string, sourceResultId: string): string {
  const hash = createHash('sha256').update(code).update(sourceResultId).digest('hex')
  return `cr_${hash.slice(0, 12)}`
}

function validateComputeOutput(value: CodeJsonValue | undefined): { columns: string[]; rows: unknown[][] } {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'compute: code must return an object with {columns: string[], rows: any[][]}. '
      + 'Use: return {"columns": [...], "rows": [...]}',
    )
  }
  const obj = value as Record<string, CodeJsonValue>
  if (!Array.isArray(obj.columns) || !obj.columns.every((c: unknown) => typeof c === 'string')) {
    throw new Error(
      'compute: returned object must have a "columns" field as string[]. '
      + 'Example: return {"columns": ["date", "value"], "rows": [[...], ...]}',
    )
  }
  if (!Array.isArray(obj.rows) || !obj.rows.every((r: unknown) => Array.isArray(r))) {
    throw new Error(
      'compute: returned object must have a "rows" field as array of arrays. '
      + 'Example: return {"columns": ["date", "value"], "rows": [["2024-01-01", 100], ...]}',
    )
  }
  // data-tools-present-eval-6: every row's length must match columns.length — a
  // jagged payload {columns:['a','b','c'], rows:[[1,2],[3,4,5]]} was accepted, cached, surfaced.
  const columns = obj.columns as string[]
  if (!obj.rows.every((r: unknown[]) => r.length === columns.length)) {
    throw new Error(
      `compute: returned rows must each have ${columns.length} cells (columns.length); a jagged payload is rejected.`,
    )
  }
  return { columns: obj.columns, rows: obj.rows }
}

function formatResult(value: ComputeResult): string {
  if (!value.computed) return 'Compute failed.'
  return `Computed: ${value.description} → ${value.result_id} (${value.row_count} rows)`
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'compute',
    description:
      'Execute Python/pandas code against a query result to derive new data. '
      + 'The code runs as an async function body with pandas and numpy available. '
      + 'Access source data via `await data.load_result({"result_id": "qr_..."})` which '
      + 'returns {"columns": [...], "rows": [...]}. The code must return an object with '
      + 'the same shape: {"columns": [...], "rows": [...]}. '
      + 'Use in the INTERPRETATION phase for calculations the SQL query did not cover '
      + '(ratios, running totals, pivots, statistical tests, etc.).',
    parameters: {
      result_id: {
        type: 'string',
        required: true,
        description: 'The result_id of the source data to compute against (from query_data execution).',
      },
      code: {
        type: 'string',
        required: true,
        description:
          'Python code to execute. Has pandas (pd) and numpy (np) available. '
          + 'Load data with `await data.load_result({"result_id": "..."})`. '
          + 'Must return {"columns": [...], "rows": [...]}.',
      },
      description: {
        type: 'string',
        required: true,
        description: 'Human-readable description of what this computation produces.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          computed: { type: 'boolean', required: true },
          result_id: { type: 'string', required: true },
          description: { type: 'string', required: true },
          row_count: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatResult(value),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('compute aborted')
      }

      const resultId = args.result_id
      const code = args.code
      const description = args.description

      if (typeof resultId !== 'string' || resultId.trim() === '') {
        throw new Error('compute requires a non-empty result_id')
      }
      if (typeof code !== 'string' || code.trim() === '') {
        throw new Error('compute requires non-empty code')
      }
      if (typeof description !== 'string' || description.trim() === '') {
        throw new Error('compute requires a non-empty description')
      }

      if (!ctx.resultCache.has(resultId)) {
        throw new Error(
          `compute: result_id "${resultId}" not found in cache. `
          + 'Ensure query_data has been executed and the result_id is correct.',
        )
      }

      const loadResult: CodeBindingFunction = (callArgs: unknown) => {
        const parsed = callArgs as { result_id?: string } | null
        const rid = parsed?.result_id
        if (typeof rid !== 'string' || rid.trim() === '') {
          return Promise.reject(new Error('load_result requires a non-empty result_id argument'))
        }
        const entry = ctx.resultCache.get(rid)
        if (entry === undefined) {
          return Promise.reject(new Error(`load_result: result_id "${rid}" not found in cache`))
        }
        return Promise.resolve({ columns: entry.columns, rows: entry.rows as CodeJsonValue[] })
      }

      const runResult: CodeRunResult = await ctx.codeRuntime.run({
        program: code,
        bindings: [{
          global: 'data',
          functions: { load_result: loadResult },
        }],
        signal: exec.signal,
      })

      if (runResult.error) {
        throw new Error(
          `compute: code execution failed (${runResult.error.kind}): ${runResult.error.message}`,
        )
      }

      const output = validateComputeOutput(runResult.value)
      const newResultId = computeResultId(code, resultId)
      const entry: ResultEntry = { columns: output.columns, rows: output.rows }
      ctx.resultCache.put(newResultId, entry)

      return {
        computed: true,
        result_id: newResultId,
        description,
        row_count: output.rows.length,
      }
    },
  }))
}
