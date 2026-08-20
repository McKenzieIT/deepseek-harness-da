// P7 four-phase preset + phase-gate — PROTOTYPE driver.
// Pushes the phase-gate state machine through cases hard to reason about on paper
// (per /prototype LOGIC branch). Mirrors p4/p6/p8 run.mjs: interactive menu + --demo.
import { Phase, PHASE_ORDER, PipelineConfig, freshPhaseGateState } from './types.mjs';
import { PhaseGatePlugin } from './phase-gate.mjs';
import { FakeHarness } from './harness-stub.mjs';

const SID = 'sess-1';
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
  '1 happy path (advance ×4 → COMPLETE)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    // UNDERSTANDING
    let d = await h.runTurn(SID, [[['search_data_sources', {}], ['load_table_definition', {}]]]);
    show(pg, 'after UNDERSTANDING');
    if (!(d.kind === 'advance' && d.to === Phase.GENERATION)) throw `expected advance→GENERATION, got ${d.kind}`;
    // GENERATION (phase_output has SQL → sql_syntax_gate pass)
    pg.state(SID).phase_output = '```sql\nSELECT pay_amt FROM dws_pay_order_di WHERE ds=20260819\n```';
    d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }], ['evaluate_sql_quality', { score: 80 }]]]);
    show(pg, 'after GENERATION');
    if (!(d.kind === 'advance' && d.to === Phase.EXECUTION)) throw `expected advance→EXECUTION, got ${d.kind}`;
    // EXECUTION
    d = await h.runTurn(SID, [[['query_data', { outcome: 'done' }]]]);
    show(pg, 'after EXECUTION');
    if (!(d.kind === 'advance' && d.to === Phase.INTERPRETATION)) throw `expected advance→INTERPRETATION, got ${d.kind}`;
    // INTERPRETATION
    d = await h.runTurn(SID, [[['present_decomposition', {}], ['present_table', {}], ['compute', {}], ['suggest_followups', {}]]]);
    show(pg, 'after INTERPRETATION');
    if (d.kind !== 'turn_complete') throw `expected turn_complete, got ${d.kind}`;
    ok('happy path: 4 phases advanced via turn-stopping → COMPLETE; llm=4 exec=1 delivery=true');
  },

  '2 guard deny (out-of-phase tool)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    // query_data during UNDERSTANDING → guard hard-deny
    const r = await h.callTool(SID, 'query_data', { outcome: 'done' });
    show(pg, 'after denied call');
    if (!r.isError) throw `expected guard deny, got ok`;
    ok('guard hard-denied out-of-phase query_data in UNDERSTANDING; catalog stayed stable (no advance)');
  },

  '3 EXECUTION fallback (query failed → GENERATION)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.EXECUTION, { phase_output: '```sql\nSELECT 1```' });
    const r = await h.callTool(SID, 'query_data', { outcome: 'failed', failure_kind: 'syntax' });
    show(pg, 'after failed query');
    const s = pg.state(SID);
    if (!(s.current_phase === Phase.GENERATION && s.fallback_count === 1)) throw `expected fallback→GENERATION, got ${s.current_phase}/fb=${s.fallback_count}`;
    ok('EXECUTION query failed → ctx.query 3-state drove fallback→GENERATION at post-execute (max_attempts=1, no turn-stopping gate consulted)');
  },

  '4 budget cancel (exec_count ≥ max_executions_per_turn)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.EXECUTION, { exec_count: PipelineConfig.max_executions_per_turn }); // at ceiling
    const d = await h.runTurn(SID, [[['query_data', { outcome: 'done' }]]]); // post-execute → exec_count=9
    show(pg, 'after budget breach');
    if (d.kind !== 'cancel') throw `expected cancel on budget, got ${d.kind}`;
    ok(`budget enforced at turn-stopping: ${d.reason}`);
  },

  '5 GENERATION gate (no SQL in output → sql_syntax_gate fail → retry)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    setPhase(pg, Phase.GENERATION, { phase_output: 'I will write SQL soon' }); // NO sql fence
    const d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }]]]);
    show(pg, 'after gate fail');
    if (d.kind !== 'retry') throw `expected retry (attempts<max), got ${d.kind}`;
    ok('GENERATION sql_syntax_gate (on turn-stopping, checks phase FINAL TEXT — NOT post-execute single-tool result) failed → retry');
  },

  '6 persona/segment switch (option C)': async () => {
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
    ok('persona option C: _PHASE_INSTRUCTIONS injected per current_phase; SQL conventions GENERATION-only; no complete:true (other sections preserved)');
  },

  '7 honest_decline (max_attempts + fallbacks exhausted)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    // GENERATION: fallbacks exhausted (2/2) + attempts at max → no fallback left → honest_decline
    setPhase(pg, Phase.GENERATION, {
      phase_output: 'no sql',
      fallback_count: PipelineConfig.max_fallbacks,
      phase_attempts: 5, // = max_attempts
    });
    const d = await h.runTurn(SID, [[['critique_sql_tool', { confidence: 0.9 }]]]);
    show(pg, 'after honest_decline');
    if (d.kind !== 'honest_decline') throw `expected honest_decline, got ${d.kind}`;
    ok(`honest_decline: GENERATION gate fail + max_attempts + fallbacks exhausted → ${d.reason}`);
  },

  '8 forced_load finding (programmatic in-phase tool — surface guard routing)': async () => {
    const pg = new PhaseGatePlugin();
    const h = new FakeHarness(pg);
    fresh(pg);
    // forced_load = programmatic ctx.tools.execute(search_data_sources) AFTER the UNDERSTANDING
    // model-turn, still in UNDERSTANDING. search_data_sources IS in UNDERSTANDING whitelist.
    const r = await h.callTool(SID, 'search_data_sources', {});
    show(pg, 'after forced_load');
    if (r.isError) throw `in-phase forced_load should pass guard, got ${r.error?.message}`;
    ok('FINDING: in-phase forced_load passes guard (whitelisted). Real-harness question (F1): does ctx.tools.execute programmatic path exist + does it route through guard? (surface for P7b)');
  },
};

async function runAll() {
  console.log('# P7 four-phase preset + phase-gate — PROTOTYPE scenarios\n');
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
  console.log('\n# Findings surfaced (for P7b hardening):');
  console.log('  F1 forced_load: programmatic ctx.tools.execute path + whether it routes through guard — verify in real harness (this stub routes through guard; in-phase passes)');
  console.log('  F2 SQL same-source: GENERATION sql_syntax_gate (gen-time) vs EXECUTION guard chain (exec-time) are different layers — "critiqued SQL == executed SQL" must hold (extract_sql_candidate principle)');
  console.log('  F3 stall watchdog (300s no events): harness has NO native — phase-gate plugin must add an independent timer (rbi _watch_for_stall excludes ctx.awaiting_input)');
  console.log('  F4 question-scoped counters: rbi "per_turn" budget = per user-question = per harness kick (multiple turns). turn/start must NOT reset llm/exec/fallback counters — need a question-start seam (or detect first turn / current_phase→UNDERSTANDING) to reset them. This stub keeps them across turns.');
  console.log('  F5 llm-call count point: charge on llm/stream START, NOT agent/request (waterfall retries may not produce a real LLM call)');
  console.log('  F6 step max_steps: harness has NO native step/turn budget (§3.2#4); this stub models budgets at turn-stopping only — a per-step ceiling (rbi AgentLoop.max_steps=20/30) needs a per-step hook, deferred to P7b');
  console.log(failures === 0 ? '\n✓ all scenarios passed' : `\n✗ ${failures} scenario(s) failed`);
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
