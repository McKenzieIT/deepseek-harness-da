# P11 — eval harness 迁移

**Type**: prototype
**Phase**: 4
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder session (2026-08-20)
**Blocked by**: ~~R3~~ / ~~G2~~（均解）

**Question**: `packages/eval/`（3 级评分 + 5 match mode + `EvalCase` + 多轮）——按 G2 落 TS。Phase 4。

## Resolution（resolved 2026-08-20，wayfinder "work through the map" prototype session）

**8/8 scenario 全绿 prototype 验证 G2 设计 + 6 实现决策落地成立。** 先 throwaway prototype（[`prototypes/p11-eval-harness/`](../../prototypes/p11-eval-harness/)，`.mjs` + harness-stub stub 掉 SDK/llm-replay/ODPS/llm-judge，scenario 驱动全绿即证）仿 p4/p7/p8 先例；production `packages/eval/`（真依赖）= 后续 **P11b**。grilling + domain-modeling 钉 6 决策（G2 未定、留给 P11）：

- **D1 交付形态=先 prototype**：throwaway `.mjs`+harness-stub；P11 无前置 prototype（G2 是 grilling）→ P11 即 prototype 那一步；production=后续 P11b（P7→P7b/P8→P8b/P4→P4b 先例）。P4b"直落"是硬化已 proto 的 P4，非同情形。
- **D2 expected 来源=fixture**：预录 `result_value`+`match_mode`（镜像 rbi `EvalCase.result_value`）；dsh-llm-replay 冻 LLM→EXECUTION 也须确定→fixture 最简（expected 不依赖 ODPS 数据冻结）；agent actual 经 `ctx.query.execute`（stub ODPS 冻到 fixture 日期）→ proto 无 drift。re-run ODPS="live 正确性"另一模式，出 P11 确定性 scope；drift=生产 ops finding（re-baseline+version+drift-robust match_mode）。
- **D3 stand-in ODPS=in-process stub `ctx.query.execute`**：canned-rows 冻到 fixture 日期、minimal done/failed 3-state；proto 验 eval 编排+判分逻辑，非 query-engine（P4/P4b 已验）；不耦合 `packages/query/query-maxcompute/`；真 wiring=P11b。
- **D4 DELIVERY=全三层+stub judge**：scalar_exact（数值，解析 finalResponse）/ token+char-trigram fuzzy ≥0.35（文本，复用 `_turn_matches_expectation`）/ LLM-judge（注入式 LLMProvider，验 injection+`JUDGE_MAX_RETRIES=2`+1s→2s→4s 退避+`classify_error`+`AuthenticationAbort`）。**judge≠agent LLM**：dsh-llm-replay 只冻被测 agent→stub judge 保 proto 确定性；真 llm-dashscope judge=P11b（须 judge 也 replay 或接受 variance，产品决策）。routing=per-case `delivery_match`+按 expected 类型 auto-fallback；非终止轮 derailment=fuzzy（与终止 DELIVERY 分离）。
- **D5 MVP=8 scenario S1-S8**：每条钉一 G2 支柱（MultiTurnSession/drive_session/pass_k/`_turn_matches_expectation`/5 match_mode/DELIVERY 三层/`pass_k_verdict` 首非 pass/`Promise.race` 超时+respawn/H1 mitigation），全覆盖，仿 P7 规模。裁任一则该支柱未验。
- **D6 H1=mitigation 断言**：研究 Claim H1 已 path:line 实证 finalResponse"非因果归属该 prompt"对脚本化多轮（单 prompt、无 steering）不咬→不重开；proto S8 stub 模拟 derailing 区间（≥2 assistant/message）+`validateRunResult` 断言计数==1→`ProtocolError` 验 mitigation 逻辑（非真 SDK probe）。

**surfaced 9 finding**（P11b 生产硬化须解，见 prototype README「Surfaced findings」）：(1) trigram fuzzy 短 token 过宽容（S6 原 `gameX` vs `gameA` 重叠 2/3 误判 pass——须阈值/路由 grilling）；(2) environmental failure 分类缺（须 `classify_execution_failure` 拆 syntax_error=score vs infrastructure/timeout/patience=refuse）；(3) 真 dsh-llm-replay wiring（runtime `cordis.yml`+`DSH_SNAPSHOT_FILE`+snapshot JSONL）；(4) 真 `ctx.query.execute` wiring（P4b sidecar 3-state `QueryOutcome`）；(5) 真 llm-dashscope judge wiring+judge 确定性（须 judge 也 replay 或接受 variance）；(6) session async（da 适配：rbi sync `score_l1`→da async `scoreDa`，因 DELIVERY LLM-judge async）；(7) generatedSql 从 `tool/call` 事件捞 + eval 经 `ctx.query.execute` 重跑拿确定 actual（G2"跑 da 自己的 ODPS"，不信 agent trace 的 tool/result——设计决策 validated）；(8) H1 mitigation（`validateRunResult` 计数==1）作生产断言保留；(9) `Promise.race` 超时+runtime close/respawn 真 wiring（真 = reap runtime 子进程+重 spawn，P11b）。

**关键命名澄清**：rbi `_turn_matches_expectation` 实用 char **trigram**（n=3）非 bigram——源码 `_char_ngrams(text, 3)`，变量名 `bigrams` 是误名；研究文档/G2 ticket"token/bigram ≥0.35"不精确。proto 从源码用 trigram，README flagged。G2 决议文本宜后续修正"token/trigram ≥0.35"。

**解锁/影响**：毕业 map Not-yet-specified「D2 (c) keep/regress」（P11 eval harness 就绪→可重访：保留 (b) retrieve-tool escape-hatch 还是回归 (a) pipeline-only，确定性预取召回 ≥85-90%+歧义<15% 驱动）。production `packages/eval/` = **P11b**（待开票，blocked-by 此 proto 设计锁定 + G2 指针）。G2 决议不受影响——6 决策是 G2 内部待补设计点的落地，非推翻。

**Design (per G2, resolved 2026-08-20)**：见 [G2](G2-eval-ts-vs-python.md) + [`../../research/g2-eval-ts-review.md`](../../research/g2-eval-ts-review.md) + [`../../research/r3-multiturn-eval-hook.md`](../../research/r3-multiturn-eval-hook.md)。**TS `packages/eval/`**（additive），重实现 rbi-eval 编排设计（非代码），包 TS SDK `DeepSeekHarness.run()`（`@deepseek-ai/dsh-sdk-client`）作 `AgentResponder`（`respond(req)={reply:run(req.message).finalResponse, events:run().events}`）。编排重实现 `MultiTurnSession`/`drive_session`/`run_multi_turn_case`/`pass_k_verdict`/`_turn_matches_expectation`（token/bigram ≥0.35）；pass_k k 独立 session（`{run_id}:{case_id}:{k}`）；多轮同 session 句柄多次 run()；确定性 `dsh-llm-replay` 经 runtime `cordis.yml`。**判分 (ii) DELIVERY+EXECUTION 不用 sqlglot**：EXECUTION=5 match_mode 直译 + 跑 da ODPS（`ctx.query.execute`）比结果集；DELIVERY 分层（数值 scalar_exact / 文本 token-bigram fuzzy ≥0.35 / 复杂语义 LLM-judge 经 `llm-dashscope`，仿 rbi `scoring/judge.py` 注入式 LLMProvider）。**EvalCase=da-fresh schema 非 P6 zod-mirror**（rbi EvalCase BI 专属，仅借 result_value+match_mode+turns）。无 mid-turn cancel→`Promise.race` wall-clock 超时；丢 rbi L1 SQL 卫生断言（field_coverage/limit_reasonable/partition_compliant）=已知 trade-off。成本 ~600-800 行最小/~1500+ 完整。~~P11 待解设计点：expected 结果集来源（fixture 预录 vs eval 时重跑 ODPS，确定性 vs 数据时效权衡）。~~ → **已解**（见上 Resolution D2=fixture；6 实现决策全解，8/8 scenario 绿证 G2 设计落地）。
