// P13 prototype — EXECUTION 判分 5 match_mode（直译 rbi 5 match_mode，G2 EXECUTION 判分层）。
// 跑 engine 生成 SQL → stand-in ODPS 执行 → 比结果集 vs expected.result_value。不用 sqlglot（G2 Q1 决策）。
// G2 判分层 (ii)：EXECUTION（取数结果集比对）+ DELIVERY；本 prototype 实现 EXECUTION（DELIVERY 留 P11 生产）。

import { MatchMode } from '../types.mjs';

// 取结果集第一行第一列数值（scalar 判分用）。
function firstScalar(rows) {
  if (!rows || !rows.length) return null;
  const v = Object.values(rows[0])[0];
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 行集序列化比较（set_exact / set_subset 用）。
function rowKey(row) {
  return JSON.stringify(Object.keys(row).sort().reduce((o, k) => { o[k] = row[k]; return o; }, {}));
}
function rowSet(rows) {
  return new Set((rows || []).map(rowKey));
}

export function scoreMatch(runResult, expected) {
  // null_check / decline case
  if (expected.decline || expected.match_mode === MatchMode.NULL_CHECK) {
    return runResult.decline === true;
  }
  if (runResult.decline) return false; // 应 done 但 decline → fail
  const rows = runResult.result || [];
  switch (expected.match_mode) {
    case MatchMode.SCALAR_EXACT:
      return firstScalar(rows) === Number(expected.result_value);
    case MatchMode.VALUE_CLOSE: {
      const a = firstScalar(rows);
      const eps = expected.eps || 0.01;
      return a != null && Math.abs(a - Number(expected.result_value)) < eps;
    }
    case MatchMode.SET_EXACT: {
      const expRows = expected.result_value;
      if (!Array.isArray(expRows)) return false;
      const a = rowSet(rows);
      const b = rowSet(expRows);
      if (a.size !== b.size) return false;
      for (const k of a) if (!b.has(k)) return false;
      return true;
    }
    case MatchMode.SET_SUBSET: {
      const expRows = expected.result_value;
      if (!Array.isArray(expRows)) return false;
      const a = rowSet(rows);
      const b = rowSet(expRows);
      for (const k of a) if (!b.has(k)) return false;
      return true;
    }
    default:
      return false;
  }
}
