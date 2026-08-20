/**
 * da-fresh `EvalCase` schema (zod) + loader entry. **Not** a zod-mirror of rbi's
 * `EvalCase` — rbi's v3 is BI-specific (`behavior`/`dimensions.sql_complexity`/
 * `query_intent`/`anchor_ds`/…); da borrows only `result_value` + `match_mode`
 * + `turns` (research Claim F / G2 HOLE F1) and adds a DELIVERY dimension
 * rbi-eval lacks. Runtime-validated at the file boundary (cases load from
 * YAML/JSON), per AGENTS.md ("validate at durable/file boundaries"); mirrors
 * the P6/P8b precedent of zod at file-load boundaries.
 *
 * @module @deepseek-ai/dsh-eval/eval_case
 */

import { z } from 'zod'

/** The 5 EXECUTION match modes (mirrors `match_modes.ts`; the schema is the file-boundary source of truth). */
const MATCH_MODE_ENUM = z.enum(['scalar_exact', 'multi_scalar_exact', 'row_count_range', 'set_equal', 'ordered_subset'])

/** da-fresh DELIVERY layer hint (explicit per-case wins over auto-route by answer type). */
const DELIVERY_MATCH_ENUM = z.enum(['scalar_exact', 'fuzzy', 'llm_judge'])

/** A scripted turn (user/assistant alternating; a non-empty script must contain a user turn). */
const TurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

/** A validated scripted turn. */
export type Turn = z.infer<typeof TurnSchema>

/** Case input: the terminal question, optional scope (for traceability;
 * P9 resolves scope server-side), and an optional scripted conversation. */
const CaseInputSchema = z.object({
  question: z.string(),
  scope_id: z.string().nullable().default(null),
  turns: z.array(TurnSchema).default([]),
})

/** Case expected: EXECUTION (`result_value`+`match_mode`, both-or-neither) and/or DELIVERY (`answer` + optional `delivery_match` hint). */
const CaseExpectedSchema = z.object({
  result_value: z.record(z.string(), z.unknown()).nullable().default(null),
  match_mode: MATCH_MODE_ENUM.nullable().default(null),
  answer: z.unknown().default(null),
  delivery_match: DELIVERY_MATCH_ENUM.nullable().default(null),
})

/** Lean dimensions (domain only); rbi BI-specific dimensions are dropped. */
const CaseDimensionsSchema = z.record(z.string(), z.unknown()).default({})

/**
 * The da-fresh EvalCase schema, with cross-field validation (turns must be
 * drivable; result_value+match_mode both-or-neither; at least one of
 * EXECUTION/DELIVERY declared).
 */
export const EvalCaseSchema = z.object({
  case_id: z.string(),
  input: CaseInputSchema,
  expected: CaseExpectedSchema,
  dimensions: CaseDimensionsSchema,
}).superRefine((c, ctx) => {
  const turns = c.input.turns
  if (turns.length > 0 && !turns.some(t => t.role === 'user')) {
    ctx.addIssue({ code: 'custom', message: `case ${c.case_id} non-empty script must have ≥1 user turn` })
  }
  const hasRv = c.expected.result_value !== null
  const hasMm = c.expected.match_mode !== null
  if (hasRv !== hasMm) {
    ctx.addIssue({ code: 'custom', message: `case ${c.case_id} expected.result_value + match_mode must both be present or both absent` })
  }
  if (!hasRv && c.expected.answer === null) {
    ctx.addIssue({ code: 'custom', message: `case ${c.case_id} must declare at least one of EXECUTION (result_value+match_mode) or DELIVERY (answer)` })
  }
})

/** A validated da-fresh eval case. */
export type EvalCase = z.infer<typeof EvalCaseSchema>

/** The expected portion of an {@link EvalCase}. */
export type CaseExpected = EvalCase['expected']

/** The DELIVERY match modes. */
export type DeliveryMatch = z.infer<typeof DELIVERY_MATCH_ENUM>

/**
 * Whether a case carries a scripted conversation (rbi `is_multi_turn`). A
 * single-turn case is a session with an empty script.
 * @param c - the validated case.
 * @returns whether the case is multi-turn.
 */
export function isMultiTurn(c: EvalCase): boolean {
  return c.input.turns.length > 0
}
