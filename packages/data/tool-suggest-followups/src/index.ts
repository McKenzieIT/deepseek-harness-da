import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-suggest-followups'
export const inject = ['tools']

export interface Config {}
export const Config: z<Config> = z.object({})

export interface Suggestion {
  label: string
  value: string
}

export interface SuggestFollowupsResult {
  presented: boolean
  suggestions: Suggestion[]
}

export function suggestFollowupsResult(
  suggestions: Suggestion[],
): SuggestFollowupsResult {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new Error('suggest_followups requires at least 1 suggestion')
  }
  if (suggestions.length > 5) {
    throw new Error('suggest_followups allows at most 5 suggestions')
  }
  for (const s of suggestions) {
    if (!s.label || typeof s.label !== 'string' || s.label.trim() === '') {
      throw new Error('suggest_followups: each suggestion requires a non-empty label')
    }
    if (!s.value || typeof s.value !== 'string' || s.value.trim() === '') {
      throw new Error('suggest_followups: each suggestion requires a non-empty value')
    }
  }
  return {
    presented: true,
    suggestions,
  }
}

function formatFollowups(value: SuggestFollowupsResult): string {
  if (!value.presented) {
    return 'No follow-up suggestions to present.'
  }
  const lines = ['Follow-up suggestions:']
  for (const s of value.suggestions) {
    lines.push(`  - ${s.label}: ${s.value}`)
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'suggest_followups',
    description:
      'Suggest follow-up questions the user might ask next, based on the '
      + 'current query results. Use in the INTERPRETATION phase to offer '
      + 'actionable next steps (drill-downs, comparisons, time shifts). '
      + 'Provide 1-5 suggestions, each with a full query value and a label '
      + 'of at most ≤ ~20 characters / ≤ 4 words that never repeats the value — '
      + 'the UI renders the label on the first line and the full value '
      + 'underneath, so the label is a short tag, not a preview.',
    parameters: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', required: true, description: 'Short tag for the row (≤ ~20 characters / ≤ 4 words). Never repeat the value — the UI shows the full value under the label.' },
            value: { type: 'string', required: true, description: 'The full follow-up question/query to execute if the user selects this.' },
          },
        },
        required: true,
        description: 'Array of 1-5 follow-up suggestions, each with a label and value.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presented: { type: 'boolean', required: true },
          suggestions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string', required: true },
                value: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatFollowups(value as SuggestFollowupsResult),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('suggest_followups aborted')
      }
      return suggestFollowupsResult(
        args.suggestions as Suggestion[],
      ) as typeof args & { presented: boolean }
    },
  }))
}
