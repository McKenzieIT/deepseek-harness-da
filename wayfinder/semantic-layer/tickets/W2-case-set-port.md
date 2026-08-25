# W2 — Case-set port (C)（RBI 161 → da EvalCase）

**Type**: task
**Status**: Closed
**Blocked by**: —
**Resolved**: 2026-08-25

## Question

将 RBI 161 case **port 成 da `EvalCase` YAML**（`packages/eval/eval` 的 `EvalCaseSchema`：`result_value` + `match_mode` + `turns`；EXECUTION 为主，对齐 G2 "borrows only result_value + match_mode + turns"）。expected 结果复用 RBI（G1 Q8 已认定可复用）。

G4 Q1 决策 case 集 = **C**（复用 RBI 161 为主 + 针对未覆盖资产补少量 case）。诚实标注覆盖外资产"仅结构性证据"。

分层标注（对齐 G1 Q8）：`sql_complexity`（L1-L4）+ `query_intent`（7 类）+ 线性/迭代 tag（RBI 不标须标注）。单轮 primary（喂 question，无 scripted 澄清；多轮=Level-2）。

## 验收

- [x] 161 case 成 da `EvalCase` YAML，`loadCases` 可加载、schema 校验通过
- [x] 覆盖矩阵诚实标注（哪些资产被 case 覆盖、哪些仅结构性证据）
- [x] 分层标注齐全

## Resolution（2026-08-25）

161 K11 cases 已 port 为 da `EvalCase` YAML（`packages/eval/eval/cases/k11/k11_*.yaml`）。验证结果：

- **Schema 校验**：`loadCases` 成功加载全部 161 case，EvalCaseSchema zod 验证全绿（19 tests pass）
- **K11 专用测试**：`k11-cases.spec.ts` 6 项验证全绿（数量 161、case_id 格式、7 intent、4 complexity、covered_assets 非空）
- **分层标注**：
  - `sql_complexity`：L1(27) / L2(66) / L3(42) / L4(26)
  - `query_intent`：metric_lookup(40) / trend(25) / ranking(20) / distribution(20) / proportion(20) / comparison(20) / cohort(16)
  - `mode`：linear(115) / iterative(46)
- **覆盖矩阵**（`coverage-matrix.yaml`）：
  - DWS 覆盖 161/162（仅 `dws_10000251_7_0_role_churn_pred_scoring` 未覆盖）
  - DIM 覆盖 28/159（其余 DIM = 仅结构性证据，无直接 case 验证）
- **格式**：单轮 primary（question only，turns=[]，无 scripted 澄清）；EXECUTION 模式为主（`result_value` + `match_mode` 全部非 null）

## 参考

- G4（Q1 case 集=C）、G1（Q8 eval case 集来源=RBI 161）
- schema：`packages/eval/eval/src/eval_case.ts`（`EvalCaseSchema`）
- 设计参照：`reverse-bi`/`rbi-eval`（G1 research）
