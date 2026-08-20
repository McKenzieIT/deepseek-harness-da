# P11b — eval harness 生产硬化

**Type**: prototype
**Phase**: 4
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder session (2026-08-20)
**Blocked by**: ~~P11~~（已解；proto 设计锁定 + 6 决策落地）
**Surfaced by**: [P11 eval harness](P11-eval-harness.md)（9 surfaced findings）

**Question**: P11 throwaway proto（`prototypes/p11-eval-harness/`，stub 掉 SDK/llm-replay/ODPS/llm-judge）落地为生产 `packages/eval/`（TS、真依赖）——解 P11 surfaced 9 finding + 接真 seam。Phase 4。

**Design (per P11 + G2)**：见 [P11](P11-eval-harness.md) Resolution + [`../../prototypes/p11-eval-harness/README.md`](../../prototypes/p11-eval-harness/README.md) Surfaced findings + [G2](G2-eval-ts-vs-python.md)。production `packages/eval/`（additive，镜像其余 da 包），重实现 P11 proto 验证的编排设计为真 TS + 接真 seam：

- **真 `@deepseek-ai/dsh-sdk-client`** `DeepSeekHarness.run()`（spawn runtime 子进程 + `await using`/`close()` reap）作 `AgentResponder`；`extractReply` 从 `RunResult.events` 的 `tool/call` 捞 generatedSql（TS SDK 无 generatedSql 字段）。
- **真 `dsh-llm-replay`**（runtime `cordis.yml`+`DSH_SNAPSHOT_FILE` env+snapshot JSONL，research Claim G 语言无关）作确定性——proto 用 canned-response map，P11b 接真 replay。
- **真 `ctx.query.execute`**（P4b `packages/query/query-maxcompute/` 3-state `QueryOutcome` done/failed/pending + per-scope 缓存）作 EXECUTION actual——proto in-process stub，P11b 接真 seam。
- **真 `llm-dashscope`**（P2 native AGA adapter）作注入式 LLMProvider（DELIVERY LLM-judge）；**judge 确定性**须单独冻（agent 的 dsh-llm-replay 不覆盖 judge）或接受 variance（temp 0 + 重试预算）——产品决策，P11b grilling。
- **environmental failure 分类**：接 `classify_execution_failure` 拆 `syntax_error`/`guard_rejected`（agent SQL 错=score）vs `infrastructure`/`timeout`/`patience`（warehouse 没答=refuse 不 score）。proto 简化（success/fail），P11b 补。
- **trigram fuzzy 短 token 过宽容**（P11 S6 surfaced）：阈值/路由 grilling——短答案走 `scalar_exact`/LLM-judge 或提 threshold / 加 min-token-length / fuzzy 仅作 derailment 非终止 DELIVERY。
- **H1 mitigation**（`validateRunResult` 区间 assistant/message 计数==1→`ProtocolError`）保留作生产断言。
- **`Promise.race` 超时+runtime close/respawn 真 wiring**：proto stub `close()`+`respawn()`；真 = `harness.close()` reap runtime 子进程 + 重 spawn。
- **session async**（da 适配保留：rbi sync `score_l1`→da async `scoreDa`，因 DELIVERY LLM-judge async）。
- **EvalCase da-fresh schema**（P11 `eval_case.mjs`）→ TS zod 或 plain；case loader（YAML/JSON parse）；run 管理+持久化+报告+CLI（完整 ~1500+ 行）。

**6 决策锁定**（P11 resolved，不重开）：D1 production=`packages/eval/`（本票）/ D2 expected=fixture / D3 真 `ctx.query.execute`（本票接）/ D4 真 llm-dashscope judge（本票接，judge 确定性 grilling）/ D5-D6 proto 已验。P11b 聚焦**生产化 + 真 seam 接线 + 9 finding**。

**关联**：解锁 map Not-yet-specified「D2 (c) keep/regress」（P11b 生产 eval 跑召回/歧义数据后可重访决策）。仿 P7b/P8b/P12b/P4b 生产硬化先例。

## Resolution（resolved 2026-08-20，wayfinder "work through the map" prototype session）

P11 throwaway proto（11 .mjs，8/8 绿）落地为生产 `packages/eval/eval/`（`@deepseek-ai/dsh-eval`，TS 纯库，35 文件 / ~3300 行）。**7 grilled 生产化决策 locked + 9 surfaced finding 全解 + 真 seam 接线 + rbi 编排设计逐条 VERIFIED**。typecheck-clean（eval standalone + tsconfig.host reference）+ 201 tests green + coverage per-file 100%（诚实，无 v8-ignore/trick）。commit `2890812409`。

### 7 生产化决策（grilling locked）

1. **judge 确定性** = (b) 接受 variance（temp0 + `JUDGE_MAX_RETRIES=2` + 1→2→4s 退避 + threshold 0.6，rbi-faithful）；(a) judge-replay DEFER——judge 是 eval 侧另一路 LLM（不经 spawned runtime 的 dsh-llm-replay）；regression 模式 judge variance 混淆 flakiness = 已知 trade-off。
2. **trigram fuzzy 短 token** = 分离：derailment 保 rbi `turnMatchesExpectation`（char trigram n=3 ≥0.35）；DELIVERY fuzzy 短 expected（≤3 trigram）改 **token-containment**（gameX≠gameA fail / paraphrase-含-expected pass）；tunable 函数参带 rbi 默认。
3. **env failure 分类** = `classifyExecutionFailure`（mirror rbi l1.py 纯 string matching：guard_rejected/patience/timeout/syntax_error/table-not-found→infrastructure/默认 infrastructure）+ `mapQueryOutcome`（completed→success+rows zip columns→dict；failed→!success+error+classify；pending→patience refuse session 不推进）在 eval src/；`submitTurn` `ENVIRONMENTAL_FAILURE_CLASSES={infrastructure,timeout,patience}`→refuse-not-score；`syntax_error`/`guard_rejected`→score；宿主可选 attach/poll。
4. **真依赖接线形态** = zero-seam-dep 纯库（src/ 零 seam peerDep——不依赖 dsh-sdk-client/dsh-query/dsh-llm/cordis；callable 契约 Responder/CaseSqlExecutor/JudgeProvider + 结构 view RunResultView/QueryOutcomeView 真 seam 类型结构满足；4 seam 宿主接；deps=zod+js-yaml）。
5. **runtime spawn+测试** = eval 不 spawn（宿主拥有 DeepSeekHarness 生命周期，driveSession 取注入 timeoutMs+onTimeout）；三层测试（src stub 单测进 100%门 / scenarios.spec 折入 dev 烟雾 / live e2e 延后 self-skip）。
6. **EvalCase schema** = zod da-fresh（非 rbi-mirror；drop schema_version/sql/sql_steps/behavior/dimensions BI 专属，加 answer/delivery_match）+ YAML/JSON loader（js-yaml）+ path/glob；8 proto scenario 作 test fixtures；生产 case 消费者提供（G1b）。
7. **包形态+scope** = 纯库 `@deepseek-ai/dsh-eval`（不注册 ctx.eval，非 Cordis Service）；IN-scope ~700 行核心（编排+判分+judge+match_modes+text_sim+eval_case+case_loader+adapter）；CLI/persist/pass_at_k 报告 DEFER **P11c**。

### 9 surfaced finding 全解

(1) trigram 短 token 过宽容 → 决策 2；(2) env failure 分类缺 → 决策 3；(3) 真 dsh-llm-replay wiring → runtime cordis.yml+DSH_SNAPSHOT_FILE env（README Host wiring 详）；(4) 真 ctx.query.execute wiring → mapQueryOutcome 适配 QueryOutcome 3-state（rows `unknown[][]`→dict zip columns）；(5) 真 llm-dashscope judge+确定性 → 决策 1（注入 JudgeProvider，judge≠agent LLM）；(6) session async → scoreDa/submitResponse/driveSession/runMultiTurnCase 全 async；(7) generatedSql 从 tool/call 捞 + eval 重跑 → extractReply 从 data.sql/arguments.sql/generated_sql 捞，eval 经 CaseSqlExecutor 重跑拿确定 actual；(8) H1 mitigation 保留 → validateRunResult 区间 assistant/message 计数==1→ProtocolError；(9) Promise.race 超时+respawn → raceTimeout（Promise.race + onTimeout close+respawn + respawn-error swallow）。

### 真 seam 接线（宿主侧，README Host wiring 详）

- **Agent**: `new DeepSeekHarness({launch:{command,args,env:{DSH_SNAPSHOT_FILE,...scrubbedParentEnv()}}})`；`responder = buildAgentResponder({run:(msg,sid)=>harness.run(msg,{sessionId:sid})})`；runtime cordis.yml 加载 dsh-llm-replay；`await using`/close() reap；onTimeout close+respawn。
- **Execution**: `executeSql = async (sql)=>mapQueryOutcome(await ctx.query.execute({sql,scopeId}))`（宿主可选 attach/poll 解 pending）。
- **Judge**: `provider = async (prompt)=>{ ctx.llm.stream({provider:'dashscope',model,...}) → parse JSON → {score,rationale} }`（宿主拥有 judge prompt+JSON parse；judgeWithProvider 加重试/退避+classifyError+AuthenticationAbort）。

### rbi-faithful（code-review subagent 逐条 VERIFIED）

classifyError AUTH 侧逐词镜像（P11 code-review fix 承接——_AUTH_PHRASES substring + cued 401-only，**故意排除** forbidden/403/permission denied/authorization failed=per-case 非 run-ending；_STATUS_CUE 防 LIMIT 500→retryable）+ RETRYABLE_PHRASES 镜像（code-review 补 5 rbi 短语：rate_limit/service unavailable/internal server error/bad gateway/gateway timeout）；classifyExecutionFailure 顺序（patience 先于 timeout，table-not-found→infrastructure）；passKVerdict 取首非 pass（非末）；submit_turn execution_error 不推进 session；_char_ngrams n=3；5 match_mode 1:1；derailment verdict 映射。**修 proto bug**：judge exhaustion judgeError `'exhausted'`（非 `'retryable'`）；`for(;;)` 消不可达死代码。

### code-review

无 critical/major。2 minor fix apply：(1) RETRYABLE_PHRASES 补 rbi 5 短语；(2) submitTurn 防御性 `failureClass ?? classifyExecutionFailure(execution.error)`（不信任 executor，rbi-aligned）。coverage 诚实（grep v8-ignore/@ts-ignore/as any 零命中）。

### 命名澄清

rbi `_turn_matches_expectation` 用 char **trigram**（n=3，`_char_ngrams(text,3)`）非 bigram——变量名 `bigrams` 误名；研究/G2 ticket "token/bigram" 不精确；生产从源码用 trigram，README flagged。

### 解锁/影响

毕业 map Not-yet-specified「D2 (c) keep/regress」（P11b 生产 eval 就绪 → 可重访：保留 (b) retrieve-tool escape-hatch 还是回归 (a) pipeline-only）→ 新 grilling 票 **D2c**。CLI/persist/pass_at_k 报告 → 新票 **P11c**（blocked-by 此）。解锁 **G1b**（eval 库消费者，跑 G1 矩阵）。

### 先验 host typecheck gap（NOT P11b）

`pnpm run typecheck` 有先验错：nl2sql-engine（P13b tsconfig.host.json reference 缺→TS6307）+ phase-gate（P7b PromptAssembly import→TS2614）。eval 包 clean（standalone + host reference 已加）。建议 P13b/P7b follow-up 补 wiring。
