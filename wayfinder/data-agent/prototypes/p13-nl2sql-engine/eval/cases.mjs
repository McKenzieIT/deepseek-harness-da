// P13 prototype — da-fresh EvalCase（对齐 G2：仅借 result_value+match_mode+turns）。
// rbi EvalCase BI 专属字段（behavior/dimensions/sql_steps/anchor_ds）不复用（G2 审查 F1）。
// per-scope 代表性 case ~9 条（覆盖 metric_lookup/trend/ranking/distribution/proportion +
// honest decline + feedback self-correction）。fixture dataSources + eventDef 模拟 P6 substrate。
// 每个 case 带 scriptedLlm + scriptedOdps（确定性，case 可复现；prototype 验证 eval infra
// 跑通+pass-rate 计算+honest decline 通道，非真测 LLM 质量——那是 live AGA smoke/生产 eval）。
// question 含召回关键词（'充值'→dws_pay_order_di / '战斗'→dws_battle_di / '埋点'→ods_event_view）
// 让 BM25 召回的候选表与 SQL 用的表对齐（否则 critic 表∉候选误拦）。

import { MatchMode } from '../types.mjs';

// fixture dataSources（模拟 P6 substrate 的检索候选；BM25 语料）
export const FIXTURE_DATA_SOURCES = [
  { id: 'dws_pay_order_di', description: '充值订单 DWS 汇总表 pay_amt amount role_uv', metrics: { pay_amt: {}, role_uv: {} } },
  { id: 'ods_event_view', description: '埋点事件 ods event battle item change pay result', metrics: {} },
  { id: 'dws_battle_di', description: '战斗 DWS 汇总 battle result win rate count', metrics: { win_rate: {}, battle_count: {} } },
];

// fixture eventDef（模拟 P6 EventDefinition）
export const FIXTURE_EVENT_DEF = {
  name: 'game.pay.order',
  params_fields: { amount: {}, role_id: {}, coinType: {}, result: {} },
  partitions: [{ name: 'ds' }],
};

// scripted LLM/ODPS 每 case 独立（runEval 每 case 建 engine 实例）。
export const EVAL_CASES = [
  {
    id: 'c01', question: '昨天充值总金额',
    llm: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: "ds='20260819'", out: { state: 'done', result_id: 'r1', rows: [{ total: 42 }] } },
    expected: { result_value: 42, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'c02', question: '昨天战斗胜率',
    llm: { sql: "SELECT win_rate FROM dws_battle_di WHERE ds='20260819'" },
    odps: { sub: 'FROM dws_battle_di', out: { state: 'done', result_id: 'r2', rows: [{ win_rate: 0.5 }] } },
    expected: { result_value: 0.5, match_mode: MatchMode.VALUE_CLOSE }, turns: 1,
  },
  {
    id: 'c03', question: '充值 Top10 道具 埋点',
    llm: { sql: "SELECT GET_JSON_OBJECT(params,'$.coinType') AS coin_type, SUM(CAST(GET_JSON_OBJECT(params,'$.amount') AS BIGINT)) AS total_amount FROM ods_event_view WHERE event='game.pay.order' AND ds='20260819' GROUP BY GET_JSON_OBJECT(params,'$.coinType') ORDER BY total_amount DESC LIMIT 10" },
    odps: { sub: 'coinType', out: { state: 'done', result_id: 'r3', rows: [{ coin_type: 'gold', total_amount: 100 }] } },
    expected: { result_value: [{ coin_type: 'gold', total_amount: 100 }], match_mode: MatchMode.SET_EXACT }, turns: 1,
  },
  {
    id: 'c04', question: '各服务器战斗次数',
    llm: { sql: "SELECT server_id, COUNT(*) AS battle_count FROM dws_battle_di WHERE ds='20260819' GROUP BY server_id" },
    odps: { sub: 'server_id', out: { state: 'done', result_id: 'r4', rows: [{ server_id: 's1', battle_count: 10 }] } },
    expected: { result_value: [{ server_id: 's1', battle_count: 10 }], match_mode: MatchMode.SET_EXACT }, turns: 1,
  },
  {
    id: 'c05', question: '昨天战斗总次数',
    llm: { sql: "SELECT COUNT(*) AS battle_count FROM dws_battle_di WHERE ds='20260819'" },
    odps: { sub: "FROM dws_battle_di WHERE ds='20260819'", out: { state: 'done', result_id: 'r5', rows: [{ battle_count: 10 }] } },
    expected: { result_value: 10, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'c06', question: '昨天充值人数',
    llm: { sql: "SELECT COUNT(DISTINCT role_id) AS role_uv FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: 'COUNT(DISTINCT', out: { state: 'done', result_id: 'r6', rows: [{ role_uv: 5 }] } },
    expected: { result_value: 5, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'c07', question: '昨天月球登陆次数',
    llm: { sql: "SELECT COUNT(*) FROM moon_landing WHERE ds='20260819'" },
    odps: { sub: '__never__', out: { state: 'done', result_id: 'r7', rows: [{ cnt: 0 }] } },
    expected: { result_value: null, match_mode: MatchMode.NULL_CHECK, decline: true }, turns: 1,
  },
  {
    id: 'c08', question: '昨天充值异常表',
    llm: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds=20260820" },
    odps: { sub: 'ds=20260820', out: { state: 'failed', failureKind: 'TABLE_NOT_FOUND', error: 'Table dws_pay_order_di not found in scope' } },
    expected: { result_value: null, match_mode: MatchMode.NULL_CHECK, decline: true }, turns: 1,
  },
  {
    id: 'c09', question: '充值 parse_failed 重写',
    llm: ({ attempt }) => ({ sql: attempt === 0 ? 'SELECT BAD SYNTAX FROM dws_pay_order_di WHERE ds=20260819' : "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" }),
    odps: { sub: 'BAD SYNTAX', out: { state: 'failed', failureKind: 'parse_failed', error: 'syntax error near BAD' } },
    expected: { result_value: 42, match_mode: MatchMode.SCALAR_EXACT }, turns: 2,
  },
];
