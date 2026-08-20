// PROTOTYPE (throwaway) — P11 eval harness · da-fresh EvalCase schema + loader.
// NOT a rbi zod-mirror. rbi EvalCase v3 is BI-specific (behavior/dimensions/sql_steps/anchor_ds/...);
// da borrows only result_value + match_mode + turns (research Claim F / G2 HOLE F1).
// Plain JS + validate() — zero-dep (P7 precedent), no zod in throwaway proto.

export const MATCH_MODES = [
  'scalar_exact',
  'multi_scalar_exact',
  'row_count_range',
  'set_equal',
  'ordered_subset',
]

// da-fresh DELIVERY layer hint (explicit per-case wins over auto-route by answer type).
export const DELIVERY_MATCHES = ['scalar_exact', 'fuzzy', 'llm_judge']

export function makeCase(spec) {
  const c = {
    case_id: spec.case_id,
    input: {
      question: spec.input.question,
      // scope_id is BI-specific in rbi (data-domain id); da keeps it optional — access-isolation
      // (P9) resolves scope server-side, eval case may carry it for traceability.
      scope_id: spec.input.scope_id ?? null,
      turns: (spec.input.turns ?? []).map((t) => ({ role: t.role, content: t.content })),
    },
    expected: {
      // EXECUTION expected (5 match_mode envelope, see match_modes.mjs). Both present or both absent.
      result_value: spec.expected.result_value ?? null,
      match_mode: spec.expected.match_mode ?? null,
      // DELIVERY expected answer (da-fresh; rbi-eval has no DELIVERY dimension — this is da-new).
      answer: spec.expected.answer ?? null,
      // DELIVERY layer hint; null => auto-route by answer type (delivery.mjs routeDelivery).
      delivery_match: spec.expected.delivery_match ?? null,
    },
    // lean: domain only. DROPPED rbi BI-specific dimensions (sql_complexity / query_intent /
    // interaction_complexity / data_source / time_complexity / ambiguity_type / semantic_coverage).
    dimensions: spec.dimensions ?? {},
  }
  validateCase(c)
  return c
}

export function validateCase(c) {
  if (!c.case_id) throw new Error('case missing case_id')
  if (!c.input.question) throw new Error(`case ${c.case_id} missing input.question`)
  for (const t of c.input.turns) {
    if (t.role !== 'user' && t.role !== 'assistant')
      throw new Error(`case ${c.case_id} turn role must be user|assistant, got ${t.role}`)
    if (typeof t.content !== 'string')
      throw new Error(`case ${c.case_id} turn content must be string`)
  }
  // rbi MultiTurnSession guard: a non-empty script must have ≥1 user turn (a script the driver
  // cannot advance is a defect, not a single-turn case — session.py MultiTurnSession.__init__).
  if (c.input.turns.length && !c.input.turns.some((t) => t.role === 'user'))
    throw new Error(`case ${c.case_id} non-empty script must have ≥1 user turn`)
  // EXECUTION expected: result_value + match_mode both present or both absent.
  const hasRv = c.expected.result_value != null
  const hasMm = c.expected.match_mode != null
  if (hasRv !== hasMm)
    throw new Error(`case ${c.case_id} expected.result_value + match_mode must both be present or both absent`)
  if (hasMm && !MATCH_MODES.includes(c.expected.match_mode))
    throw new Error(`case ${c.case_id} unknown match_mode ${c.expected.match_mode}`)
  if (c.expected.delivery_match && !DELIVERY_MATCHES.includes(c.expected.delivery_match))
    throw new Error(`case ${c.case_id} unknown delivery_match ${c.expected.delivery_match}`)
  return c
}

// rbi is_multi_turn (multi_turn.py): a case is multi-turn iff it carries a scripted conversation.
export function isMultiTurn(c) {
  return c.input.turns.length > 0
}
