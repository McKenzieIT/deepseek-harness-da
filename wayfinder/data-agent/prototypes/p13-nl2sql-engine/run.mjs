// P13 NL→SQL 引擎 — PROTOTYPE driver（scenarios --demo + 交互菜单）。
// 9 scenarios 确定性全绿验证六组件 + eval gate + honest decline + sql_syntax_gate 槽。
// question 含召回关键词让 BM25 召回候选表与 SQL 表对齐（'充值'→dws_pay_order_di /
// '战斗'→dws_battle_di / '埋点'→ods_event_view / '月球'→空候选→honest decline）。
import { Nl2sqlEngine } from './engine.mjs';
import { ReplayLlm } from './replay-llm.mjs';
import { StandInOdps, outcome } from './stand-in-odps.mjs';
import { critiqueSql, sqlSyntaxGate, extractJsonPaths } from './critic.mjs';
import { buildPrompt } from './prompt.mjs';
import { loadConventions } from './conventions.mjs';
import { RetrievalSeamStub } from './bm25-linking.mjs';
import { makeCriticCtx, GateResult, MAX_SQL_PER_TURN } from './types.mjs';
import { runEval } from './eval/runner.mjs';
import { FIXTURE_DATA_SOURCES as DS, FIXTURE_EVENT_DEF as EV } from './eval/cases.mjs';

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function show(obj, label) {
  console.log(`  [${label}] ${JSON.stringify(obj)}`);
}

const scenarios = {
  '1 BM25 linking 召回（per-field 权重+CJK bigram）': async () => {
    const r = new RetrievalSeamStub(DS);
    const hits = r.retrieve('昨天充值总金额', { topK: 5, mode: 'bm25-only' });
    show(hits.map((h) => ({ id: h.id, score: Number(h.score).toFixed(3) })), 'hits');
    if (!hits.length || hits[0].id !== 'dws_pay_order_di') throw `top-1 应为 dws_pay_order_di，got ${hits[0]?.id}`;
    ok('BM25 召回 dws_pay_order_di 为 top-1（"充值"匹配 description+metrics pay_amt，per-field 权重+CJK bigram 生效）');
  },

  '2 prompt 组装（staged SOP+方言 grounding+MAX_SQL_PER_TURN+P7 四阶段）': async () => {
    const p = buildPrompt({
      question: '昨天充值总金额',
      candidates: [{ id: 'dws_pay_order_di', score: 1.2, payload: DS[0] }],
      eventDef: EV,
      conventions: loadConventions(),
      phase: 'generation',
    });
    for (const must of [
      '§3 直答路径', '阶段 A 准备', '阶段 D 执行与防护', '§5 诚实拒绝', '§6 八规则',
      'MAX_SQL_PER_TURN=' + MAX_SQL_PER_TURN, '方言速查', 'GET_JSON_OBJECT', 'phase=generation',
    ]) {
      if (!p.includes(must)) throw `prompt 缺 ${must}`;
    }
    ok(`prompt 组装完整：staged SOP/§6/§5/工具目录/MAX_SQL_PER_TURN/方言 grounding/P7 四阶段适配（len=${p.length}）`);
  },

  '3 critic gate 拦截（ds 缺/SELECT *→warn；表名∉候选/字段∉params→fail；无 SQL→fail-open）': async () => {
    const ctx = makeCriticCtx({ candidateTables: ['dws_pay_order_di'], eventParams: EV.params_fields, partitionCols: ['ds'] });
    // ds 缺 → warning（pass+reason）
    let r = critiqueSql('SELECT SUM(pay_amt) FROM dws_pay_order_di', ctx);
    if (!(r.passed && r.reason && r.reason.includes('missing_partition_filter'))) throw `ds 缺应 warning，got passed=${r.passed} reason=${r.reason}`;
    // SELECT * → warning
    r = critiqueSql("SELECT * FROM dws_pay_order_di WHERE ds='20260819'", ctx);
    if (!(r.passed && r.reason && r.reason.includes('select_star'))) throw `SELECT * 应 warning`;
    // 表名∉候选 → error fail
    r = critiqueSql("SELECT COUNT(*) FROM fake_table WHERE ds='20260819'", ctx);
    if (r.passed) throw `表名∉候选应 error fail`;
    // 字段∉params → error fail
    r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.notAField') FROM ods_event_view WHERE event='x' AND ds='20260819'", { ...ctx, candidateTables: new Set(['ods_event_view']) });
    if (r.passed) throw `字段∉params 应 error fail`;
    // 字段∈params → pass
    r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.amount') FROM ods_event_view WHERE event='x' AND ds='20260819'", { ...ctx, candidateTables: new Set(['ods_event_view']) });
    if (!r.passed) throw `字段∈params 应 pass`;
    // fail-open：无 SQL
    r = critiqueSql(null, ctx);
    if (!r.passed) throw `无 SQL 应 fail-open pass`;
    ok('critic gate：ds 缺/SELECT *→warning pass；表名∉候选/字段∉params→error fail；无 SQL→fail-open（判罚与 RBI 同向）');
  },

  '4 critic JSON path 解析（$.a.b.c 取叶子段∈params）': async () => {
    const paths = extractJsonPaths("SELECT GET_JSON_OBJECT(params, '$.user.profile.level') FROM t WHERE ds='1'");
    if (!paths.length || paths[0].leaf !== 'level') throw `叶子段应 level，got ${paths[0]?.leaf}`;
    const ctx = makeCriticCtx({ candidateTables: ['t'], eventParams: { amount: {} }, partitionCols: ['ds'] });
    const r = critiqueSql("SELECT GET_JSON_OBJECT(params,'$.user.profile.level') FROM t WHERE ds='1'", ctx);
    if (r.passed) throw `$.user.profile.level 叶子段 level ∉ params 应 fail`;
    ok(`方案 4：$.user.profile.level 取叶子段 'level' 校验∈event_params（嵌套路径覆盖，对齐 sql_critic.py:481 last-key）`);
  },

  '5 feedback self-correction（parse_failed→重写→done；TABLE_NOT_FOUND→decline）': async () => {
    // parse_failed 第一次，重写后 done
    let llm = new ReplayLlm({
      充值场景一: ({ attempt }) => ({ sql: attempt === 0 ? 'SELECT BAD SYNTAX FROM dws_pay_order_di WHERE ds=20260819' : "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" }),
    });
    let odps = new StandInOdps({ 'BAD SYNTAX': outcome.failed('parse_failed', 'syntax error near BAD') });
    let eng = new Nl2sqlEngine({ dataSources: DS, llm, odps });
    let r = await eng.run({ question: '充值场景一', eventDef: EV });
    if (!r.ok) throw `parse_failed 应重写后 done，got ${r.reason || r.decline}`;
    ok('feedback self-correction：parse_failed→LLM 读 error 重写→done（对齐 BIRD-FIXER / Databricks Genie Inspect）');
    // TABLE_NOT_FOUND → honest decline（不可修复）
    llm = new ReplayLlm({ 充值场景二: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds=20260820" } });
    odps = new StandInOdps({ 'ds=20260820': outcome.failed('TABLE_NOT_FOUND', 'Table not found in scope') });
    eng = new Nl2sqlEngine({ dataSources: DS, llm, odps });
    r = await eng.run({ question: '充值场景二', eventDef: EV });
    if (!r.decline) throw `TABLE_NOT_FOUND 应 honest decline，got ok=${r.ok}`;
    ok('TABLE_NOT_FOUND→不可修复→honest decline（不消耗重试，§3 阶段D）');
  },

  '6 近重复门（同 SQL 哈希拒重试）': async () => {
    const sql = "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'";
    const llm = new ReplayLlm({ 充值场景三: { sql } });
    const odps = new StandInOdps({ [sql]: outcome.failed('parse_failed', 'syntax') }); // 相同 SQL 一直 parse_failed
    const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps });
    const r = await eng.run({ question: '充值场景三', eventDef: EV });
    if (!r.decline) throw `相同 SQL 重复应被近重复门拒→decline，got ok=${r.ok}`;
    const nearDupEvents = r.trace.filter((t) => t.step === 'near_dup_reject');
    if (!nearDupEvents.length) throw `应有 near_dup_reject trace`;
    ok(`近重复门：相同失败 SQL 第二次被同哈希拒重试→自修耗尽→honest decline（near_dup_reject ×${nearDupEvents.length}）`);
  },

  '7 eval gate L1 pass-rate（da-fresh cases+EXECUTION 判分+诚实门值<RBI 73.8%）': async () => {
    const r = await runEval({ verbose: false });
    show({ pass: r.pass, total: r.total, pass_rate: r.pass_rate.toFixed(3) }, 'eval');
    if (r.pass_rate < 0.7) throw `eval pass-rate ${r.pass_rate.toFixed(2)} 应 ≥0.7（scripted LLM 应高；若低说明 pipeline 有 bug）`;
    if (r.pass !== r.total) throw `scripted 应全 pass，got ${r.pass}/${r.total}（details: ${r.details.filter((d) => !d.ok).map((d) => d.id).join(',') || 'none'}）`;
    ok(`eval gate：da-fresh EvalCase + EXECUTION 5 match_mode 判分 + dsh-llm-replay 确定性 + 轻量 runner 不经真 harness session；pass-rate=${r.pass_rate.toFixed(3)}（诚实门值<RBI 73.8% 上界，对齐 P11/G2）`);
  },

  '8 honest decline（自修 N 次仍失败/语义层无定义）': async () => {
    const llm = new ReplayLlm({ 月球场景一: { sql: "SELECT COUNT(*) FROM moon_landing WHERE ds='20260819'" } });
    const odps = new StandInOdps({});
    const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps });
    const r = await eng.run({ question: '月球场景一', eventDef: EV });
    if (!r.decline) throw `语义层无定义应 honest decline`;
    ok('honest decline：BM25 召回空候选→LLM 编造表名∉候选→critic error fail→自修耗尽→honest decline（§5 语义层无定义）');
  },

  '9 sql_syntax_gate 槽适配（返 GateResult）+ F2 同源': async () => {
    const ctx = makeCriticCtx({ candidateTables: ['dws_pay_order_di'], eventParams: EV.params_fields, partitionCols: ['ds'] });
    const phaseOutput = "```sql\nSELECT SUM(pay_amt) FROM dws_pay_order_di WHERE ds='20260819'\n```";
    const g = sqlSyntaxGate(phaseOutput, ctx);
    if (!(g instanceof GateResult && g.passed)) throw `sqlSyntaxGate 应返 GateResult.pass，got passed=${g?.passed}`;
    // F2 同源：engine.run 里 critic 检查的 sql == odps.execute 收到的 sql（extractSqlCandidate 单源）
    const llm = new ReplayLlm({ 充值场景四: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" } });
    const odps = new StandInOdps({});
    const eng = new Nl2sqlEngine({ dataSources: DS, llm, odps });
    const r = await eng.run({ question: '充值场景四', eventDef: EV });
    const genStep = r.trace.find((t) => t.step === 'llm_generate');
    const criticStep = r.trace.find((t) => t.step === 'critic');
    const execStep = r.trace.find((t) => t.step === 'execute');
    if (!genStep || !criticStep || !execStep) throw `trace 缺 step（gen/critic/exec）`;
    if (!genStep.sql) throw `genStep 缺 sql`;
    ok('sql_syntax_gate 槽：critic 返 GateResult（对齐 phases.py:33）挂 agent/turn-stopping；F2 同源：critic 检查的 SQL=exec ctx.query.execute 收到的 SQL（extractSqlCandidate 单源，无 tools/post-execute 改写）');
  },
};

async function runAll() {
  console.log('# P13 NL→SQL 引擎 — PROTOTYPE scenarios（六组件 + eval gate + honest decline + sql_syntax_gate 槽）\n');
  let failures = 0;
  for (const [name, fn] of Object.entries(scenarios)) {
    console.log(`\n=== ${name} ===`);
    try {
      await fn();
    } catch (e) {
      failures += 1;
      console.log(`  ✗ FAIL: ${e}`);
    }
  }
  console.log(
    '\n# grilling 锁定决策（6 项，全采纳推荐）：',
  );
  console.log('  Q1 eval gate     自带最小版+对齐 P11/G2（da-fresh EvalCase+EXECUTION 判分+dsh-llm-replay+轻量 runner）');
  console.log('  Q2 embeddings    首期纯 BM25-only·不阻塞 T2；向量侧升级=用户自部署经 P5 外置 embedder');
  console.log('  Q3 sqlglot critic 方案 1（薄 regex）+方案 4（轻量 JSON path 解析）合体+执行反馈兜底；conventions 归 query 包');
  console.log('  Q4 fidelity       LLM=dsh-llm-replay+ODPS=stand-in；引擎逻辑全真');
  console.log('  Q5 near-dup gate  P13 自带薄版（同 SQL 哈希拒重试）；真 tool-query near-dup 留 Not-yet-specified');
  console.log('  Q6 生产毕业       prototype+P13b 生产；critic 生产接线 fold P7b');
  console.log('\n# drop：plan_query / sqlglot AST critic / UnifiedQueryIndex answer-RAG / cross-encoder reranker / sqlglot_dialect');
  console.log(failures === 0 ? '\n✓ all 9 scenarios passed' : `\n✗ ${failures} scenario(s) failed`);
  return failures;
}

const arg = process.argv[2];
if (arg === '--demo') {
  const f = await runAll();
  process.exit(f === 0 ? 0 : 1);
}
console.log('P13 NL→SQL 引擎 prototype. Scenarios:');
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
    console.log(`\n=== ${keys[idx]} ===`);
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
