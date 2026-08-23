# W2 — Case-set port (C)（RBI 161 → da EvalCase）

**Type**: task
**Status**: Open
**Blocked by**: —

## Question

将 RBI 161 case **port 成 da `EvalCase` YAML**（`packages/eval/eval` 的 `EvalCaseSchema`：`result_value` + `match_mode` + `turns`；EXECUTION 为主，对齐 G2 "borrows only result_value + match_mode + turns"）。expected 结果复用 RBI（G1 Q8 已认定可复用）。

G4 Q1 决策 case 集 = **C**（复用 RBI 161 为主 + 针对未覆盖资产补少量 case）。诚实标注覆盖外资产"仅结构性证据"。

分层标注（对齐 G1 Q8）：`sql_complexity`（L1-L4）+ `query_intent`（7 类）+ 线性/迭代 tag（RBI 不标须标注）。单轮 primary（喂 question，无 scripted 澄清；多轮=Level-2）。

## 验收

- [ ] 161 case 成 da `EvalCase` YAML，`loadCases` 可加载、schema 校验通过
- [ ] 覆盖矩阵诚实标注（哪些资产被 case 覆盖、哪些仅结构性证据）
- [ ] 分层标注齐全

## 参考

- G4（Q1 case 集=C）、G1（Q8 eval case 集来源=RBI 161）
- schema：`packages/eval/eval/src/eval_case.ts`（`EvalCaseSchema`）
- 设计参照：`reverse-bi`/`rbi-eval`（G1 research）
