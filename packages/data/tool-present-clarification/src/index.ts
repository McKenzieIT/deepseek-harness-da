/**
 * Model-facing `present_clarification` tool — the self-evolution #2a
 * clarification entry. The agent calls it to present ONE specific clarifying
 * question to the user when a real ambiguity or missing knowledge blocks
 * progress (e.g. which engine project a table lives in after a TABLE_NOT_FOUND).
 *
 * This is a PURE PRESENTATION tool: it records the question + options and
 * returns them for the UI to display. It has NO service dependency
 * (`inject=['tools']` only) — it does not probe `ctx.schema` / `ctx.audit` /
 * `ctx.identity`. The actual turn HALT is the phase-gate's job:
 * `captureToolData` in `packages/data/phase-gate/src/phase-gate.ts` already
 * detects the `present_clarification` call (via `tools/post-execute`) and sets
 * `awaiting_clarification=true` (the detection predates this tool — it was a
 * whitelist-only placeholder until now). Task 6 wires the HALT on that flag
 * (extends the existing UNDERSTANDING-only `route:clarify` HALT to fire in ANY
 * phase) and moves `present_clarification` from `UNDERSTANDING_TOOLS` to
 * `UNIVERSAL_TOOLS` so the agent can clarify mid-EXECUTION (self-evolution
 * loop: not_found → fallback GENERATION + inject → present_clarification →
 * HALT → user answers → update_table_config → retry qualifies).
 *
 * Mirrors `tool-load-table-definition`'s `defineTool` + `ctx.tools.register`
 * registration shape, including a pure, testable core (`presentClarificationResult`)
 * + a readable `render`. The `question` parameter is the one required input;
 * an empty/whitespace question throws (the one required parameter rejected) —
 * a structured-failure return is not used because the closed output schema
 * marks `question` as `required`, so a thrown error is the honest path (the
 * framework surfaces tool errors to the model).
 *
 * @module @deepseek-ai/dsh-tool-present-clarification
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-present-clarification'
export const inject = ['tools']

/** Configuration for the present_clarification tool (no knobs; pure presentation). */
export interface Config {}

/** Runtime configuration schema for the present_clarification plugin. */
export const Config: z<Config> = z.object({})

/** The canonical value returned by `present_clarification`'s `execute`. */
export interface PresentClarificationResult {
  /** Whether the clarifying question was presented (always `true` from execute; empty question throws). */
  readonly presented: boolean
  /** The one specific clarifying question the user must answer. */
  readonly question: string
  /** Optional multiple-choice options the user may pick from. */
  readonly options?: string[]
}

/**
 * The pure presentation core — validate the question + echo it back with
 * `presented:true`. Exported so the guard + projection are testable without a
 * Cordis context. The question is the one required parameter: an empty or
 * whitespace-only question throws (a clarifying question with no text is a
 * model error — the UI has nothing to display and the gate has nothing to
 * HALT on). A structured `{presented:false}` return is NOT used because the
 * closed output schema marks `question` as `required`, so a value without a
 * `question` string would fail output validation; the thrown error is the
 * honest, framework-surfaced path.
 * @param question - the one specific clarifying question for the user.
 * @param options - optional multiple-choice options.
 * @returns `{ presented: true, question, options? }` for the UI to display.
 */
export function presentClarificationResult(
  question: string,
  options?: string[],
): PresentClarificationResult {
  if (typeof question !== 'string' || question.trim() === '') {
    throw new Error('present_clarification requires a non-empty question')
  }
  return {
    presented: true,
    question,
    ...(options !== undefined ? { options } : {}),
  }
}

/**
 * Format a presented clarification as readable text for the model. The
 * `presented:false` branch is defensive — `execute` always returns
 * `presented:true` (empty question throws before reaching render) — but
 * render is pure + total, so a direct render call with a not-presented value
 * gets a neutral fallback (mirrors `tool-load-table-definition`'s S17 fallback).
 * @param value - the `PresentClarificationResult` to format.
 * @returns a single text block the model reads in the tool result.
 */
function formatClarification(value: PresentClarificationResult): string {
  if (!value.presented) {
    return 'No clarification to present.'
  }
  let text = `Clarifying question: ${value.question}`
  if (value.options !== undefined && value.options.length > 0) {
    text += `\nOptions: ${value.options.join(', ')}`
  }
  return text
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'present_clarification',
    description:
      'Present a clarifying question to the user and HALT the turn awaiting '
      + 'their answer. Use when a real ambiguity or missing knowledge (e.g. '
      + 'which engine project a table lives in) blocks progress. Emit exactly '
      + 'one specific question; the gate HALTs on this call (any phase).',
    parameters: {
      question: {
        type: 'string',
        required: true,
        description: 'One specific clarifying question for the user.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional multiple-choice options.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presented: { type: 'boolean', required: true },
          question: { type: 'string', required: true },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatClarification(value as PresentClarificationResult),
      }],
    },
    // oxlint-disable-next-line typescript/require-await -- async for interface conformance, returns Promise<T>
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('present_clarification aborted')
      }
      return presentClarificationResult(args.question, args.options)
    },
  }))
}
