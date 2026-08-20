// P7 phase-gate plugin — the additive hook plugin.
// Mirrors reverse-bi DataAgentPipeline (pipeline.py) phase-gated orchestration, RE-EXPRESSED
// on harness event seams (NOT custom agent-loop, NOT collapsing phases — map ③③).
// 6 hooks per harness-agent-loop.md §4.2B + research/p7-four-phase-fit-to-da.md §4:
//   1. ctx.tools.guard()            — hard per-phase tool whitelist (monotone, un-flippable; cache-stable catalog)
//   2. agent/turn-stopping (serial) — phase advance / gate / fallback / budget / honest_decline
//   3. tools/post-execute           — gate-on-tool-result (fallback feedback, delivery attach, exec count)
//   4. agent/request (waterfall)    — per-phase model / reasoning effort
//   5. system-prompt/assemble       — _PHASE_INSTRUCTIONS per current_phase (persona option C)
//   6. turn/start                   — per-turn ephemeral reset (NOT question-scoped counters — see F4)
import {
  Phase,
  PHASE_ORDER,
  PHASE_CONFIGS,
  PHASE_TOOLS,
  PipelineConfig,
  GateResult,
  INCOMPLETE_MARKER,
  DECOMPOSITION_MARKER,
  freshPhaseGateState,
} from './types.mjs';

export class PhaseGatePlugin {
  constructor() {
    this.sessions = new Map(); // sessionId → state (per-session keyed inside the plugin — §5.3)
  }

  state(sid) {
    let s = this.sessions.get(sid);
    if (!s) {
      s = freshPhaseGateState();
      this.sessions.set(sid, s);
    }
    return s;
  }

  // ── hook 1: ctx.tools.guard() via agent.ctx — hard whitelist ─────────────
  // Monotone: returns a reason → FINAL deny, downstream waterfall listeners CANNOT flip it to
  // allow. Keeps the visible tool catalog STABLE across phases (cache-friendly) while hard-denying
  // out-of-phase calls — plan-mode's "stable catalog + rule constraint" idea, but harder.
  guard = (execution) => {
    const s = this.state(execution.sessionId);
    if (s.cancelled) return 'turn cancelled';
    const allowed = PHASE_TOOLS[s.current_phase];
    if (!allowed.includes(execution.name)) {
      return `phase-gate: "${execution.name}" not in ${s.current_phase} whitelist [${allowed.join('|')}]`;
    }
    return undefined; // undefined = keep prior decision (allow)
  };

  // ── hook 2: agent/turn-stopping (serial, no next()) — phase advance/gate/fallback/budget ──
  // Fires when the model naturally stops (no tool calls) + next-step empty. Faithful re-expression
  // of rbi's internal "AgentLoop.run ends → gate → advance/retry" (research §3a: model-driven
  // exit_<phase> would be a SEMANTIC SHIFT — rbi's sql_syntax_gate means the model does NOT know
  // the gate result, so a model-driven exit would let it advance past a failed gate).
  onTurnStopping = ({ sessionId }) => {
    const s = this.state(sessionId);
    if (s.cancelled) return { kind: 'cancelled' };

    // budget enforcement — harness has NO native step/turn budget (§3.2#4), so the plugin enforces.
    if (s.llm_call_count >= PipelineConfig.max_llm_calls_per_turn) {
      return this.cancel(s, `budget: llm_call_count ${s.llm_call_count} ≥ ${PipelineConfig.max_llm_calls_per_turn}`);
    }
    if (s.exec_count >= PipelineConfig.max_executions_per_turn) {
      return this.cancel(s, `budget: exec_count ${s.exec_count} ≥ ${PipelineConfig.max_executions_per_turn}`);
    }

    const cfg = PHASE_CONFIGS[s.current_phase];
    const gate = this.runGate(s);
    if (gate.passed) return this.advance(s); // → next phase (or turn complete)

    // gate failed
    s.phase_attempts += 1;
    if (s.phase_attempts >= cfg.max_attempts) {
      if (cfg.fallback_phase && s.fallback_count < PipelineConfig.max_fallbacks) {
        return this.fallback(s, cfg.fallback_phase); // → fallback phase
      }
      return this.honestDecline(
        s,
        `phase ${s.current_phase} gate failed (${gate.reason}); max_attempts=${cfg.max_attempts} exhausted` +
          (cfg.fallback_phase ? ` + fallbacks exhausted (≥${PipelineConfig.max_fallbacks})` : ' (no fallback phase)'),
      );
    }
    // within attempts → retry same phase next turn (feedback injected via post-execute / next-turn context)
    s.phase_output = '';
    return { kind: 'retry', reason: gate.reason };
  };

  runGate(s) {
    const cfg = PHASE_CONFIGS[s.current_phase];
    switch (cfg.gate) {
      case 'always_pass':
        return GateResult.pass(); // UNDERSTANDING / INTERPRETATION; EXECUTION never consulted
      case 'sql_syntax_gate':
        return sqlSyntaxGate(s.phase_output, s.last_sql); // GENERATION: checks phase FINAL text
      default:
        return GateResult.pass();
    }
  }

  // ── hook 3: tools/post-execute — fallback feedback / delivery attach / exec count ──
  // accept | block(→ feedback) | replace | attach context. GENERATION critique fail → block;
  // INTERPRETATION present_* → attach delivery; EXECUTION query_data → count + 3-state drove fallback.
  onPostExecute = ({ sessionId, name, result }) => {
    const s = this.state(sessionId);
    if (name === 'query_data') {
      s.exec_count += 1; // count executions on post-execute (NOT on agent/request)
      s.last_query_outcome = result.outcome; // ctx.query 3-state QueryOutcome
      if (result.outcome === 'failed') {
        // EXECUTION always_pass never consulted — a failed query drives fallback to GENERATION (re-gen SQL)
        const cfg = PHASE_CONFIGS[Phase.EXECUTION];
        if (cfg.fallback_phase && s.fallback_count < PipelineConfig.max_fallbacks) {
          this.fallback(s, cfg.fallback_phase);
          return { kind: 'block', reason: `query failed (${result.failure_kind}); fallback → ${cfg.fallback_phase}` };
        }
        return { kind: 'block', reason: `query failed (${result.failure_kind}); fallbacks exhausted → honest_decline at turn-stopping` };
      }
    }
    if (name === 'critique_sql_tool' && result.confidence < PipelineConfig.critique_confidence_floor) {
      return { kind: 'block', reason: `critique confidence ${result.confidence} < ${PipelineConfig.critique_confidence_floor}` };
    }
    if (name === 'present_table' || name === 'present_decomposition') s.delivery_started = true;
    return { kind: 'accept' };
  };

  // ── hook 4: agent/request (waterfall) — per-phase model / reasoning effort ──
  // model route NOT in preset (installAgentLlmTarget seam). Main LLM = dashscope (P2) for all
  // phases; per-phase reasoning effort via agent/request. Qoder (P3) is an OPTIONAL delegation
  // tool, NOT the main loop (map out-of-scope: "Qoder as main LLM — no path").
  onRequest = ({ sessionId, proposedConfig }) => {
    const s = this.state(sessionId);
    const effort = {
      [Phase.UNDERSTANDING]: 'high',
      [Phase.GENERATION]: 'high',
      [Phase.EXECUTION]: 'medium',
      [Phase.INTERPRETATION]: 'medium',
    }[s.current_phase];
    return { ...proposedConfig, reasoningEffort: effort, _phase: s.current_phase };
  };

  // ── hook 5: system-prompt/assemble — _PHASE_INSTRUCTIONS per current_phase ──
  // persona option C (P7 decision #2): base persona = preset static section (order 0, passed in
  // `sections` by the harness); _PHASE_INSTRUCTIONS injected here as a dynamic section by
  // current_phase. AVOIDS complete:true (would suppress tool guidance / compaction). SQL
  // conventions injected GENERATION-only.
  onAssemble = ({ sessionId, sections }) => {
    const s = this.state(sessionId);
    const out = [...sections];
    out.push({ id: 'phase-instruction', order: 50, text: PHASE_INSTRUCTIONS[s.current_phase] });
    if (s.current_phase === Phase.GENERATION) {
      out.push({ id: 'sql-conventions', order: 51, text: SQL_CONVENTIONS });
    }
    return { sections: out };
  };

  // ── hook 6: turn/start — per-turn ephemeral reset ────────────────────────
  // NOTE (F4 finding): does NOT reset question-scoped counters (llm_call_count / exec_count /
  // fallback_count) — those span the WHOLE user-question (rbi "per_turn" = per user-question =
  // per harness kick, which is multiple turns). Resetting them at turn/start would break the
  // budget. Real harness needs a question-start seam (or detect first turn / current_phase
  // reset to UNDERSTANDING) to reset question-scoped counters. This stub resets only per-turn
  // ephemerals.
  onTurnStart = ({ sessionId }) => {
    const s = this.state(sessionId);
    s.delivery_started = false;
    s.honest_decline_reason = null;
    s.cancelled = false;
  };

  // llm/stream counter (P7 finding #5: charge on llm/stream START, NOT agent/request —
  // agent/request waterfall retries may not produce a real LLM call).
  onLlmStream = ({ sessionId }) => {
    this.state(sessionId).llm_call_count += 1;
  };

  // ── helpers ──
  advance(s) {
    s.phase_idx += 1;
    s.phase_attempts = 0;
    s.phase_output = '';
    if (s.phase_idx >= PHASE_ORDER.length) {
      s.current_phase = 'COMPLETE';
      return { kind: 'turn_complete' };
    }
    s.current_phase = PHASE_ORDER[s.phase_idx];
    return { kind: 'advance', to: s.current_phase };
  }
  fallback(s, to) {
    s.fallback_count += 1;
    s.phase_idx = PHASE_ORDER.indexOf(to);
    s.current_phase = to;
    s.phase_attempts = 0;
    s.phase_output = '';
    return { kind: 'fallback', to, count: s.fallback_count };
  }
  honestDecline(s, reason) {
    s.honest_decline_reason = reason;
    s.current_phase = 'DECLINED';
    return { kind: 'honest_decline', reason };
  }
  cancel(s, reason) {
    s.cancelled = true;
    s.cancelled_reason = reason;
    return { kind: 'cancel', reason };
  }
}

// GENERATION gate (phases.py sql_syntax_gate + gates.py): checks the phase's FINAL TEXT contains
// a SQL candidate. P7 STUB: naive fence/SELECT parse (real critic = sqlglot AST + JSON-path +
// registry, deferred to P13). "The critiqued SQL == the executed SQL" (F2 finding: same-source
// across the GENERATION gate and the EXECUTION guard chain — extract_sql_candidate principle).
function sqlSyntaxGate(phaseOutput, lastSql) {
  if (!phaseOutput) return GateResult.fail('no phase output');
  const fenced = phaseOutput.match(/```sql\s*([\s\S]*?)```/i);
  const bare = !fenced && phaseOutput.match(/\bSELECT\b.+/i);
  if (!fenced && !bare) return GateResult.fail('no SQL candidate in GENERATION output');
  return GateResult.pass();
}

const PHASE_INSTRUCTIONS = {
  [Phase.UNDERSTANDING]:
    `UNDERSTANDING: retrieve candidates (search_data_sources), load full definitions (load_table_definition/` +
    `load_event_definition/load_table_dimensions when dimension_hint), decompose compound → atomic sub-questions ` +
    `(≤${PipelineConfig.max_subquestions}) prefixed by ${DECOMPOSITION_MARKER}, run the six-class disambiguation scan. ` +
    `High → GENERATION; mid → present_clarification (HALT, await user; ${PipelineConfig.disambiguation_timeout_seconds}s → honest_decline); ` +
    `low → honest reject / discovery path.`,
  [Phase.GENERATION]:
    `GENERATION: generate SQL from semantic-layer-grounded fields (never hardcode schema); critique_sql_tool ` +
    `(sqlglot AST + JSON-path + registry) + evaluate_sql_quality. critique_confidence_floor=${PipelineConfig.critique_confidence_floor}; ` +
    `quality_score_floor=${PipelineConfig.quality_score_floor}. Fingerprint gate rejects SQL not re-critiqued after edit. ` +
    `Wrap SQL in \`\`\`sql fences for the sql_syntax_gate. Fallback → UNDERSTANDING.`,
  [Phase.EXECUTION]:
    `EXECUTION (deterministic, not ReAct): query_data(sql) runs the Guard Chain (SELECT-only → partition ds='yyyyMMdd' → ` +
    `cost → scan-limit → true-timeout). Three states: done (result_id + tiered preview) | running (check_query ≤3×) | ` +
    `failed (failure_kind; only transient worth retry). Never re-send the original SQL. Fallback → GENERATION (carry error text).`,
  [Phase.INTERPRETATION]:
    `INTERPRETATION: deliver via tools only, strict order: present_decomposition (forced first, no exemption) → ` +
    `present_table (pass result_id + intent) → compute → 【发现】(once) → 【注意】(once, list inference assumptions) → ` +
    `suggest_followups. Output purity: no **, no process narration, no SQL display, thousands separator. If you can't ` +
    `answer, emit ${INCOMPLETE_MARKER} declaration (NOT clarification — no HALT in delivery). No fallback phase.`,
};
const SQL_CONVENTIONS =
  `SQL conventions (MaxCompute/hive dialect; rbi_query.conventions.render_conventions_markdown): ` +
  `partition predicate ds='yyyyMMdd' required; SELECT-only; etc.`;
