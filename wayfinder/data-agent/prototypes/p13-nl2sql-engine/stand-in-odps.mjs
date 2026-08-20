// P13 prototype — stand-in ODPS（模拟 3-state QueryOutcome + 错误形态）。
// 仿 P4b stand-in sidecar（真 pyodps 延后→真 ODPS 不可得，grilling Q4）。
// 脚本化：scenarios 按 SQL 子串/标签返预设 3-state（done/running/failed+failureKind）。
// 错误形态（v2-baseline §3 阶段D）：parse_failed（可修复）/ TABLE_NOT_FOUND / FIELD_NOT_FOUND /
// SEMANTIC_MISMATCH / PERMISSION_DENIED（不可修复→honest decline）/ cost_exceeded（可修复）。

export class StandInOdps {
  constructor(scripted = {}) {
    this.scripted = scripted; // { sqlSubstring: outcome }
    this.execCount = 0;
  }
  async execute(sql, { signal } = {}) {
    this.execCount += 1;
    for (const [sub, out] of Object.entries(this.scripted)) {
      if (sql.includes(sub)) return out;
    }
    // 默认 done + 桩结果集（确定性 rid 用 execCount）
    return { state: 'done', result_id: `rid-${this.execCount}`, rows: [{ cnt: 42 }] };
  }
}

// 构造预设 outcome 的 helper（确定性，不用 Date.now——prototype 可复现）。
export const outcome = {
  done(rows = [{ cnt: 42 }], rid) {
    return { state: 'done', result_id: rid || 'rid-stub', rows };
  },
  running(instanceId = 'inst-stub', stage = 'Map 62% / Reduce 0%') {
    return { state: 'running', instance_id: instanceId, stage };
  },
  failed(failureKind, error) {
    return { state: 'failed', failureKind, error };
  },
};
