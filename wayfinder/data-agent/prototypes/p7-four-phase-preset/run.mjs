// P7 four-phase preset + phase-gate — PROTOTYPE driver (code-review-fixed 2026-08-20).
// 12 scenarios pushing the state machine through hard cases. Mirrors p4/p6/p8 run.mjs.
import { Phase, PHASE_ORDER, PipelineConfig, freshPhaseGateState, INCOMPLETE_MARKER } from './types.mjs';
import { PhaseGatePlugin } from './phase-gate.mjs';
import { FakeHarness } from './harness-stub.mjs';

const SID = 'sess-1';
const SHARED_SQL = 'SELECT pay_amt FROM dws_pay_order_di WHERE ds=20260819';

function fresh(pg) {
  pg.sessions.set(SID, freshPhaseGateState());
  return pg.state(SID);
}
function show(pg, label) {
  const s = pg.state(SID);
  console.log(
    `  [${label}] phase=${s.current_phase} idx=${s.phase_idx} attempts=${s.phase_attempts} ` +
      `fallbacks=${s.fallback_count} llm=${s.llm_call_count} exec=${s.exec_count} ` +
      `delivery=${s.delivery_started} decline=${s.honest_decline_reason || '-'} cancelled=${s.cancelled}`,
  );
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function setPhase(pg, phase, extra = {}) {
  const s = pg.state(SID);
  s.current_phase = phase;
  s.phase_idx = PHASE_ORDER.indexOf(phase);
  Object.assign(s, extra);
}

const scenarios = {
  '1 happy path (advance ×4 → COMPLETE; F2 same-source OK)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    let d = await h.runTurn(SID, [[['search_data_sources', {}], ['load_table_definition', {}]]]);
    show(pg, 'after UNDERSTANDING');
    if (!(d.kind === 'advance' && d.to === Phase.GENERATION)) throw `advance→GENERATION, got ${d.kind}`;
    pg.state(SID).phase_output = '```sql\n' + SHARED_SQL + '\n```';
    d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }], ['evaluate_sql_quality', { score: 80 }]]]);
    show(pg, 'after GENERATION');
    if (!(d.kind === 'advance' && d.to === Phase.EXECUTION)) throw `advance→EXECUTION, got ${d.kind}`;
    if (pg.state(SID).last_sql !== SHARED_SQL) throw `last_sql should be extracted (F2), got ${pg.state(SID).last_sql}`;
    d = await h.runTurn(SID, [[['query_data', { sql: SHARED_SQL, outcome: 'done' }]]]);
    show(pg, 'after EXECUTION');
    if (!(d.kind === 'advance' && d.to === Phase.INTERPRETATION)) throw `advance→INTERPRETATION, got ${d.kind}`;
    d = await h.runTurn(SID, [[['present_decomposition', {}], ['present_table', {}], ['compute', {}], ['suggest_followups', {}]]]);
    show(pg, 'after INTERPRETATION');
    if (d.kind !== 'turn_complete') throw `turn_complete, got ${d.kind}`;
    ok('happy path: 4 phases advanced; GENERATION gate (SQL+critique 0.9+quality 80); EXECUTION 3-state done; F2 same-source OK');
  },

  '2 guard deny (out-of-phase tool)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    const r = await h.callTool(SID, 'query_data', { outcome: 'done' });
    show(pg, 'after denied call');
    if (!r.isError) throw `expected guard deny`;
    ok('guard hard-denied out-of-phase query_data in UNDERSTANDING; catalog stayed stable (no advance)');
  },

  '3 EXECUTION failed → fallback GENERATION (3-state, D5)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.EXECUTION);
    const d = await h.runTurn(SID, [[['query_data', { sql: 'SELECT 1', outcome: 'failed', failure_kind: 'syntax' }]]]);
    show(pg, 'after failed query');
    const s = pg.state(SID);
    if (!(s.current_phase === Phase.GENERATION && s.fallback_count === 1)) throw `fallback→GENERATION, got ${s.current_phase}/fb=${s.fallback_count}`;
    ok('EXECUTION query failed → 3-state at turn-stopping drove fallback→GENERATION (deterministic, max_attempts=1, gate never consulted)');
  },

  '4 EXECUTION failed + fallbacks exhausted → honest_decline (H1)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.EXECUTION, { fallback_count: PipelineConfig.max_fallbacks });
    const d = await h.runTurn(SID, [[['query_data', { sql: 'SELECT 1', outcome: 'failed', failure_kind: 'syntax' }]]]);
    show(pg, 'after failed query (exhausted)');
    if (d.kind !== 'honest_decline') throw `honest_decline, got ${d.kind}`;
    ok(`H1: EXECUTION failed + fallbacks exhausted → honest_decline (NOT advance to INTERPRETATION on a failed query): ${d.reason}`);
  },

  '5 exec budget pre-call reject → honest_decline (M1)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.EXECUTION, { exec_count: PipelineConfig.max_executions_per_turn });
    const d = await h.runTurn(SID, [[['query_data', { sql: 'SELECT 1', outcome: 'done' }]]]);
    show(pg, 'after exec-budget reject');
    const s = pg.state(SID);
    if (s.honest_decline_reason == null) throw `honest_decline expected`;
    if (s.exec_count !== PipelineConfig.max_executions_per_turn) throw `exec_count should stay at limit (pre-execute reject), got ${s.exec_count}`;
    ok(`M1: exec budget pre-call reject (limit+1th query denied in guard, exec_count stayed at limit) → honest_decline: ${s.honest_decline_reason}`);
  },

  '6 llm budget pre-call reject → honest_decline (M1+M4)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.UNDERSTANDING, { llm_call_count: PipelineConfig.max_llm_calls_per_turn });
    const d = await h.runTurn(SID, [[['search_data_sources', {}]]]);
    show(pg, 'after llm-budget reject');
    const s = pg.state(SID);
    if (s.honest_decline_reason == null) throw `honest_decline expected`;
    if (s.llm_call_count !== PipelineConfig.max_llm_calls_per_turn) throw `llm_call_count should stay at limit (pre-call reject), got ${s.llm_call_count}`;
    ok(`M1+M4: llm budget pre-call reject (limit+1th llm call denied at llm/stream-start, no tool ran) → honest_decline (NOT cancel): ${s.honest_decline_reason}`);
  },

  '7 GENERATION no-SQL → sql_syntax_gate fail → retry': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.GENERATION, { phase_output: 'I will write SQL soon' });
    const d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }]]]);
    show(pg, 'after gate fail');
    if (d.kind !== 'retry') throw `retry, got ${d.kind}`;
    ok('GENERATION sql_syntax_gate (no SQL candidate in phase final text) → fail → retry (attempts<max)');
  },

  '8 GENERATION critique-low → retry, counted (M2)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.GENERATION, { phase_output: '```sql\nSELECT 1```' });
    const d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.3 }]]]);
    show(pg, 'after critique-low');
    if (d.kind !== 'retry') throw `retry, got ${d.kind}`;
    if (pg.state(SID).last_sql !== 'SELECT 1') throw `last_sql should be extracted (F2), got ${pg.state(SID).last_sql}`;
    if (pg.state(SID).phase_attempts !== 1) throw `critique-retry should count as attempt (M2), got ${pg.state(SID).phase_attempts}`;
    ok('M2: critique confidence 0.3 < floor 0.6 → gate fail at turn-stopping (serialized with sql_syntax) → retry, counted toward max_attempts; last_sql extracted (F2)');
  },

  '9 GENERATION exhausted → honest_decline': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.GENERATION, {
      phase_output: 'no sql',
      fallback_count: PipelineConfig.max_fallbacks,
      phase_attempts: 5,
    });
    const d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }]]]);
    show(pg, 'after honest_decline');
    if (d.kind !== 'honest_decline') throw `honest_decline, got ${d.kind}`;
    ok(`honest_decline: GENERATION gate fail + max_attempts + fallbacks exhausted → ${d.reason}`);
  },

  '10 persona/segment switch (option C)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    for (const ph of PHASE_ORDER) {
      pg.state(SID).current_phase = ph;
      const a = h.assemble(SID, [{ id: 'persona', order: 0, text: '<base persona>' }]);
      const ids = a.sections.map((s) => s.id);
      if (!ids.includes('phase-instruction')) throw `phase-instruction missing in ${ph}`;
      const hasSql = ids.includes('sql-conventions');
      if (hasSql !== (ph === Phase.GENERATION)) throw `sql-conventions should be GENERATION-only (got ${hasSql} for ${ph})`;
    }
    show(pg, 'after 4 phases assemble');
    ok('persona option C: _PHASE_INSTRUCTIONS per current_phase; SQL conventions GENERATION-only; no complete:true');
  },

  '11 INTERPRETATION 【未完成】 → honest_decline (M3)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.INTERPRETATION, { phase_output: `${INCOMPLETE_MARKER} missing: pay_amt definition not found` });
    const d = await h.runTurn(SID, [[['present_table', {}]]]);
    show(pg, 'after INCOMPLETE');
    if (d.kind !== 'honest_decline') throw `honest_decline, got ${d.kind}`;
    ok(`M3: INTERPRETATION ${INCOMPLETE_MARKER} declaration → honest_decline (SPEC §2.6: terminal, distinguishes "can't answer" from success): ${d.reason}`);
  },

  '12 forced_load in-phase (F1)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    const r = await h.callTool(SID, 'search_data_sources', {});
    show(pg, 'after forced_load');
    if (r.isError) throw `in-phase forced_load should pass guard: ${r.error?.message}`;
    ok('FINDING F1: in-phase forced_load passes guard (whitelisted). Real-harness Q: ctx.tools.execute programmatic path + guard routing? (surface for P7b)');
  },
};

async function runAll() {
  console.log('# P7 four-phase preset + phase-gate — PROTOTYPE scenarios (code-review-fixed)\n');
  let failures = 0;
  for (const [name, fn] of Object.entries(scenarios)) {
    console.log(`\n=== S${name} ===`);
    try {
      await fn();
    } catch (e) {
      failures += 1;
      console.log(`  ✗ FAIL: ${e}`);
    }
  }
  console.log('\n# Code-review fixes applied (subagent aa22fc29bb91390ec):');
  console.log('  H1  EXECUTION failed+fallback-exhausted → honest_decline (was: advanced to INTERPRETATION on failed query)');
  console.log('  M1  budget pre-call rejection (llm on llm/stream-start, exec in guard) + boundary fixed (==limit completes) (was: post-hoc cancel at turn-stopping)');
  console.log('  M2  critique/evaluator moved to turn-stopping serialized with sql_syntax_gate (was: post-execute block, escaped max_attempts)');
  console.log('  M3  INTERPRETATION 【未完成】 → honest_decline (was: missing; SPEC §2.6 channel)');
  console.log('  M4  budget exhaustion → honest_decline not cancel (rbi TurnBudgetExceeded→_emit_honest_decline; audit distinguishability)');
  console.log('  L3/F2 extract_sql_candidate shared (GENERATION gate + EXECUTION query_data same-source)');
  console.log('\n# Findings deferred to P7b (real-gate alignment, not prototype logic):');
  console.log('  L1  F3 stall-watchdog cite → turn_context.py _awaiting_input (one-hand) + rbi-purpose-arch §5.10 (threshold)');
  console.log('  L2  sqlSyntaxGate stricter than rbi _looks_like_sql_attempt (tolerates "can\'t gen SQL" prose) — align at P7b real-sqlglot-gate time');
  console.log('  L4  onTurnStart ≠ question-start seam — P7b add question-start hook to reset per-question counters');
  console.log(failures === 0 ? '\n✓ all 12 scenarios passed' : `\n✗ ${failures} scenario(s) failed`);
  return failures;
}

const arg = process.argv[2];
if (arg === '--demo') {
  const f = await runAll();
  process.exit(f === 0 ? 0 : 1);
}
console.log('P7 four-phase preset + phase-gate prototype. Scenarios:');
Object.keys(scenarios).forEach((n, i) => console.log(`  ${i + 1} ${n}`));
console.log('  a  all      q  quit');
const { createInterface } = await import('node:readline');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));
while (true) {
  const c = (await ask('> ')).trim();
  if (c === 'q' || c === '') break;
  if (c === 'a') {
    await runAll();
    continue;
  }
  const keys = Object.keys(scenarios);
  const idx = parseInt(c, 10) - 1;
  if (idx >= 0 && idx < keys.length) {
    console.log(`\n=== S${keys[idx]} ===`);
    try {
      await scenarios[keys[idx]]();
    } catch (e) {
      console.log(`  ✗ FAIL: ${e}`);
    }
  } else {
    console.log('  ? unknown');
  }
}
rl.close();
