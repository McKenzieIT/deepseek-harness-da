// P7 stub tools — canned results per the readiness matrix (research/p7-four-phase-fit-to-da.md §4).
// These are NOT the real da seams (ctx.query P4b / ctx.schema P6 / ctx.embedder+ctx.retrieval P5 /
// ctx.audit P8 / subagent-qoder P3 — each validated by its own prototype). P7 stub-isolates to
// focus on the four-phase ORCHESTRATION (transitions/gate/budget/fallback/persona-switch).
// Realism: ctx.query 3-state QueryOutcome + ctx.audit tags inform the stub shapes.

// ── UNDERSTANDING ──────────────────────────────────────────
export const search_data_sources = () => ({
  candidates: [{ name: 'dws_pay_order_di', tier: 1 }],
  query_matches: [],
  verified_hit: null,
});
export const load_table_definition = ({ table = 'dws_pay_order_di' } = {}) => ({
  table,
  columns: [{ name: 'pay_amt', role: 'metric' }],
});
export const load_event_definition = ({ event = 'role.online' } = {}) => ({ event, params_fields: [] });
export const load_table_dimensions = ({ table = 'dim_charm_info' } = {}) => ({ table, dimensions: ['charm_id'] });
export const present_clarification = ({ questions = [] } = {}) => ({ kind: 'halt', questions }); // HALT — only UNDERSTANDING
export const save_accumulated_definition = () => ({ tier: 1, status: 'pending→approve' });

// ── GENERATION (P13 STUB — real critic deferred to P13 NL→SQL engine) ─────
export const critique_sql_tool = ({ confidence = 0.9 } = {}) => ({
  confidence,
  severity: 'clean',
  findings: [],
});
export const evaluate_sql_quality = ({ score = 80 } = {}) => ({ score, violations: [] });

// ── EXECUTION (ctx.query.execute 3-state QueryOutcome — P4b; tool-query consumer = Not-yet-specified, stubbed) ─
export const query_data = ({ outcome = 'done', failure_kind = null } = {}) => ({
  outcome, // 'done' | 'running' | 'failed' (ctx.query QueryOutcome 3-state)
  failure_kind, // transient|permission|not_found|syntax|resource|unknown
  result_id: outcome === 'done' ? 'r_001' : null,
  preview: outcome === 'done' ? 'full' : 'summary',
});

// ── INTERPRETATION (presentation/delivery tools — fog; stubbed) ──────────
export const present_decomposition = ({ subquestions = [] } = {}) => ({ card: 'decomposition', subquestions });
export const present_table = () => ({ card: 'table', result_id: 'r_001' });
export const compute = ({ op = 'ratio' } = {}) => ({ card: 'compute', op, value: 0.12 });
export const record_template_usage = () => ({ recorded: true });
export const suggest_followups = () => ({ followups: ['Drill down into pay_amt'] });

// ── UNIVERSAL ──────────────────────────────────────────────
export const lookup_terminology = ({ term } = {}) => ({ term, canonical: term });
export const get_user_preferences = () => ({ preferences: {} });
export const load_accumulated_definition = () => ({ definitions: [] });

export const STUB_TOOLS = {
  search_data_sources,
  load_table_definition,
  load_event_definition,
  load_table_dimensions,
  present_clarification,
  save_accumulated_definition,
  critique_sql_tool,
  evaluate_sql_quality,
  query_data,
  present_decomposition,
  present_table,
  compute,
  record_template_usage,
  suggest_followups,
  lookup_terminology,
  get_user_preferences,
  load_accumulated_definition,
};
