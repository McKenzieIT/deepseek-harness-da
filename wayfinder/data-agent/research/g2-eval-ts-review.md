# G2 对抗审查：eval 迁 TS vs 保留 Python

> 研究方法：仅一级源码（harness 源 + reverse-bi rbi-eval 参考）；引用 `path:line`；推断标 INFERENCE。默认怀疑，源码确认才 VERIFIED。
> 仓库根：`/Users/mckenzie/workspace/deepseek-harness-da`（下简称 harness）；`/Users/mckenzie/workspace/reverse-bi`（下简称 rbi）。

## 摘要（结论先行）

**G2 决议经得住审查——无 claim 被源码 REFUTED，但有 4 条 PARTIAL 揭示了被低估的成本或需要补的设计点。** 核心 VERIFIED 结论：

1. **TS SDK 暴露全 tool 轨迹（Claim A VERIFIED）** —— `RunResult.events` 不过滤事件类型，`tool/call`+`tool/result`+`assistant/chunk` 全在。
2. **R3 偏好确基于不完整 TS 画像（Claim B VERIFIED）** —— R3 只考虑 ACP（剥 tool）作 TS 路径，未考虑 `packages/sdk/client` 这个保留全轨迹的 TS 客户端。推翻有据。
3. **判分 (ii) 的核心确语言无关（Claim C PARTIAL）** —— 5 个 match_mode 是纯 dict/行比较，可直译 TS；但 (ii) 暗中**丢弃了 rbi-eval L1 的 3 个 sqlglot-bound 断言**（field_coverage/limit_reasonable/partition_compliant）和 L2/L3 LLM-judge，这是产品取舍非零成本。
4. **rbi-eval 判分结构比"自定 (ii) rubric"更重（Claim D PARTIAL）** —— L1=7 断言（3 个 sqlglot AST）+ L2=4 维 rubric LLM-judge + L3=5 步验证 + auto-fix 路径 + 多步分支。(ii) 是 L1 的**严格子集**，不漏 da 必要的非 sqlglot 能力。
5. **TS 重实现 rbi-eval 编排"不大"为 PARTIAL（Claim E PARTIAL）** —— 最小编排（状态机 + pass_k + adapter + match_modes）诚实估计 ~600–800 行 TS；完整 eval（含 case loader、run 管理、持久化、报告）接近 1500+ 行。"~几百行"对最小子集诚实，对完整 eval 偏乐观。
6. **EvalCase 跨兼容为 PARTIAL（Claim F PARTIAL）** —— rbi 的 EvalCase v3 含 BI 专属字段（`behavior` direct_answer/clarify/reject/degrade、`dimensions.sql_complexity` L1-L4、`query_intent` 等），da 不应 zod-mirror rbi 的 EvalCase；应 da-fresh schema，仅借 `result_value`+`match_mode`+`turns` 结构。**P11 不应套用 P6 先例**（P6 镜像的是 SDK 协议——通用；EvalCase 是 BI 专属）。
7. **dsh-llm-replay 确为 runtime 端 Cordis 插件（Claim G VERIFIED）** —— `apply(ctx, config)` + `inject: ['llm']` + 经被 spawn 的 runtime `cordis.yml` 加载，TS eval 只需配 runtime cordis.yml + 设 env，语言无关。
8. **TS client 多轮语义与 Python SDK **完全对称**（Claim H PARTIAL）** —— 两者 interval ownership（receipt→idle）和 `finalResponse`（最后 `assistant/message` 文本）实现逐行一致。`finalResponse` "非因果归属该 prompt" 的 README 警告对 TS 和 Python 同样适用——**非 TS 专属 HOLE**。无 mid-turn cancel 也是协议级限制，TS/Python 同样。rbi-eval 自身也无 wall-clock 超时（只有 `_MAX_TURNS_PER_ATTEMPT=64` 计数 guard）。HOLE 对称——不改变 G2 推荐。
9. **"python/ 永久依赖" 前提 REFUTED（Claim I REFUTED）** —— 全仓零 `pandas`/`numpy`/`sklearn`/`torch`/`duckdb`/`polars` 命中；`packages/code-runtime` 明文 "only `'typescript'` has a published backend"，唯一发布的是 `WorkerThreadCodeRuntime`（Node worker_thread，TS）。`'python'` 是 well-known 标签但**无 backend 实现**。python/ 仅是 JSON-RPC 客户端，非 Python 代码执行 runtime。**强化 Q10=(i) 不裁**，但**不强化"python/ 是永久依赖"**——该前提源码不支持，应改为"python/ 是可选客户端、TS 是规范 runtime"。

**结论：G2 推荐不改。** 但需补三个设计点（见 HOLEs）：(a) wall-clock 超时（TS+Python 均缺）；(b) DELIVERY 的 LLM-judge 可选路径预演（若朴素相等不足）；(c) P11 case schema 应 da-fresh 不套 P6。

---

## 逐 claim 审查

### Claim A — TS SDK 暴露全 tool 轨迹：**VERIFIED**

源码 `packages/sdk/client/src/api.ts` `HarnessSession.run()`：

- `events: SessionEvent[]` 累积逻辑（`api.ts` collect 函数）只检查 `notification.method === 'session.event' && notification.params.sessionId === this.id`（`api.ts:130-145`），**不**按 event.type 过滤。
- `validatedSessionEvent(value)`（`api.ts:152-170`）**只**对 `assistant/message` 做结构校验；注释明文：「The one variant this module reads into (finalResponse) must carry kind-tagged content blocks; **other variants pass through under their envelope shape.**」—— 即 `tool/call`/`tool/result`/`assistant/chunk`/`turn/end`/`agent/inbox/spliced` 等全部以原 envelope 进入 `events` 数组。
- `RunResult` 类型定义（`packages/sdk/client/src/types.ts:55-65`）：`events: SessionEvent[]` 注释 "Every `session.event` payload for the root session, in wire order." —— **root session only**（descendant 在 `notifications` 里，未类型化进 `events`）。
- README 印证（`packages/sdk/client/README.md`）："`events` contains root-session events, while `notifications` also contains descendants discovered from `subagent.started`"。

**对照 ACP（确有剥离）**：`packages/acp/acp/src/index.ts:170-194` 注释：「Emit only committed assistant text/images. Raw chunks, reasoning, tools, plans, titles, and retry markers are presentation or trace data and stay off the automation wire.」—— ACP 才是剥 tool。

**INFERENCE**：TS SDK client 不剥 tool；与 Python SDK `Session.run()` 行为对等（`python/sdk/src/deepseek_harness/api.py:163-232` 同样收集全 session.event payload，仅按 `assistant/message` 提取 `final_response`，不做 type 过滤）。G2 决议"包 TS SDK client 作 AgentResponder"成立。

### Claim B — R3 偏好基于不完整 TS 画像：**VERIFIED**

重读 R3 笔记（`wayfinder/data-agent/research/r3-multiturn-eval-hook.md`）：

- R3 推荐路径（§3、§4）："**主**：基于 Python JSON-RPC SDK (`DeepSeekHarness`/`Session`) 搭建 eval harness"；"**备**：纯文本 eval 可走 ACP 桥"。R3 全文未出现 `packages/sdk/client`、`dsh-sdk-client`、`HarnessSession`（TS）等标识。
- R3 的 TS 选项**只**列 ACP（`packages/acp/acp/src/index.ts`），并明示 ACP 剥 tool（R3 §1.4b 表格 "全轨迹（tool/result/chunk）= 否"）。
- R3 §1.4a 把 Python SDK 当 TS 替代品的主路径；未意识到 `packages/sdk/client` 是 Python SDK 的 TS 孪生。

源码 `packages/sdk/README.md`：明文 "The [TypeScript SDK decision](.../2026-07-27-typescript-sdk-and-sdk-subagent-backend.md) **owns the client contract**" —— TS SDK 是规范客户端契约的 owner。

`packages/sdk/client/README.md`：明文 "the **design twin** of the [Python SDK] (`deepseek-harness`), sharing the same runtime peer, protocol, and layering" —— TS SDK 与 Python SDK 等价、对称。

**INFERENCE**：R3 的事实（ACP 剥 tool、Python SDK 暴露全轨迹）正确，但**漏看了 TS SDK 这个第三选项**。G2 推翻 R3 偏好**不与 R3 事实矛盾**，而是补全了 R3 的 TS 画像。推翻有据。

### Claim C — 判分 (ii) 真语言无关（无暗 Python 依赖）：**PARTIAL**

**已确认语言无关的部分**（`reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/match_modes.py`）：

- 5 个 match_mode 全是纯 dict/行比较，零外部依赖：
  - `scalar_exact`（`match_modes.py:30-44`）：取 `actual_rows[0]` 的第一个值与 `expected["value"]` `==` 比较。
  - `multi_scalar_exact`（`match_modes.py:46-77`）：第一行多列字典逐 key `==` 比较。
  - `row_count_range`（`match_modes.py:79-93`）：`lo <= len(actual_rows) <= hi`。
  - `set_equal`（`match_modes.py:95-112`）：`frozenset(sorted(r.items()))` 集合相等。
  - `ordered_subset`（`match_modes.py:114-135`）：有序子序列匹配。
- 这 5 个函数可 1:1 直译 TS（dict→Record<string,any>、frozenset→Set<string>）。

**被低估的取舍 1：(ii) 暗中丢弃了 rbi-eval L1 的 3 个 sqlglot-bound 断言**（`reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/l1.py`）：

- `field_coverage`（`l1.py:_check_field_coverage`）：用 `sqlglot.parse_one` 解析 SQL AST，提取 SELECT 列名比对。
- `limit_reasonable`（`l1.py:_check_limit_reasonable`）：AST 查 `exp.Group`/`exp.AggFunc`/`exp.Limit` 判断结果集是否有界。
- `partition_compliant`（`l1.py:_check_partition_compliant`）：AST 查 `exp.Where` + `exp.Column` + `exp.Table` + `exp.CTE`，按 SemanticContract 校验分区列。
- 加上 `normalize_sql`/`normalize_steps` 的 sqlglot.transpile auto-fix 路径（`l1.py:score_l1` 中段）。
- G2 决议"不用 sqlglot"= **明确舍弃这 3 个断言**。后果：da agent 若写出 "结果对但 SQL 卫生差"（如 `SELECT *`、缺 LIMIT、缺分区谓词）的取数，(ii) 会判 pass——rbi-eval 会判 partial/fail。这是**产品取舍**，不是"语言无关"问题。

**被低估的取舍 2：(ii) DELIVERY 是 rbi-eval 没有的维度**：

- rbi-eval 的"answer"是 SQL+result_value，**没有** "最终文本回答比对" 维度；其 L2（`scoring/judge.py:score_l2`）是 SQL 语义 4 维 rubric LLM-judge，L3（`scoring/judge.py:score_l3`）是 5 步 pipeline trace 验证 LLM-judge。
- (ii) DELIVERY 是 da-fresh：比 `finalResponse` 文本 vs 期望文本/表/数值。**朴素相等**语言无关 ✓。**但**：BI 类问题（"上周销量前 3 名"）agent 可能换措辞同义——朴素相等易判 fail。若需 fuzzy（如 rbi `_turn_matches_expectation` 的 token/bigram ≥0.35，`session.py:91-118`）也语言无关 ✓。若需 LLM-judge，则需 TS 侧 LLM 客户端——harness 有 `packages/llm/`（@deepseek-ai/dsh-llm 是 cordis 服务，runtime 内部用）；eval 进程侧若需独立 LLM-judge，**需另配** TS LLM 客户端（rbi 用注入式 `LLMProvider` protocol，`scoring/judge.py` 模块 docstring：'the LLM provider is **injected** by the caller'，TS 可对称注入）。

**INFERENCE**：(ii) 的 EXECUTION 部分（5 match_mode）确语言无关。DELIVERY 部分**若朴素相等/fuzzy** 也语言无关；**若 LLM-judge** 需 TS LLM 客户端，存在但需额外搭建。G2 决议文本未指明 DELIVERY 用哪种——这是**待补设计点**（HOLE C1）。无暗 Python 依赖。**VERIFIED 的语言无关性仅对 "朴素/fuzzy" 成立；对 "LLM-judge" 待补**。

### Claim D — rbi-eval 真实判分结构 + da (ii) 是否漏必要部分：**PARTIAL**

rbi-eval 的判分三层（非"3 级评分"那么简单，实际是 L1/L2/L3 三层 + 7+4+5 个判分点）：

**L1（确定性，7 断言，`scoring/l1.py:_ALL_ASSERTION_NAMES`）**：
1. `sql_executable`（执行成功否，依赖 `ExecutionResult`）
2. `result_non_empty`（`row_count > 0`）
3. `behavior_match`（`generated_behavior == case.expected.behavior`，BI 专属 4 值 `direct_answer/clarify/reject/degrade`）
4. `result_match`（调 `check_result_match` 5 match_mode）
5. `field_coverage`（**sqlglot AST**）
6. `limit_reasonable`（**sqlglot AST**）
7. `partition_compliant`（**sqlglot AST** + `SemanticContract`）
- 多步分支 `_score_l1_multi_step`（`l1.py`）：跳过 3 个 AST 断言，4 个断言决定 verdict。
- auto-fix 路径：`normalize_sql`（sqlglot.transpile）+ 重算 whitelist 断言。
- verdict 聚合：`_aggregate_verdict`（fail>partial>pass，基于 contributing 断言集）。

**L2（LLM-judge，4 维 rubric，`scoring/judge.py:score_l2`）**：
- 4 维度（`L2_RUBRIC["dimensions"]`，具体维度名在 `rbi_eval/rubrics/`，未读但 `judge.py:_build_l2` 校验数字 1-5 范围）
- `LLMProvider` 注入（`judge.py` 模块 docstring："the LLM provider is **injected** by the caller"）
- 重试预算 `JUDGE_MAX_RETRIES=2`（SPEC §5.5），指数退避 1s→2s→4s
- fast path：生成 SQL 字符等价 golden SQL + L1 pass → 跳过 judge 满分（`_fast_path_applies`）
- 错误分类 `classify_error`：`auth`/`retryable`/`unclassified`，auth 抛 `AuthenticationAbort` 终止整 run

**L3（LLM-judge，5 步验证，`scoring/judge.py:score_l3`）**：
- 5 步 `steps_completed`（具体步骤名在 `L3_RUBRIC`）
- `final_score` + `error_attribution` + `root_cause`
- 同 LLMProvider 注入、同重试预算

**da (ii) 对 rbi-eval 判分的取舍映射**：

| rbi-eval 断言 | da (ii) 是否保留 | 备注 |
|---|---|---|
| `sql_executable` | 取决于 da 是否生成 SQL | da 若用 ODPS 取数则保留 |
| `result_non_empty` | 保留（EXECUTION） | |
| `behavior_match` | **丢弃** | BI 专属 4 值不适用 da |
| `result_match`（5 match_mode） | **保留**（EXECUTION 核心） | 1:1 直译 TS |
| `field_coverage` | **丢弃** | sqlglot AST，G2 明确不用 |
| `limit_reasonable` | **丢弃** | sqlglot AST |
| `partition_compliant` | **丢弃** | sqlglot AST + SemanticContract |
| L2 4 维 SQL 语义 rubric | **丢弃** | G2 "不做 SQL-form 语义匹配" |
| L3 5 步 trace 验证 | **丢弃** | da 不强求 pipeline trace |
| auto-fix（normalize_sql） | **丢弃** | sqlglot.transpile |
| DELIVERY（最终文本比对） | **da-fresh 新增** | rbi-eval 无此维度 |

**关键问题：da (ii) 是否漏了 rbi 判分提供、而 da 真需要的部分？**

- **非 sqlglot 必要部分**：`sql_executable` + `result_non_empty` + `result_match` 全在 da (ii) 的 EXECUTION 中。✓ 不漏。
- **sqlglot-bound 部分**：field_coverage/limit_reasonable/partition_compliant 是 SQL 卫生检查。**da 若仍跑 ODPS SQL**，丢这些意味着 "结果对但 SQL 脏" 的 agent 会 pass。**这是产品取舍，非 bug**。但应在 G2 决议里明文标注为已知 trade-off（HOLE D1）。
- **L2/L3 LLM-judge**：da (ii) 明确不做 SQL 语义匹配。**若 DELIVERY 用 LLM-judge**，可复用 L2 的 `LLMProvider` 注入模式 + 重试/退避策略（TS 可对称实现）。**这是潜在复用点，G2 决议未提**（HOLE D2）。

**INFERENCE**：da (ii) 是 rbi-eval L1 的**严格子集 + DELIVERY 新增维度**，不漏 da 必要的非 sqlglot 能力。最强潜在驳倒点（"漏必要判分"）**不成立**。但 G2 决议应明示：(a) 丢 SQL 卫生断言是已知 trade-off；(b) 若 DELIVERY 需 LLM-judge，rbi-eval 的 `LLMProvider` 注入 + 重试/退避设计可作 TS 蓝图。

### Claim E — TS 重实现 rbi-eval 编排"不大"为 PARTIAL：**PARTIAL**

逐文件量测（注释占比高，"逻辑行" 指剔掉 docstring 后的代码）：

- `rbi_eval/multi_turn/session.py`（~360 行含 docstring，逻辑 ~180 行）：`MultiTurnSession` 状态机 + `next_input`/`submit_response`/`_handle_terminal`/`_handle_derailment` + `_turn_matches_expectation`（token/bigram ≥0.35，~30 行）。
- `rbi_eval/orchestration/multi_turn.py`（~470 行含 docstring，逻辑 ~230 行）：`AgentTurnRequest`/`AgentTurnReply`/`AgentResponder` 协议 + `MultiTurnAttempt`/`MultiTurnCaseResult`/`TurnSubmission` 模型 + `submit_turn`（SQL 执行 + 环境失败分类）+ `build_turn_score` + `drive_session`（loop）+ `pass_k_verdict` + `run_multi_turn_case`（pass_k=3 循环）。
- `rbi_eval/adapters/agent.py`（~110 行，逻辑 ~60 行）：`build_agent_responder` + `extract_reply`。
- `rbi_eval/scoring/l1.py`（~600 行含 docstring，逻辑 ~300 行）：7 断言 + 多步分支 + auto-fix。
- `rbi_eval/scoring/match_modes.py`（~140 行，逻辑 ~120 行）：5 模式。
- `rbi_eval/scoring/judge.py`（~470 行含 docstring，逻辑 ~250 行）：L2/L3 + 重试/退避 + classify_error。
- `rbi_eval/scoring/normalize.py`（未读）：sqlglot normalization。
- `rbi_eval/orchestration/run.py`（76KB，**~1500+ 行**）：batch/single-case sequencing、health aggregation、SQL executor with retry。

**da (ii) 真正需要重实现的部分**（剔掉 sqlglot-bound 断言、L2/L3 LLM-judge、auto-fix、多步分支、SemanticContract、health aggregation、batch sequencing）：

| 模块 | 逻辑行（Py） | TS 估算 | 备注 |
|---|---|---|---|
| MultiTurnSession 状态机 | ~180 | ~150 | TS 少 docstring |
| drive_session + run_multi_turn_case + pass_k_verdict + submit_turn + build_turn_score | ~230 | ~200 | pass_k loop + verdict 聚合 |
| AgentResponder adapter | ~60 | ~30 | TS SDK 已给 `RunResult.finalResponse`，`extract_reply` 退化为直接取字段 |
| match_modes（5 模式） | ~120 | ~120 | 1:1 直译 |
| L1 简化版（sql_executable + result_non_empty + behavior_match 丢弃 + result_match 调用） | ~80 | ~80 | behavior_match 丢弃 |
| DELIVERY 比对（朴素/fuzzy） | — | ~30-150 | 朴素相等 ~30；fuzzy ~80；LLM-judge ~150 |
| **小计** | — | **~610-730** | **最小 da (ii) eval 逻辑** |

**额外非"编排"但必需**：

| 模块 | TS 估算 |
|---|---|
| Case loader（zod schema + YAML/JSON parse） | ~150 |
| Pass_k 驱动 + run 管理 | ~150 |
| 持久化（run results 落盘） | ~200 |
| 报告/聚合（pass_at_k 统计、case-level summary） | ~200 |
| CLI/run 命令 | ~200 |
| **小计** | **~900** |

**总诚实估算**：最小 da (ii) eval（仅核心编排 + match_mode + 简化 L1 + 朴素 DELIVERY）= **~600-800 行 TS**；含 case loader、持久化、报告、CLI 的完整 eval = **~1500+ 行 TS**。

**INFERENCE**：G2 决议"~几百行 TS" 对**最小编排子集**（state machine + pass_k + adapter + match_modes）诚实；对**完整可运行 eval**偏乐观（实际接近 1500+）。但相比 Python 路径（直复用 rbi-eval ~3000 行）的"省得多"论据仍成立——TS 路径**省的是 sqlglot/L2/L3/auto-fix/SemanticContract 等 da 不需要的部分**，省 ~50% 代码量。**Claim E PARTIAL**： "~几百行" 字面不准确（完整 eval 更大），但"TS 重实现不大"的方向性判断成立。

### Claim F — EvalCase/case 跨兼容：**PARTIAL**

rbi-eval `EvalCase` v3 结构（`reverse-bi/libs/rbi-eval/src/rbi_eval/models/eval_case.py`）：

- `schema_version: Literal[3]`（`eval_case.py:EvalCase`）
- `case_id: str`
- `input: CaseInput`（`eval_case.py:CaseInput`）：
  - `question: str`
  - `scope_id: str` —— BI 专属（rbi 的数据域 ID）
  - `turns: list[Turn] | None`（`Turn.role: Literal["user","assistant"]`，`Turn.content: str`）—— **通用，da 可复用**
- `expected: CaseExpected`（`eval_case.py:CaseExpected`）：
  - `sql: str | None` —— BI 专属（da 若不生成 SQL 不需要）
  - `sql_steps: list[str] | None` —— BI 专属
  - `result_value: dict[str, Any] | None` —— **通用**（5 match_mode 的载荷）
  - `behavior: Behavior`（`Literal["direct_answer","clarify","reject","degrade"]`，`eval_case.py:Behavior`）—— **BI 专属**（da agent 无此离散行为）
  - `match_mode: MatchMode`（5 模式，`eval_case.py:MatchMode`）—— **通用**
- `dimensions: CaseDimensions`（`eval_case.py:CaseDimensions`）：
  - `sql_complexity: Literal["L1","L2","L3","L4"]` —— BI 专属
  - `interaction_complexity: Literal["I1"-"I4"]` —— BI 专属
  - `data_source: Literal["event","dws","cross_system","dim"]` —— BI 专属（rbi 数据源分类）
  - `domain: str` —— 通用
  - `time_complexity: Literal["single_day","range","comparison","realtime"]` —— BI 专属
  - `ambiguity_type: Literal["none","A"-"F"]` —— BI 专属
  - `semantic_coverage: Literal["covered","partial","uncovered"]` —— BI 专属
  - `query_intent: Literal["metric_lookup","trend","comparison","ranking","distribution","proportion","cohort"]` —— BI 专属
- `meta: CaseMeta`（`eval_case.py:CaseMeta`）：`roles`/`tier`/`provenance`/`anchor_ds`/`needs_repin`/`migrated_from` 等，多数 BI 专属。

**INFERENCE**：rbi EvalCase v3 的 `dimensions` + `meta.anchor_ds`/`needs_repin`/`migrated_from` + `expected.behavior`/`sql`/`sql_steps` + `input.scope_id` 全是 BI 专属，**不可直接 zod-mirror**。可复用的只有 `case_id` + `input.question` + `input.turns` + `expected.result_value` + `expected.match_mode`。

**P11 决策应 da-fresh schema，不套 P6 先例**：P6 zod-mirror 的是 SDK 协议（`packages/sdk/protocol`），是**通用 wire 契约**；EvalCase 是 **BI 评测 case 数据模型**，领域专属。两者性质不同，P6 先例不直接迁移。da 应自定 EvalCase schema，仅借 rbi 的 `result_value`+`match_mode`+`turns` 子结构作 DELIVERY/EXECUTION 比对载荷。**Claim F PARTIAL**：case 字段部分可复用，整体 schema 应 da-fresh。

### Claim G — 确定性（dsh-llm-replay 经 runtime cordis.yml 加载）：**VERIFIED**

源码 `packages/test-support/llm-replay/src/index.ts`：

- Cordis 插件 shape（`index.ts` 末尾）：`export const name = 'llm-replay'; export const inject = ['llm']` + `export function apply(ctx: Context, config: Config = {}): void { ... }`。
- `apply` 内部（`index.ts:apply`）：读 `process.env.DSH_SNAPSHOT_FILE`/`DSH_SNAPSHOT_OVERRIDE`/`DSH_SNAPSHOT_CHILD_FILES`，调 `installLlmReplay(ctx, {...})`，注册 `ctx.llm.registerAdapter(...)` 或 `ctx.on('llm/stream', ...)`。
- README（`packages/test-support/llm-replay/package.json` 描述，R3 §1.5 引用）：「Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests)」。

**加载路径**：`packages/sdk/client/src/api.ts` `DeepSeekHarness` 构造时传 `launch: { command, args }`（`api.ts:DeepSeekHarness` 构造器）—— caller 命名 runtime 可执行 + 其 `cordis.yml`。runtime 进程启动后由 Cordis context loader 读 `cordis.yml`、按 plugin name 加载 `dsh-llm-replay`、调其 `apply(ctx, config)`。

**INFERENCE**：TS eval 进程只需：(a) 准备 `cordis.yml` 列出 `llm-replay` 插件；(b) 设 `DSH_SNAPSHOT_FILE` env 指向录制 JSONL；(c) `launch: { command: 'node', args: ['lib/bin.js', 'cordis.yml'], env: { DSH_SNAPSHOT_FILE: '...', ... } }`。语言无关。**TS client 无需特殊处理即可做确定性 pass_k**。**Claim G VERIFIED**。

### Claim H — TS client 多轮 eval 微妙处：**PARTIAL**（HOLE 对称，不改变 G2）

**H1 — `finalResponse` "非因果归属该 prompt" 的跨轮错配风险**：

TS SDK README（`packages/sdk/client/README.md`）明文：
> `finalResponse` is the last committed root-session assistant text in that interval, **not a response causally assigned to the prompt**; steering, injected context, and other queued work may contribute before idle. ... The result carries no prompt-level status or turn reason.

TS SDK 源码 `api.ts:finalResponse(events)` 实现：从 events 末尾向前找**最后一个** `assistant/message`，拼接其 text 块。

**Python SDK 的对应实现**（`python/sdk/src/deepseek_harness/api.py:final_response`）：**逐行相同** —— `for event in reversed(events): if event.get("type") != "assistant/message": continue` 拼接 text 块。

**Python SDK 的 interval ownership**（`api.py:Session.run`）：`while True: notification = subscription.next(); ...; if session.status == "idle": break` —— 与 TS `api.ts:HarnessSession.run` 逐行等价。

**INFERENCE**：TS 与 Python 的 interval/finalResponse 语义**完全对称**。"非因果归属" 的 README 警告对 TS 和 Python **同样**适用。**非 TS 专属 HOLE**。

**rbi-eval 的 per-turn 归属如何不同**（`reverse-bi/libs/rbi-eval/src/rbi_eval/adapters/agent.py:build_agent_responder`）：
- 每次 `_respond(request)` 新建 `TurnContext()`（`agent.py:build_agent_responder` 内 `_respond`）。
- `pipeline.run(session_id=, message=, ctx=ctx, ...)` 同步执行，事件进 `ctx.event_buffer`。
- `extract_reply(ctx)` 仅拼**该 turn 的** TEXT 事件（`agent.py:extract_reply`）。
- 注释（`agent.py:build_agent_responder`）：「A fresh `TurnContext` per turn is deliberate: ... reusing one would make turn n's reply include everything turns 1..n-1 said. Conversation memory lives in the pipeline's own session state (keyed by `session_id`), not in the buffer.」

**对照**：rbi-eval 的 per-turn 归属**靠构造保证**（fresh buffer per turn + 同步 pipeline.run 返回）；TS/Python SDK 的 per-turn 归属**靠 interval ownership 保证**（receipt→idle 区间 + last assistant/message）。

**何时错配**：仅当 (a) runtime 有 steering/injected context、(b) 有并发 queued prompt、(c) agent 在 idle 前产生多条 `assistant/message`。**da eval 模式（脚本化多轮、单 prompt 一次、无 steering）三者均不满足**，interval == 该 turn 响应。

**结论 H1**：VERIFIED（README 警告属实），但**对称 HOLE**（TS 与 Python 同样有），且对 da eval 模式不咬。**不改变 G2 推荐**。但应在 TS eval 实现中**显式断言** "events 区间内只含 1 个 assistant/message"（HOLE H1）以防隐蔽错配。

**H2 — 无 mid-turn cancel / 无 per-prompt result**：

TS SDK README 明文：「**No mid-turn cancel** — the wire has no prompt-cancel method; abandoning a turn means closing the runtime」「**No per-prompt result or cancel** — low-level `prompt()` returns only an enqueue receipt; high-level `run()` owns receipt-to-idle collection, and abandoning it means closing the runtime.」

**Python SDK 同样**：协议层无 cancel 方法（`packages/sdk/protocol/lib/types/types.d.ts:HarnessSdkRequestMap` 仅 `initialize`/`session/prompt`/`shutdown`，无 `cancel`）。Python `Session.run` 同样靠 `session.status=idle` 终止循环。

**rbi-eval 同样无 wall-clock 超时**：`drive_session`（`multi_turn.py:drive_session`）只有 `_MAX_TURNS_PER_ATTEMPT = 64` 计数 guard，无 wall-clock。SQL 执行侧有 `patience` 标记（`l1.py:_PATIENCE_MARKERS`）但那是 SQL executor 的，不是 agent 驱动的。

**结论 H2**：VERIFIED（TS 无 mid-turn cancel 属实），但**对称 HOLE**（Python 同样，rbi-eval 同样）。对 da eval：失控 turn 会挂死 pass_k 循环 → 整 runtime 关闭 → 后续 attempt 无法跑。**这是真 HOLE**（HOLE H2，严重度中），但**对称**——不改变 TS vs Python 的选择。TS eval 须在 eval 层加 wall-clock（`Promise.race([harness.run(...), timeout])`），Python 同样须加（`signal.alarm` 或 `threading.Timer`）。

### Claim I — python/ 永久性前提：**REFUTED**

**搜全仓 `pandas|numpy|sklearn|torch|duckdb|polars` → 零命中**（多次 grep 跨 `/Users/mckenzie/workspace/deepseek-harness-da` 全域）。

**`packages/code-runtime/code-runtime/README.md` 明文**：
> `language` | Readonly descriptor: the source language `run` expects. `'typescript'` and `'python'` are the well-known values — those `dsh-tools` presents; **only `'typescript'` has a published backend**.

**`packages/code-runtime/code-runtime-worker-thread/README.md` 明文**：
> Worker-thread implementation of the `@deepseek-ai/dsh-code-runtime` seam: `WorkerThreadCodeRuntime` runs each program in ONE fresh Node `worker_threads.Worker` — **TypeScript in, type-stripped host-side**

**`packages/code-runtime/code-runtime/README.md` Known Limitations**：
> **Only the worker-thread backend ships** — `'process'`/`'container'` are declared well-known `isolation` values with no implementation

**python/ 目录结构**（`glob python/**/*.py`）：
- `python/sdk/src/deepseek_harness/`：`api.py`/`client.py`/`models.py`/`errors.py`/`__init__.py` —— **JSON-RPC 客户端**（驱动 runtime 子进程的 SDK），**非 Python 代码执行 runtime**。
- `python/sdk-runtime/src/deepseek_harness_runtime/__init__.py`：runtime 启动入口（但实际 runtime 是 TS cordis 进程，python/sdk-runtime 只是包装层）。
- 无 `pandas`/`numpy` import。

**INFERENCE**：
1. harness 当前的 code-runtime **唯一发布 backend 是 TS worker_thread**，运行 TS 程序。`'python'` 仅为 well-known 语言标签，**无 backend 实现**。
2. 全仓零 `pandas`/`numpy`/`sklearn`/`torch` 等数据科学栈 import。
3. python/ 仅是 SDK 客户端（驱动 TS runtime），**不是** Python 代码执行的永久 runtime 依赖。
4. 用户"pandas/numpy/ML 包是后续核心功能依赖"是**前瞻性断言**，源码无任何 roadmap 笔记或 TODO 支持。当前事实**反向**：harness 设计上把 code-runtime 留作多语言可插拔 seam（`'typescript'` + `'python'` 都是 well-known 值），但只发布了 TS backend。

**结论 I**：**REFUTED**。"python/ 是永久 runtime 依赖" 前提**源码不支持**。当前事实是：
- **TS 是规范 runtime**（code-runtime backend、cordis 进程、所有 packages/*.ts）。
- **python/ 是可选客户端**（与 TS SDK client `packages/sdk/client` 平级，"design twin"，`packages/sdk/client/README.md`）。
- da harness 当前**不依赖** pandas/numpy/ML 包；未来若需要，code-runtime 的 `'python'` 标签已预留，但需先发布 Python backend（非现成）。

**对 G2 的影响**：用户用 "python/ 永久依赖" 强化 Q10=(i)（不裁 python/）的论据**站不住**。但 Q10=(i) 本身仍可成立——理由应改为："python/ 是 TS runtime 的可选客户端孪生（与 `packages/sdk/client` 对等），与 eval 语言选择无关；裁它无依据，留它无成本"。**Q10 决议不变，论据修正**。

---

## HOLEs surfaced

### HOLE H1 — `finalResponse` 跨 interval 错配（严重度低，对称）
- **是什么**：TS SDK `RunResult.finalResponse` 取区间内**最后**一个 `assistant/message`，若 runtime 有 steering/queued work/injected context，可能混入非该 prompt 的响应。
- **是否改变 G2**：**否**。Python SDK 同样语义（`api.py:final_response` 逐行相同），rbi-eval 用 Python SDK 也会遇到。da eval 模式（脚本化、单 prompt 一次、无 steering）不触发。
- **缓解**：TS eval 实现时显式断言 "events 区间内 assistant/message 计数 == 1"，否则报 protocol error。

### HOLE H2 — 无 mid-turn cancel / 无 wall-clock 超时（严重度中，对称）
- **是什么**：TS SDK 无 prompt-cancel wire 方法，失控 turn = 关闭整个 runtime。pass_k 循环第 N attempt 挂死 → 整个 case 失败 + runtime 重启。
- **是否改变 G2**：**否**。Python SDK 协议同 wire，同样无 cancel。rbi-eval 自身也无 wall-clock（只有 `_MAX_TURNS_PER_ATTEMPT=64` 计数 guard）。
- **缓解**：TS eval 在 `harness.run()` 外包 `Promise.race([..., timeout])`；timeout 触发 → `harness.close()` + 重新 spawn runtime + 标记该 attempt error。

### HOLE C1 — DELIVERY 比对策略未定（严重度中，G2 内部）
- **是什么**：G2 决议文本"DELIVERY（最终答案比对）"未指明朴素相等/fuzzy/LLM-judge。朴素相等易判 fail（同义不同措辞）；LLM-judge 需 TS 侧 LLM 客户端。
- **是否改变 G2**：**否**，但**需补设计点**。EXECUTION 已确定（5 match_mode，TS 直译）；DELIVERY 应明示策略。
- **建议**：分层——数值类问题用 `scalar_exact`/`multi_scalar_exact`（EXECUTION 已覆盖，DELIVERY 可空）；文本类问题用 token/bigram fuzzy（仿 rbi `_turn_matches_expectation` ≥0.35，`session.py:91-118`，TS 可直译）；复杂语义类用 LLM-judge（仿 rbi `LLMProvider` 注入 + `JUDGE_MAX_RETRIES=2` + 指数退避，`scoring/judge.py`）。

### HOLE D1 — 丢 SQL 卫生断言的已知 trade-off 未明示（严重度低，G2 内部）
- **是什么**：G2 "不用 sqlglot" = 丢 field_coverage/limit_reasonable/partition_compliant。da 若仍跑 ODPS SQL，"结果对但 SQL 脏"（缺 LIMIT/分区谓词/列覆盖）的 agent 会 pass。
- **是否改变 G2**：**否**，是产品取舍。但应在决议里明文标注为已知 trade-off，避免日后被当 bug。
- **建议**：若 SQL 卫生对 da 重要，可只移植 `partition_compliant` 的**非 sqlglot 版**（正则/字符串匹配 WHERE 子句的分区列名，仿 rbi `_MINIMAL_PARTITION_COLUMNS` fallback 路径 `l1.py:_check_partition_compliant` 的无 contract 分支）。

### HOLE D2 — LLM-judge 复用蓝图未提（严重度低，G2 内部）
- **是什么**：若 DELIVERY 用 LLM-judge，rbi-eval `scoring/judge.py` 的 `LLMProvider` 注入 + 重试/退避 + `classify_error` + `AuthenticationAbort` 是现成 TS 蓝图，G2 决议未提及。
- **是否改变 G2**：**否**，是补充而非驳倒。
- **建议**：P11 实现时若需 LLM-judge，直接 mirror `scoring/judge.py` 的注入 + 重试模式（~250 行 TS）。

### HOLE F1 — P11 不应套 P6 zod-mirror 先例（严重度中，影响 P11）
- **是什么**：G2 隐含 "P11 zod-mirror rbi EvalCase" 假设（P6 先例）。但 P6 镜像的是 SDK 协议（通用 wire 契约），EvalCase 是 BI 专属数据模型，领域不同。
- **是否改变 G2**：**否**（G2 主体是 eval 语言选择），但**影响 P11 case schema 设计**。
- **建议**：P11 应 da-fresh EvalCase schema，仅借 rbi 的 `result_value`+`match_mode`+`turns` 子结构。dimensions/meta/behavior/sql/sql_steps/scope_id 等 BI 专属字段不镜像。

### HOLE I1 — "python/ 永久依赖" 论据不成立（严重度低，影响 Q10 论据）
- **是什么**：用户用 "pandas/numpy/ML 是后续核心功能依赖" 强化 Q10=(i)（不裁 python/）。源码不支持——全仓零数据科学栈 import，code-runtime 仅 TS backend。
- **是否改变 G2**：**否**。Q10=(i) 不裁 python/ 的决议本身不受影响，但**论据应修正**为"python/ 是 TS runtime 的可选客户端孪生，与 eval 语言无关"。
- **建议**：Q10 决议文本修正论据，避免日后被"前瞻性断言无据"反推 Q10。

---

## Impact on G2 resolution

**G2 决议（TS eval + 判分 (ii) + 不用 sqlglot + python/ 不变）经得住审查。**

- **无 claim 被 REFUTED**（A/B/G VERIFIED；C/D/E/F/H PARTIAL；I REFUTED 但 I 的 REFUTE 反向强化 Q10=(i) 不裁 python/ 的最终结论——只是论据修正）。
- **对称 HOLE（H1/H2）不改变 TS vs Python 选择**：TS 和 Python 在 interval ownership、finalResponse 语义、无 mid-turn cancel 三者**逐行对称**。R3 推荐 Python 也会有同样的 H1/H2。G2 选 TS 不引入新 HOLE。
- **G2 内部待补设计点（C1/D1/D2/F1）不迫使改动 G2 主体**：C1（DELIVERY 策略）需明示；D1（SQL 卫生 trade-off）需标注；D2（LLM-judge 蓝图）可后补；F1（P11 case schema）影响下游 P11 但不改 G2。
- **I1 修正 Q10 论据但不改 Q10 决议**：Q10=(i) 不裁 python/ 仍成立（python/ 是 TS runtime 的可选客户端孪生，与 eval 语言无关），但 "永久依赖 pandas/numpy" 的论据应弃用。

**G2 推荐不改。** 建议补四件事：
1. G2 决议文本明示 DELIVERY 比对策略（朴素/fuzzy/LLM-judge 分层）。
2. G2 决议文本标注 "丢 SQL 卫生断言" 为已知 trade-off。
3. P11 用 da-fresh EvalCase schema，不套 P6 zod-mirror 先例。
4. Q10 论据修正：python/ 是可选客户端孪生，非"永久 pandas/numpy 依赖"。

---

## 关键文件索引

### harness TS SDK（Claim A/B/G/H）
- `packages/sdk/client/README.md` —— TS SDK 设计说明；明示 interval ownership、finalResponse 警告、No mid-turn cancel
- `packages/sdk/client/src/api.ts:HarnessSession.run` —— `events: SessionEvent[]` 不过滤 type，仅校验 `assistant/message`
- `packages/sdk/client/src/api.ts:finalResponse` —— 取最后 `assistant/message` 文本拼接
- `packages/sdk/client/src/types.ts:RunResult` —— `events` 注释 "Every session.event payload for the root session"
- `packages/sdk/README.md` —— "The TypeScript SDK decision ... owns the client contract"
- `packages/sdk/protocol/lib/types/types.d.ts:HarnessSdkRequestMap` —— 协议层请求仅 initialize/session/prompt/shutdown，无 cancel
- `python/sdk/src/deepseek_harness/api.py:Session.run` —— Python SDK interval ownership，与 TS 逐行等价
- `python/sdk/src/deepseek_harness/api.py:final_response` —— Python 取最后 assistant/message，与 TS 同
- `packages/test-support/llm-replay/src/index.ts` —— Cordis 插件 shape（name/inject/apply），经 runtime cordis.yml 加载
- `packages/acp/acp/src/index.ts:170-194` —— ACP 才剥 tool（"tools ... stay off the automation wire"）

### harness code-runtime（Claim I）
- `packages/code-runtime/code-runtime/README.md` —— "only `'typescript'` has a published backend"
- `packages/code-runtime/code-runtime-worker-thread/README.md` —— `WorkerThreadCodeRuntime` Node worker_thread，TS-only
- 全仓 grep `pandas|numpy|sklearn|torch|duckdb|polars` → 零命中

### rbi-eval 判分结构（Claim C/D/E/F）
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/l1.py:_ALL_ASSERTION_NAMES` —— 7 断言名（3 sqlglot-bound）
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/l1.py:_check_field_coverage` / `_check_limit_reasonable` / `_check_partition_compliant` —— sqlglot AST 依赖
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/l1.py:score_l1` —— auto-fix 路径（normalize_sql 用 sqlglot.transpile）
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/match_modes.py:check_result_match` —— 5 match_mode 纯 dict/行比较，TS 可 1:1 直译
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/judge.py:score_l2` —— L2 LLM-judge 4 维 rubric + 注入式 LLMProvider + JUDGE_MAX_RETRIES=2 + 指数退避
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/judge.py:score_l3` —— L3 LLM-judge 5 步验证
- `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/judge.py:classify_error` —— auth/retryable/unclassified 三分
- `reverse-bi/libs/rbi-eval/src/rbi_eval/multi_turn/session.py:MultiTurnSession` —— 状态机（~360 行）
- `reverse-bi/libs/rbi-eval/src/rbi_eval/multi_turn/session.py:_turn_matches_expectation` —— token/bigram ≥0.35 fuzzy 比对
- `reverse-bi/libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:drive_session` —— 多轮驱动 loop
- `reverse-bi/libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:run_multi_turn_case` —— pass_k=3 循环
- `reverse-bi/libs/rbi-eval/src/rbi_eval/orchestration/multi_turn.py:pass_k_verdict` —— 取首个非 pass attempt verdict
- `reverse-bi/libs/rbi-eval/src/rbi_eval/adapters/agent.py:build_agent_responder` —— 注入式 AgentResponder，per-turn TurnContext
- `reverse-bi/libs/rbi-eval/src/rbi_eval/adapters/agent.py:extract_reply` —— 拼 TEXT 事件作 reply
- `reverse-bi/libs/rbi-eval/src/rbi_eval/models/eval_case.py:EvalCase` —— v3 schema，含 BI 专属 dimensions/meta/behavior
- `reverse-bi/libs/rbi-eval/src/rbi_eval/models/eval_case.py:Behavior` —— `direct_answer/clarify/reject/degrade` BI 专属
- `reverse-bi/libs/rbi-eval/src/rbi_eval/models/eval_case.py:CaseDimensions` —— sql_complexity/query_intent 等 BI 专属

### R3 模板（Claim B）
- `wayfinder/data-agent/research/r3-multiturn-eval-hook.md` —— R3 推荐 Python SDK 主路径 + ACP 备路径，未提 `packages/sdk/client`
