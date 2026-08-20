// P13 NL→SQL 引擎 — PROTOTYPE types (throwaway).
//
// 消费 P6 语义层 substrate 的 EventDefinition.params_fields / TableDefinition.partitions 作
// critic 守卫数据源（完整 zod schema 见 ../p6-semantic-layer/types.mjs；本 prototype 用 fixture
// 对象模拟 P6 substrate 输出，验证 critic 消费逻辑——p7 stub-isolate 先例：不耦合 P6 内部）。
//
// QueryOutcome 3-state 对齐 P4 packages/query/query/src/types.ts:38-41（done+result_id /
// running+instance_id / failed+error+failureKind）。
// GateResult 对齐 P7 ../p7-four-phase-preset/types.mjs（phases.py:33）——critic 挂 P7
// sql_syntax_gate 槽（PHASE_CONFIGS generation gate=sql_syntax_gate）返此类型。

// ── 配置（移植自 RBI v2-baseline.md §1 + phases.py + §5）──────────────────
export const MAX_SQL_PER_TURN = 8; // v2-baseline.md:5 探索预算硬限（=phases.py:124 max_executions_per_turn）
export const MAX_FEEDBACK_RETRIES = 2; // v2-baseline.md §5 自修 2 次仍失败→拒
export const PARTITION_COLUMNS = Object.freeze(['ds', 'dt', 'partition_date', 'p_date']); // sql_evaluator.py:18

// ── GateResult（对齐 P7 phases.py:33）─────────────────────────────────────
export class GateResult {
  constructor(passed, reason = null) {
    this.passed = passed;
    this.reason = reason;
  }
  static pass() {
    return new GateResult(true);
  }
  static fail(reason) {
    return new GateResult(false, reason);
  }
}

// ── Critic 守卫 finding（方案 1+4）─────────────────────────────────────────
// severity: error→GateResult.fail；warning→GateResult.pass + reason 注入；fail-open→pass
export class CriticFinding {
  constructor(rule, severity, message) {
    this.rule = rule;
    this.severity = severity;
    this.message = message;
  }
}

// ── QueryOutcome 3-state（对齐 P4 packages/query/query/src/types.ts:38-41）──
// state: done（带 result_id+rows）/ running（带 instance_id+stage）/ failed（带 error+failureKind）
export const FailureKind = Object.freeze({
  PARSE_FAILED: 'parse_failed',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  FIELD_NOT_FOUND: 'FIELD_NOT_FOUND',
  SEMANTIC_MISMATCH: 'SEMANTIC_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  COST_EXCEEDED: 'cost_exceeded',
});
// §3 阶段D：可修复错误→带错误信息重写重试（不得重复相同 SQL，近重复门防重发）
export const RECOVERABLE_FAILURES = Object.freeze([FailureKind.PARSE_FAILED, FailureKind.COST_EXCEEDED]);
// §3 阶段D：不可修复→直接 §5 拒绝（不消耗重试）
export const UNRECOVERABLE_FAILURES = Object.freeze([
  FailureKind.TABLE_NOT_FOUND,
  FailureKind.FIELD_NOT_FOUND,
  FailureKind.SEMANTIC_MISMATCH,
  FailureKind.PERMISSION_DENIED,
]);

// ── EvalCase da-fresh schema（对齐 G2：仅借 result_value+match_mode+turns）──
// rbi EvalCase BI 专属字段（behavior/dimensions/sql_steps/anchor_ds）不复用（G2 审查 F1）。
// match_mode 5 种（直译 rbi 5 match_mode + G2 EXECUTION 判分）：
export const MatchMode = Object.freeze({
  SCALAR_EXACT: 'scalar_exact', // 结果集第一行第一列数值严格相等
  SET_EXACT: 'set_exact', // 结果集行集完全相等
  SET_SUBSET: 'set_subset', // 结果集是 expected 子集
  VALUE_CLOSE: 'value_close', // 数值近似（|实际-期望|<eps）
  NULL_CHECK: 'null_check', // decline / NULL（honest decline 场景）
});

// ── Critic 守卫上下文（从 P6 substrate + 检索结果拿，不从 conventions）──────
// candidateTables: search_data_sources（BM25 linking）返回的候选表名集
// eventParams: EventDefinition.params_fields 的字段名集（GET_JSON_OBJECT 字段∈params 守卫）
// partitionCols: TableDefinition.partitions 的列名（ds 必带守卫；空=非分区 DIM 表不带 ds）
export function makeCriticCtx({ candidateTables = [], eventParams = {}, partitionCols = ['ds'] } = {}) {
  return {
    candidateTables: new Set(candidateTables.map((t) => t.toLowerCase())),
    eventParams: new Set(Object.keys(eventParams).map((f) => f.toLowerCase())),
    partitionCols: new Set(partitionCols.map((p) => p.toLowerCase())),
  };
}
