// P7 preset overlay — the agent.cordis.yml structure (agent-plane composition).
// This is the PROTOTYPE representation of the four-phase preset; the real preset ships as
// apps/cli/config/agent-presets/data-agent/agent.cordis.yml (or out-of-tree) in P7b hardening.
//
// P7 decisions encoded here:
//  • persona = base static section, order 0 (option C — "base 留 P7 内"; _PHASE_INSTRUCTIONS
//    injected dynamically by the phase-gate plugin at system-prompt/assemble, NOT a complete:true
//    section which would suppress tool guidance / compaction).
//  • NO planning group — goal/todo/plan is a different orchestration mode (research §5#3); kept
//    host-plane NOT-disabled (honors Q8 "保留不禁用"), mounted in a separate preset for the G1
//    experiment. This preset does not touch goal/todo/plan package state.
//  • all-phase tools mounted ONCE — catalog stable across phases (KV-cache-friendly); the
//    phase-gate guard() hard-denies out-of-phase calls (plan-mode "stable catalog + rule
//    constraint" idea, but harder).
//  • phase-gate plugin in an isolate realm (entry-local; NOT root-realm — a 2nd session mounting
//    a same-named root-realm service would collide and be rejected at mount, per standard preset
//    header comment).
//  • model route NOT in preset (installAgentLlmTarget seam — harness-agent-loop.md §1.2).

export const DATA_AGENT_PRESET = {
  id: 'data-agent',
  rows: [
    { id: 'persona', order: 0, config: { text: 'You are a data agent...' } }, // base persona — P7 decision #2
    // ── all-phase tools (catalog stable; guard() hard-denies out-of-phase) ──
    { id: 'tool-retrieval', name: '@deepseek-ai/dsh-<retrieval-tool>', config: {} }, // search_data_sources (ctx.retrieval P5; or P13)
    { id: 'tool-semantic', name: '@deepseek-ai/dsh-<semantic-tool>', config: {} }, // load_table/event_definition, load_table_dimensions, lookup_terminology, save/load_accumulated_definition (P6)
    { id: 'tool-critic', name: '@deepseek-ai/dsh-<critic-tool>', config: {}, _stub: 'P13 deferred' }, // critique_sql_tool, evaluate_sql_quality (P13)
    { id: 'tool-query', name: '@deepseek-ai/dsh-<query-tool>', config: {}, _stub: 'tool-query consumer Not-yet-specified' }, // query_data (ctx.query P4b seam ready; consumer fog)
    { id: 'tool-presentation', name: '@deepseek-ai/dsh-<presentation-tool>', config: {}, _stub: 'delivery fog' }, // present_decomposition/table, compute, suggest_followups
    { id: 'tool-audit', name: '@deepseek-ai/dsh-audit', config: {} }, // ctx.audit (P8)
    { id: 'tool-subagent-qoder', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'qoder' } }, // optional delegation (P3); NOT main LLM
    // ── phase-gate plugin (isolate realm) ──
    { id: 'phase-gate', name: '@deepseek-ai/dsh-phase-gate', isolate: { dataAgentPhase: true }, config: {} },
    // ── compaction (mirrors standard preset's compaction group) ──
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [{ id: 'compaction-basic' }, { id: 'tool-result-pruner' }],
    },
    // NOTE: NO planning group (goal/todo/plan) — see header.
  ],
};
