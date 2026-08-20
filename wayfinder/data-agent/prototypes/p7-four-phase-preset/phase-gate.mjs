// P7 phase-gate plugin — the additive hook plugin (code-review-fixed 2026-08-20).
// Mirrors reverse-bi DataAgentPipeline (pipeline.py) phase-gated orchestration, RE-EXPRESSED
// on harness event seams (NOT custom agent-loop, NOT collapsing phases — map ③③).
// 6 hooks per harness-agent-loop.md §4.2B + research/p7-four-phase-fit-to-da.md §4:
//   1. ctx.tools.guard()            — hard per-phase whitelist (monotone) + pre-execute exec-budget reject
//   2. agent/turn-stopping (serial) — phase advance / gate / fallback / honest_decline
//   3. tools/post-execute           — count + store (gate decisions live at turn-stopping, not here)
//   4. agent/request (waterfall)    — per-phase model / reasoning effort
//   5. system-prompt/assemble       — _PHASE_INSTRUCTIONS per current_phase (persona option C)
//   6. turn/start                   — per-turn ephemeral reset (NOT question-scoped counters — F4)
//
// Code-review fixes (subagent aa22fc29bb91390ec):
//  H1  EXECUTION failed+fallback-exhausted → honest_decline (was: always_pass→advance to INTERPRETATION
//      on a failed query; last_query_outcome never read). EXECUTION is now deterministic 3-state at
//      turn-stopping (D5 intent: ctx.query QueryOutcome drives advance/fallback/wait).
//  M1  budget pre-call rejection (was: post-hoc cancel at turn-stopping). rbi rejects the (limit+1)th
//      llm call / query pre-call (core/loop.py TurnBudget.exhausted=used>=limit; pipeline.py:1524 exec
//      pre-execute reject). llm budget checked on llm/stream-start; exec budget in guard (query_data only).
//      Boundary fixed: a turn that runs exactly `limit` calls + stops COMPLETES (was cancelled at ==limit).
//  M2  critique/evaluator moved to turn-stopping, serialized with sql_syntax_gate (was: post-execute
//      block → critique-retry escaped max_attempts, only the 60-llm backstop). rbi evaluator runs after
//      gate, WITHIN the attempt loop (pipeline.py:1334-1431) → RETRY counts as attempt.
//  M3  INTERPRETATION 【未完成】 declaration → honest_decline (was: missing; SPEC §2.6 channel that
//      distinguishes "can't answer" from a successful analysis in the audit store).
//  M4  budget exhaustion → honest_decline (was: cancel; rbi TurnBudgetExceeded→_emit_honest_decline,
//      success=false+decline_reason — cancel lost audit distinguishability). cancel reserved for
//      external (user-stop) cancel.
//  L3/F2 extract_sql_candidate shared between GENERATION gate + EXECUTION query_data (demonstrates
//      "critiqued SQL == executed SQL" same-source principle; was: lastSql unused dead field).
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
    this.sessions = new Map();
  }

  state(sid) {
    let s = this.sessions.get(sid);
    if (!s) {
      s = freshPhaseGateState();
      this.sessions.set(sid, s);
    }
    return s;
  }

  // ── hook 1: ctx.tools.guard() via agent.ctx — hard whitelist + pre-execute exec-budget ──
  guard = (execution) => {
    const s = this.state(execution.sessionId);
    if (s.honest_decline_reason || s.cancelled) return 'turn ended';
    const allowed = PHASE_TOOLS[s.current_phase];
    if (!allowed.includes(execution.name)) {
      return `phase-gate: "${execution.name}" not in ${s.current_phase} whitelist [${allowed.join('|')}]`;
    }
    // M1: exec budget pre-execute rejection (query_data only; rbi _ExecutionBudget checked in _run_execution_phase)
    if (execution.name === 'query_data' && s.exec_count >= PipelineConfig.max_executions_per_turn) {
      this.honestDecline(s, `budget: exec_count ${s.exec_count} ≥ ${PipelineConfig.max_executions_per_turn} (pre-execute reject)`);
      return `budget: exec_count ≥ max_executions_per_turn (pre-execute)`;
    }
    return undefined;
  };

  // ── hook 2: agent/turn-stopping (serial) — advance / gate / fallback / honest_decline ──
  onTurnStopping = ({ sessionId }) => {
    const s = this.state(sessionId);
    if (s.honest_decline_reason || s.cancelled) return { kind: 'ended' };

    // D6 budget: max_state_turns — per-user-question turn counter (mirrors max_llm_calls_per_turn:
    // check pre-decision, increment after). rbi DEFAULT_MAX_STEPS=20; da has no native turn budget,
    // so the phase-gate plugin enforces via honest_decline at turn-stopping (M4: budget→decline not cancel).
    // Was: PipelineConfig.max_state_turns declared but never enforced (not in P7b-deferred list).
    if (s.turn_count >= PipelineConfig.max_state_turns) {
      return this.honestDecline(
        s,
        `budget: turn_count ${s.turn_count} ≥ ${PipelineConfig.max_state_turns} max_state_turns (D6)`,
      );
    }
    s.turn_count += 1;

    // EXECUTION is deterministic (not ReAct) — 3-state drives advance/fallback/wait directly (D5, H1).
    // always_pass gate is never consulted for EXECUTION (phases.py: factory.py comment).
    if (s.current_phase === Phase.EXECUTION) return this.executionDecision(s);

    const cfg = PHASE_CONFIGS[s.current_phase];
    const gate = this.runGate(s);
    if (gate.passed) return this.advance(s);

    // M3: INTERPRETATION 【未完成】 declaration is terminal (SPEC §2.6) — honest_decline, not retry.
    // (distinguishes "can't answer this turn" from a successful analysis in the audit store)
    if (s.current_phase === Phase.INTERPRETATION) {
      return this.honestDecline(s, `INTERPRETATION ${gate.reason}`);
    }

    s.phase_attempts += 1;
    if (s.phase_attempts >= cfg.max_attempts) {
      if (cfg.fallback_phase && s.fallback_count < PipelineConfig.max_fallbacks) {
        return this.fallback(s, cfg.fallback_phase);
      }
      return this.honestDecline(
        s,
        `phase ${s.current_phase} gate failed (${gate.reason}); max_attempts=${cfg.max_attempts} exhausted` +
          (cfg.fallback_phase ? ` + fallbacks exhausted (≥${PipelineConfig.max_fallbacks})` : ' (no fallback phase)'),
      );
    }
    s.phase_output = '';
    s.last_critique = null;
    s.last_quality = null;
    return { kind: 'retry', reason: gate.reason };
  };

  // EXECUTION 3-state decision (D5: ctx.query.execute QueryOutcome drives; H1: failed+exhausted→decline)
  executionDecision(s) {
    const cfg = PHASE_CONFIGS[Phase.EXECUTION];
    if (s.last_query_outcome === 'done') return this.advance(s);
    if (s.last_query_outcome === 'running') {
      // real harness: poll check_query (≤3×); stub has no async wait — non-terminal, no attempt burn
      return { kind: 'wait', reason: 'query still running; poll check_query' };
    }
    // failed (or null — query not yet run): fallback to GENERATION (re-gen SQL, carry error) or honest_decline
    if (cfg.fallback_phase && s.fallback_count < PipelineConfig.max_fallbacks) {
      return this.fallback(s, cfg.fallback_phase);
    }
    return this.honestDecline(s, `EXECUTION query failed (${s.last_query_outcome || 'not run'}); fallbacks exhausted`);
  }

  runGate(s) {
    const cfg = PHASE_CONFIGS[s.current_phase];
    switch (cfg.gate) {
      case 'always_pass':
        // M3: INTERPRETATION 【未完成】 declaration → fail → honest_decline (no fallback; SPEC §2.6)
        if (s.current_phase === Phase.INTERPRETATION) return interpretGate(s.phase_output);
        return GateResult.pass(); // UNDERSTANDING
      case 'sql_syntax_gate':
        return generationGate(s); // M2: syntax + critique + quality unified at turn-stopping (all counted)
      default:
        // Code-review fix: assertNever on the closed union {always_pass, sql_syntax_gate}.
        // Was: silent `return GateResult.pass()` → a future PHASE_CONFIGS gate-typo (e.g.
        // 'sql_snytax_gate') would pass silently instead of failing loud.
        throw new Error(
          `unknown gate: ${cfg.gate} (phase ${s.current_phase}); expected one of: always_pass | sql_syntax_gate`,
        );
    }
  }

  // ── hook 3: tools/post-execute — count + store (decisions live at turn-stopping, not here) ──
  // M2: critique/evaluator results STORED here, checked at turn-stopping (generationGate) so
  // critique-retry counts toward max_attempts (was: post-execute block, unbounded).
  // F2: query_data same-source check (sql arg == last_sql extracted at GENERATION gate).
  onPostExecute = ({ sessionId, name, result, args }) => {
    const s = this.state(sessionId);
    if (name === 'query_data') {
      s.exec_count += 1; // count on post-execute (one per query)
      s.last_query_outcome = result.outcome; // ctx.query 3-state QueryOutcome
      // F2: same-source — executed SQL must equal critiqued SQL (extract_sql_candidate principle)
      if (s.last_sql && args && args.sql && args.sql !== s.last_sql) {
        return { kind: 'block', reason: 'F2 same-source violation: query_data sql ≠ critiqued last_sql' };
      }
    }
    if (name === 'critique_sql_tool') s.last_critique = result.confidence; // checked at turn-stopping
    if (name === 'evaluate_sql_quality') s.last_quality = result.score; // checked at turn-stopping
    if (name === 'present_table' || name === 'present_decomposition') s.delivery_started = true;
    return { kind: 'accept' };
  };

  // ── hook 4: agent/request (waterfall) — per-phase model / reasoning effort ──
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

  // ── hook 5: system-prompt/assemble — _PHASE_INSTRUCTIONS per current_phase (option C) ──
  onAssemble = ({ sessionId, sections }) => {
    const s = this.state(sessionId);
    const out = [...sections];
    out.push({ id: 'phase-instruction', order: 50, text: PHASE_INSTRUCTIONS[s.current_phase] });
    if (s.current_phase === Phase.GENERATION) {
      out.push({ id: 'sql-conventions', order: 51, text: SQL_CONVENTIONS });
    }
    return { sections: out };
  };

  // ── hook 6: turn/start — per-turn ephemerals (NOT question-scoped counters — F4) ──
  // delivery_started is per-turn in rbi (attach_delivery_declaration "本轮第一次", pipeline.py:608-611).
  // llm/exec/fallback counters span the whole user-question (rbi per_turn = per user-question = per kick);
  // those reset on a question-start seam (F4 — P7b: detect first turn / current_phase→UNDERSTANDING).
  onTurnStart = ({ sessionId }) => {
    const s = this.state(sessionId);
    s.delivery_started = false;
  };

  // llm/stream — M1+M4: pre-call budget rejection (rbi rejects (limit+1)th pre-call; was post-hoc cancel).
  // Returns undefined=allow, or an honest_decline decision if the limit is already reached.
  onLlmStream = ({ sessionId }) => {
    const s = this.state(sessionId);
    if (s.llm_call_count >= PipelineConfig.max_llm_calls_per_turn) {
      return this.honestDecline(
        s,
        `budget: llm_call_count ${s.llm_call_count} ≥ ${PipelineConfig.max_llm_calls_per_turn} (pre-call reject)`,
      );
    }
    s.llm_call_count += 1;
    return undefined;
  };

  // ── helpers ──
  advance(s) {
    s.phase_idx += 1;
    s.phase_attempts = 0;
    s.phase_output = '';
    s.last_critique = null;
    s.last_quality = null;
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
    s.last_critique = null;
    s.last_quality = null;
    return { kind: 'fallback', to, count: s.fallback_count };
  }
  honestDecline(s, reason) {
    s.honest_decline_reason = reason;
    s.current_phase = 'DECLINED';
    return { kind: 'honest_decline', reason };
  }
  cancel(s, reason) {
    s.cancelled = true;
    s.cancelled_reason = reason; // reserved for EXTERNAL cancel (user-stop); NOT budget (M4)
    return { kind: 'cancel', reason };
  }
}

// GENERATION gate (M2: syntax + critique + quality unified at turn-stopping; F2: extract + store last_sql).
// P7 STUB: naive fence/SELECT extract (real = gates.py extract_sql_candidate + sqlglot AST + JSON-path +
// registry, deferred to P13). L2 (P7b): align with gates.py `_looks_like_sql_attempt` tolerant semantics
// (rbi lets "can't generate SQL" prose pass; this stub reverses to fail — fix at P7b real-gate time).
function generationGate(s) {
  if (!s.phase_output) return GateResult.fail('no phase output');
  const sql = extractSqlCandidate(s.phase_output);
  if (!sql) return GateResult.fail('no SQL candidate in GENERATION output');
  s.last_sql = sql; // F2: same-source for EXECUTION query_data
  if (s.last_critique == null) return GateResult.fail('critique not run (critique_sql_tool missing)');
  if (s.last_critique < PipelineConfig.critique_confidence_floor) {
    return GateResult.fail(`critique confidence ${s.last_critique} < ${PipelineConfig.critique_confidence_floor}`);
  }
  // Code-review fix: quality is REQUIRED (symmetric with critique) — the GENERATION phase
  // instruction says the gate checks ALL THREE (SQL + critique_confidence + quality_score).
  // Was: `last_quality != null && ...` → critique=0.9 + quality never run still ADVANCED,
  // violating the gate's own contract. Now fail loud when evaluate_sql_quality never ran.
  if (s.last_quality == null) return GateResult.fail('quality not run / not evaluated (evaluate_sql_quality missing)');
  if (s.last_quality < PipelineConfig.quality_score_floor) {
    return GateResult.fail(`quality score ${s.last_quality} < ${PipelineConfig.quality_score_floor}`);
  }
  return GateResult.pass();
}

// INTERPRETATION gate (M3: 【未完成】 declaration → fail → honest_decline, SPEC §2.6).
// Allows INTERPRETATION to decline (no HALT/clarification in delivery) via a machine-judgable marker.
function interpretGate(phaseOutput) {
  if (phaseOutput && phaseOutput.includes(INCOMPLETE_MARKER)) {
    return GateResult.fail(`INCOMPLETE declaration (${INCOMPLETE_MARKER}): model cannot answer this turn`);
  }
  return GateResult.pass();
}

// extract SQL candidate (F2 same-source; P7 STUB — real = gates.py extract_sql_candidate).
function extractSqlCandidate(phaseOutput) {
  const fenced = phaseOutput.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const bare = phaseOutput.match(/\bSELECT\b.+/i);
  return bare ? bare[0].trim() : null;
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
    `(sqlglot AST + JSON-path + registry) + evaluate_sql_quality. The turn-stopping gate checks ALL THREE: ` +
    `SQL candidate present (extract_sql_candidate), critique_confidence ≥ ${PipelineConfig.critique_confidence_floor}, ` +
    `quality_score ≥ ${PipelineConfig.quality_score_floor}. Fingerprint gate rejects SQL not re-critiqued after edit. ` +
    `Wrap SQL in \`\`\`sql fences. Fallback → UNDERSTANDING.`,
  [Phase.EXECUTION]:
    `EXECUTION (deterministic, not ReAct): query_data(sql) runs the Guard Chain (SELECT-only → partition ds='yyyyMMdd' → ` +
    `cost → scan-limit → true-timeout). The SQL passed MUST equal the critiqued SQL (same-source). Three outcomes drive the ` +
    `turn-stopping decision: done → advance; running → wait + poll check_query (≤3×); failed → fallback→GENERATION (carry ` +
    `error text) or honest_decline if fallbacks exhausted. Never re-send the original SQL.`,
  [Phase.INTERPRETATION]:
    `INTERPRETATION: deliver via tools only, strict order: present_decomposition (forced first, no exemption) → ` +
    `present_table (pass result_id + intent) → compute → 【发现】(once) → 【注意】(once, list inference assumptions) → ` +
    `suggest_followups. Output purity: no **, no process narration, no SQL display, thousands separator. If you CANNOT answer, ` +
    `emit ${INCOMPLETE_MARKER} declaration (NOT clarification — no HALT in delivery); the turn-stopping gate reads it → ` +
    `honest_decline. No fallback phase.`,
};
const SQL_CONVENTIONS =
  `SQL conventions (MaxCompute/hive dialect; rbi_query.conventions.render_conventions_markdown): ` +
  `partition predicate ds='yyyyMMdd' required; SELECT-only; etc.`;
