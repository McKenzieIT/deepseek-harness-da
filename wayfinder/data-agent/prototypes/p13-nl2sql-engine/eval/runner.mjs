// P13 prototype — 轻量 runner（直接调 engine.run + dsh-llm-replay + 算 L1 pass-rate）。
// 不经真 harness session（grilling Q1：prototype-级自证，cases 将来被 P11 无缝消费）。
// 诚实门值 < RBI 73.8% 上界（(B) drop 了 sqlglot+bge-m3+cross-encoder；research §4.5）。

import { EVAL_CASES, FIXTURE_DATA_SOURCES, FIXTURE_EVENT_DEF } from './cases.mjs';
import { scoreMatch } from './scorer.mjs';
import { Nl2sqlEngine } from '../engine.mjs';
import { ReplayLlm } from '../replay-llm.mjs';
import { StandInOdps } from '../stand-in-odps.mjs';

export async function runEval({ cases = EVAL_CASES, verbose = false } = {}) {
  let pass = 0;
  const details = [];
  for (const c of cases) {
    // 每 case 独立 engine + scripted LLM/ODPS（确定性，case 可复现）
    const llm = new ReplayLlm({ [c.question]: c.llm });
    const odps = new StandInOdps({ [c.odps.sub]: c.odps.out });
    const engine = new Nl2sqlEngine({ dataSources: FIXTURE_DATA_SOURCES, llm, odps });
    const r = await engine.run({ question: c.question, eventDef: FIXTURE_EVENT_DEF });
    const ok = scoreMatch(r, c.expected);
    if (ok) pass += 1;
    details.push({ id: c.id, ok, sql: r.sql, decline: r.decline, reason: r.reason });
    if (verbose) {
      console.log(`  ${c.id} ${ok ? '✓' : '✗'} q="${c.question}" ${r.decline ? 'DECLINE(' + r.reason + ')' : 'sql=' + r.sql}`);
    }
  }
  const pass_rate = cases.length ? pass / cases.length : 0;
  return { pass, total: cases.length, pass_rate, details };
}
