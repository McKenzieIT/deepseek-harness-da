# P11 eval harness — PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** 非 shipped 包、非生产代码。validated 形态将重新实现为真实 `packages/eval/`（TS、真 `@deepseek-ai/dsh-sdk-client` + `dsh-llm-replay` + `ctx.query.execute` + `llm-dashscope`）——那是生产步骤（**P11b**），非本原型。本目录是 wayfinder ticket **P11** 的 primary-source artifact；勿 promote。见 `../../tickets/phase-4/P11-eval-harness.md`。

## The question it answers

G2 locked 的 eval 设计（TS `packages/eval/` 重实现 rbi-eval 编排*设计*非代码；判分 (ii) DELIVERY+EXECUTION 不用 sqlglot；包 TS SDK `DeepSeekHarness.run()` 作 AgentResponder；da-fresh EvalCase；`dsh-llm-replay` 确定性；`Promise.race` 超时）——**落成可跑、全绿的 prototype 是否证其设计成立？** P11 grill 了 G2 未定的 6 个实现决策，建本 proto 验证。8 scenario 全绿 = G2 设计 + 6 决策落地成立。

## Locked decisions (见 ticket P11 + G2 + research + grilling)

- **D1 交付形态 (Q6)**：先 throwaway prototype（本目录 `.mjs` + harness-stub）→ production `packages/eval/` = 后续 P11b（P7→P7b / P8→P8b / P4→P4b 先例）。5 决策未定时不建生产包；P11 无前置 prototype（G2 是 grilling）→ P11 即 prototype 那一步。P4b"直落"是硬化已 proto 的 P4，非同情形。
- **D2 expected 来源 (Q1)**：fixture 预录 `result_value`+`match_mode`（镜像 rbi `EvalCase.result_value`）。dsh-llm-replay 冻 LLM → EXECUTION 也须确定 → fixture（expected 不依赖 ODPS 数据冻结）最简；agent actual 经 `ctx.query.execute`（proto stub ODPS 冻到 fixture 日期）→ proto 无 drift。re-run ODPS = "live 正确性"另一模式，出 P11 确定性 scope；drift = 生产 ops finding（re-baseline + version + drift-robust match_mode）。
- **D3 stand-in ODPS (Q5)**：in-process stub `ctx.query.execute`（canned-rows 冻到 fixture 日期，minimal done/failed 3-state）。proto 验 eval 编排 + 判分逻辑，非 query-engine（P4/P4b 已验）。不耦合 `packages/query/query-maxcompute/` 生产包；真 fidelity eval→ctx.query.execute→sidecar wiring = P11b。
- **D4 DELIVERY 三层 (Q4)**：全三层——scalar_exact（数值，解析 finalResponse）/ token+char-trigram fuzzy ≥0.35（文本，复用 `_turn_matches_expectation`）/ LLM-judge（复杂语义，注入式 LLMProvider）。LLM-judge 用 **stub** 注入（验 injection+`JUDGE_MAX_RETRIES=2`+1s→2s→4s 退避+`classify_error`+`AuthenticationAbort`）。**judge ≠ agent LLM**：dsh-llm-replay 只冻被测 agent；judge 是另一路 → stub judge 保 proto 确定性；真 llm-dashscope judge = P11b（须 judge 也 replay 或接受 variance）。routing=per-case `delivery_match` 显式 + 按 expected-answer 类型 auto-fallback；非终止轮 derailment 用 fuzzy（与终止 DELIVERY 分离）。
- **D5 MVP 切片 (Q2)**：8 scenario S1-S8（每条钉一 G2 支柱，全覆盖，仿 P7 规模）。裁任一则该支柱未验。
- **D6 H1 (Q3)**：研究 Claim H1 已 path:line 实证 finalResponse"非因果归属"对脚本化多轮（单 prompt、无 steering）不咬 → 不重开；proto 用 **S8 stub 模拟 derailing 区间（≥2 assistant/message）+ `validateRunResult` 断言计数==1→ProtocolError** 验 mitigation 逻辑（非真 SDK probe）。

## Run

```
cd wayfinder/data-agent/prototypes/p11-eval-harness
node run.mjs --demo     # 自动跑 8 scenario，每步打印全 eval 状态
node run.mjs            # 交互菜单
```
无依赖（纯 node `.mjs`，无 build，无 node_modules）。

## Validated（8/8 scenario 全绿，code 2026-08-20）

- **S1**：scripted 多轮（2 scripted turn + terminal Q）+ pass_k=3 全 pass → MultiTurnSession 状态机 + `drive_session` + `run_multi_turn_case` + `pass_k` + AgentResponder 适配（reply=`finalResponse`、SQL 从 tool/call 事件捞）+ dsh-llm-replay 确定性（3 attempt 同输出）。
- **S2**：非终止轮 derailment（agent reply fuzzy <0.35）→ streak 断→derailment → `_turn_matches_expectation` fuzzy + derailment verdict 映射（pass→partial / fail→fail）+ state=terminated + `derailed_at_turn`。
- **S3**：EXECUTION 5 match_mode（scalar_exact / multi_scalar_exact / row_count_range / set_equal / ordered_subset）各一断言全 pass → 5 模式 1:1 直译（`checkResultMatch`）+ `ctx.query.execute` stub + fixture 载入。
- **S4**：DELIVERY scalar_exact（数值，解析 finalResponse 含 98765）+ fuzzy（文本，token/trigram ≥0.35）→ 两确定层。
- **S5**：DELIVERY LLM-judge stub——retryable 错 2 次后成功→backoff+`JUDGE_MAX_RETRIES=2` 处理（3 calls）→ pass；+ auth 错→`AuthenticationAbort` 终止整 run（SPEC §5.5）→ 注入 + retry/backoff + `classify_error` + `AuthenticationAbort`。
- **S6**：pass_k=3 attempt1 fail（DELIVERY 错答、EXECUTION 对→"取数对但交付错"分离失败模式）/ 2-3 pass → 整体 fail，verdict=**attempt1（首非 pass，非末）** → `pass_k_verdict` anti-flakiness。
- **S7**：stub harness hangUntilRespawn→attempt1 `Promise.race(50ms)` 超时→`onTimeout` close+respawn→attempt2/3 pass（respawnCount=1）→ `Promise.race` wall-clock 超时 + runtime close/respawn（H2 mitigation，无 mid-turn cancel）。
- **S8**：stub harness 返回 derailing 区间（2 assistant/message）→ `validateRunResult` 断言计数==1→`ProtocolError` → H1 mitigation（研究已实证不咬→验 mitigation 逻辑）。

## Surfaced findings（P11b 生产硬化须解，p4/p7/p8 先例）

1. **trigram fuzzy 对短 token 过宽容**：S6 原用 `gameX` vs `gameA`——trigram 重叠 2/3（gam/ame）≥0.35 → 误判 pass。改用无重叠错答才 fail。→ P11b 须：短答案走 `scalar_exact` 或 LLM-judge，或提 threshold / 加 min-token-length 守卫，或 fuzzy 仅作 derailment（非终止）非终止 DELIVERY。proto 用"无重叠错答"绕过；生产 fuzzy 阈值/路由须 grilling。
2. **environmental failure 分类缺**：proto `submit_turn` 简化——stub executeSql 返回 success/fail；`success:false` 当 scoreable（agent SQL 错）。rbi `classify_execution_failure` 区分 `syntax_error`/`guard_rejected`（agent SQL 错=score）vs `infrastructure`/`timeout`/`patience`（warehouse 没答=refuse 不 score）。→ P11b 须接真 `classify_execution_failure`（或 ctx.query.execute 的 failure_class）拆此。
3. **真 dsh-llm-replay wiring**：proto 用 canned-response map 模拟确定性；真 = `dsh-llm-replay` Cordis 插件经被 spawn runtime 的 `cordis.yml` + `DSH_SNAPSHOT_FILE` env 加载（research Claim G，语言无关）。→ P11b 配 runtime `cordis.yml` + snapshot JSONL + `launch:{command,args,env}`。
4. **真 ctx.query.execute wiring**：proto in-process stub；真 = `packages/query/query-maxcompute/`（P4b）的 `ctx.query.execute`（3-state `QueryOutcome` done/failed/pending + per-scope 缓存）。eval→ctx.query.execute→sidecar 真 wiring = P11b。
5. **真 llm-dashscope LLM-judge wiring + judge 确定性**：proto stub judge；真 = `llm-dashscope`（R1/P2 native AGA adapter）作注入式 LLMProvider。judge 确定性须单独冻（agent 的 dsh-llm-replay 不覆盖 judge）或接受 variance（temp 0 + 重试预算）——产品决策，P11b grilling。
6. **session.submit_response async（da 适配）**：rbi `submit_response` sync（`score_l1` sync）；da async（`scoreDa` 的 DELIVERY LLM-judge async）。faithful da 现实（LLM 调用 async）；`submit_turn`/`drive_session`/`run_multi_turn_case` 全 async。P11b TS 实现同 async。
7. **agent generatedSql 从 tool/call 事件捞 + eval 重跑**：TS SDK `RunResult` 无 generatedSql 字段（rbi pipeline 有 sql 事件）→ `extractReply` 从 `tool/call` 事件捞 SQL，eval 经 `ctx.query.execute` 重跑拿确定 actual（G2"跑 da 自己的 ODPS"），**不**信 agent trace 的 tool/result（eval 掌控执行确定性）。validated 设计决策。
8. **H1 mitigation 应保留**：`validateRunResult`（区间 assistant/message 计数==1）作生产断言保留——防隐蔽错配（steering/queued work 混入）。proto S8 验证。
9. **Promise.race 超时 + respawn 真 wiring**：proto stub `close()`+`respawn()`；真 = `harness.close()` reap runtime 子进程 + 重 spawn（生产 respawn 更重，P11b）。

## Assumptions (react to these)

1. **`.mjs`, not TS.** Throwaway；无 build。真实实现是 TS（`packages/eval/` + 真依赖）。仿 p4/p6/p7/p8 先例。
2. **harness-stub.mjs is a STAND-IN.** 假 `DeepSeekHarness.run()`（canned RunResult + hang/derailing 模拟）+ `ctx.query.execute`（canned rows）+ llm-judge provider（scripted verdicts + 模拟 failure）+ dsh-llm-replay（canned-response map）。真实现见 surfaced findings #3/#4/#5。
3. **dsh-llm-replay = canned-response map（proto）.** 真 llm-replay 读 JSONL + 经 cordis.yml 回放 LLM 流；proto 假确定性响应。语言无关性（research Claim G）未在 proto 验（须 P11b 真 runtime）。
4. **judge stub 模拟 classify_error.** stub 抛带特定 token 的 Error 让 `classifyError` 路由；真 llm-dashscope 错误体形态须对齐（P2 已 probe AGA wire）。
5. **5 match_mode envelope 从 rbi 直译.** `result_value` 形状（`{value}`/`{fields}`/`{min,max}`/`{rows}`）1:1 镜像 rbi `match_modes.py`；da-fresh EvalCase 仅借 `result_value`+`match_mode`+`turns`（research Claim F，不套 P6 zod-mirror）。
6. **routing 的"长文本→llm_judge"阈值 120 字符.** da-fresh heuristic（>120 → llm_judge）；生产可调或 per-case 显式 `delivery_match`。
7. **`_turn_matches_expectation` 用 trigram（n=3）非 bigram.** rbi 源码 `_char_ngrams(text,3)`（变量名 `bigrams` 是误名）；研究文档/G2 ticket"token/bigram"不精确。proto 从源码用 trigram。S6 surfaced #1 揭示短 token 过宽容。

## Files

- `eval_case.mjs` — da-fresh EvalCase schema + `validateCase`（仅借 rbi `result_value`+`match_mode`+`turns`；瘦 `dimensions`；da 新增 `answer`+`delivery_match`）。
- `match_modes.mjs` — 5 match_mode 1:1 直译（rbi `scoring/match_modes.py`）。
- `text_sim.mjs` — `turnMatchesExpectation` + `charNgrams`（rbi `session.py _turn_matches_expectation` + `_char_ngrams`）；抽叶破环。
- `judge.mjs` — `judgeWithProvider`（注入式 LLMProvider）+ `JUDGE_MAX_RETRIES=2`+1s→2s→4s 退避 + `classifyError`(auth/retryable/unclassified) + `AuthenticationAbort`。
- `delivery.mjs` — DELIVERY 三层（scalar_exact / fuzzy / llm_judge）+ `routeDelivery`（per-case `delivery_match`+按 expected 类型 auto-fallback）。
- `scoring.mjs` — da (ii) `scoreDa`：sql_executable + result_non_empty + result_match（5 模式）+ delivery；verdict pass iff all declared pass；丢 sqlglot 卫生断言（已知 trade-off）。
- `session.mjs` — `MultiTurnSession` 状态机（pending→running→terminated/completed）+ `next_input`/`submit_response`（async）+ `_handle_terminal`/`_handle_derailment`（verdict 映射 pass→partial / fail→fail）+ diagnostic。
- `multi_turn.mjs` — `AgentTurnRequest`/`Reply`/`Responder` + `submitTurn`（execution_error 不推进 session）+ `driveSession`（agent 异常→attempt error，AuthenticationAbort 透传，`Promise.race` wall-clock 超时）+ `passKVerdict`（首非 pass）+ `runMultiTurnCase`（pass_k=3, `passed=all(error None and verdict=="pass")`）+ `sessionId`=`{run_id}:{case_id}:{attempt}`。
- `adapter.mjs` — `extractReply`（reply=`finalResponse`、generatedSql 从 `tool/call` 捞）+ `buildAgentResponder`（包 harness）+ `validateRunResult`（H1 mitigation，区间 assistant/message 计数==1 否则 `ProtocolError`）。
- `harness-stub.mjs` — STAND-IN：`StubHarness`（canned RunResult + `hangUntilRespawn` + `close`/`respawn`）+ `runResult`/`runResultDerailing` + `makeStubExecute`（stub ctx.query.execute）+ `makeStubJudgeProvider`（stub LLM-judge provider）。
- `run.mjs` — demo driver（8 scenario `--demo` + 交互菜单，全绿即证）。
- `../../tickets/phase-4/P11-eval-harness.md` — ticket（Resolution + Design 节）。
- `../../research/g2-eval-ts-review.md` + `../../research/r3-multiturn-eval-hook.md` — G2 对抗审查 + R3 编排 path:line 详记（权威设计源）。
