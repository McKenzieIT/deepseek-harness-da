# P11 — eval harness 迁移

**Type**: prototype
**Phase**: 4
**Status**: Unblocked（G2 resolved 2026-08-20）
**Blocked by**: ~~R3~~ / ~~G2~~（均解）

**Question**: `packages/eval/`（3 级评分 + 5 match mode + `EvalCase` + 多轮）——按 G2 落 TS。Phase 4。

**Design (per G2, resolved 2026-08-20)**：见 [G2](G2-eval-ts-vs-python.md) + [`../../research/g2-eval-ts-review.md`](../../research/g2-eval-ts-review.md) + [`../../research/r3-multiturn-eval-hook.md`](../../research/r3-multiturn-eval-hook.md)。**TS `packages/eval/`**（additive），重实现 rbi-eval 编排设计（非代码），包 TS SDK `DeepSeekHarness.run()`（`@deepseek-ai/dsh-sdk-client`）作 `AgentResponder`（`respond(req)={reply:run(req.message).finalResponse, events:run().events}`）。编排重实现 `MultiTurnSession`/`drive_session`/`run_multi_turn_case`/`pass_k_verdict`/`_turn_matches_expectation`（token/bigram ≥0.35）；pass_k k 独立 session（`{run_id}:{case_id}:{k}`）；多轮同 session 句柄多次 run()；确定性 `dsh-llm-replay` 经 runtime `cordis.yml`。**判分 (ii) DELIVERY+EXECUTION 不用 sqlglot**：EXECUTION=5 match_mode 直译 + 跑 da ODPS（`ctx.query.execute`）比结果集；DELIVERY 分层（数值 scalar_exact / 文本 token-bigram fuzzy ≥0.35 / 复杂语义 LLM-judge 经 `llm-dashscope`，仿 rbi `scoring/judge.py` 注入式 LLMProvider）。**EvalCase=da-fresh schema 非 P6 zod-mirror**（rbi EvalCase BI 专属，仅借 result_value+match_mode+turns）。无 mid-turn cancel→`Promise.race` wall-clock 超时；丢 rbi L1 SQL 卫生断言（field_coverage/limit_reasonable/partition_compliant）=已知 trade-off。成本 ~600-800 行最小/~1500+ 完整。P11 待解设计点：expected 结果集来源（fixture 预录 vs eval 时重跑 ODPS，确定性 vs 数据时效权衡）。
