// P13 prototype — NL→SQL 主循环。
//
// BM25 linking → prompt → LLM（replay）→ critic gate → execute（stand-in ODPS）→
// feedback self-correction（QueryOutcome.failed → LLM 读 error 重写 → 近重复门拒重试 → 回 GENERATION，
// 最多 N 次=MAX_FEEDBACK_RETRIES）→ honest decline。
// 对齐 BIRD-FIXER / Databricks Genie Inspect（执行反馈比静态 critique 可靠，research §3.1/3.2）。
// F2 同源：critic 检查的 SQL = odps.execute 收到的 SQL（extractSqlCandidate 单源，中间无改写）。

import { MAX_FEEDBACK_RETRIES, RECOVERABLE_FAILURES, UNRECOVERABLE_FAILURES, makeCriticCtx } from './types.mjs';
import { extractSqlCandidate, critiqueSql } from './critic.mjs';
import { buildPrompt } from './prompt.mjs';
import { loadConventions } from './conventions.mjs';
import { RetrievalSeamStub } from './bm25-linking.mjs';

// 近重复门（薄版，引擎内 self-correction loop 用：同 SQL 哈希拒重试）。
// 真 tool-query consumer near-dup gate（会话级跨 turn）留 Not-yet-specified 生产项（grilling Q5）。
class NearDupGate {
  constructor() {
    this.seen = new Set();
  }
  hash(sql) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }
  allow(sql) {
    const h = this.hash(sql);
    if (this.seen.has(h)) return false;
    this.seen.add(h);
    return true;
  }
}

export class Nl2sqlEngine {
  constructor({ dataSources, llm, odps, conventions } = {}) {
    this.retrieval = new RetrievalSeamStub(dataSources || []);
    this.llm = llm;
    this.odps = odps;
    this.conventions = conventions || loadConventions('maxcompute');
  }

  // 单次 NL→SQL（带执行反馈自纠错）。
  async run({ question, eventDef, scopeId = 'game-p13' }) {
    const nearDup = new NearDupGate();
    const trace = [];
    // 1. BM25 schema-linking（P5 ctx.retrieval seam，bm25-only）
    const candidates = this.retrieval.retrieve(question, { topK: 5, mode: 'bm25-only' });
    trace.push({
      step: 'bm25_linking',
      candidates: candidates.map((c) => ({ id: c.id, score: Number(c.score).toFixed(3) })),
    });
    // critic ctx：候选表名 + event_params + 分区列（从 P6 substrate 拿，不从 conventions）
    const partitionCols = eventDef?.partitions?.map((p) => p.name) || ['ds'];
    const ctx = makeCriticCtx({
      candidateTables: candidates.map((c) => c.id),
      eventParams: eventDef?.params_fields || {},
      partitionCols,
    });

    let attempt = 0;
    let lastFeedback = null;
    while (attempt <= MAX_FEEDBACK_RETRIES) {
      // 2. prompt + 3. LLM 生成
      const prompt = buildPrompt({ question, candidates, eventDef, conventions: this.conventions, phase: 'generation' });
      trace.push({ step: 'prompt_built', attempt, len: prompt.length });
      const gen = await this.llm.generate({ question, attempt, feedback: lastFeedback });
      const sql = extractSqlCandidate('```sql\n' + gen.sql + '\n```') || gen.sql;
      trace.push({ step: 'llm_generate', attempt, sql });

      // 4. critic gate（pre-exec，挂 sql_syntax_gate 槽）
      const critic = critiqueSql(sql, ctx);
      trace.push({
        step: 'critic',
        passed: critic.passed,
        reason: critic.reason,
        findings: critic.findings.map((f) => ({ rule: f.rule, sev: f.severity })),
      });
      if (!critic.passed) {
        lastFeedback = { failureKind: 'critic_fail', error: critic.reason };
        attempt += 1;
        continue;
      }

      // 5. 近重复门（防重发相同失败 SQL）
      if (!nearDup.allow(sql)) {
        trace.push({ step: 'near_dup_reject', sql });
        lastFeedback = { failureKind: 'near_dup', error: '近重复 SQL 拒重发，须重写' };
        attempt += 1;
        continue;
      }

      // 6. execute（stand-in ODPS）—— F2 同源：critic 检查的 sql = 这里传给 odps 的 sql
      const out = await this.odps.execute(sql);
      trace.push({ step: 'execute', state: out.state, failureKind: out.failureKind });
      if (out.state === 'done') {
        return { ok: true, sql, outcome: out, result: out.rows, trace };
      }
      if (out.state === 'running') {
        // prototype 简化：running 当作未完成（不续取，留 check_query 接口；生产 check_query 续取最多 3 次）
        return { ok: false, pending: true, sql, outcome: out, trace };
      }
      // failed
      if (UNRECOVERABLE_FAILURES.includes(out.failureKind)) {
        return { ok: false, decline: true, reason: `不可修复错误 ${out.failureKind}: ${out.error}`, sql, trace };
      }
      if (RECOVERABLE_FAILURES.includes(out.failureKind)) {
        lastFeedback = { failureKind: out.failureKind, error: out.error };
        attempt += 1;
        continue;
      }
      return { ok: false, decline: true, reason: `未知错误 ${out.failureKind}`, sql, trace };
    }
    return { ok: false, decline: true, reason: `自修 ${MAX_FEEDBACK_RETRIES} 次仍失败`, trace };
  }
}
