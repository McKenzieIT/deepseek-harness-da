# P13 NL→SQL 引擎（极简 (B) 路径）— PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** 非 shipped 包、非生产代码。validated 形态将重新实现为真实
> `packages/nl2sql-engine/`（TS、Schemastery、真实 Cordis ctx seam）+ conventions 提到
> `packages/query/query-maxcompute/conventions.yaml`（P4 seam）+ critic 生产接线 fold 进 P7b
>（`packages/phase-gate/` + `agent.cordis.yml` + 解注释 bundle phase-gate 行）—— 那是生产步骤
>（**P13b** + **P7b**），非本原型。本目录是 wayfinder ticket **P13** 的 primary-source artifact；勿 promote。
> 见 `../../tickets/phase-3/P13-nl2sql-engine.md`。

## The question it answers

在 P6 语义层 substrate 之上，ship 一个**极简 NL→SQL 引擎**（research 推荐 (B) 路径，完整 (C) 已判单期不可行），
让 data-agent 具备 per-game「问句→数据」能力。**主动 drop** plan_query（LATENT）/ sqlglot AST critic
（无 TS 等价、RBI 用 hive 代理）/ UnifiedQueryIndex answer-RAG（新域空语料）/ cross-encoder reranker。
research〔`../../research/p6-nl2sql-feasibility.md` §4.4 最小组件清单 + §1 RBI 一手源 + §3 BIRD/Spider SOTA + 语义层杠杆〕
+ sqlglot critic 替代方案〔`../../research/p13-sql-critic-alternatives.md` 六方案+对比表+推荐架构〕。

## Locked decisions（见 ticket P13 + grilling 6 决策全采纳推荐）

- **Q1 eval gate**：自带最小版 + 对齐 P11/G2（G2 resolved 2026-08-20：eval=TS+da-fresh EvalCase+
  EXECUTION 判分+dsh-llm-replay）。da-fresh EvalCase schema（仅借 result_value+match_mode+turns，
  rbi BI 专属不复用）+ EXECUTION 5 match_mode 判分跑 ctx.query.execute 比 stand-in ODPS 结果集（不用 sqlglot）+
  dsh-llm-replay 确定性 + 轻量 runner 直接调引擎 generate 不经真 harness session。诚实门值 < RBI 73.8% 上界
  （(B) drop 了 sqlglot+bge-m3+cross-encoder）。不阻塞 P11；cases 将来被 P11 无缝消费。
- **Q2 embeddings**：首期纯 BM25-only·不阻塞 T2（AGA 不提供向量模型，已确认）；向量侧升级=用户自部署
  向量模型经 P5 外置 OpenAI 兼容 embedder 插件（`InfinityEmbedder`），P13 引擎逻辑不变（seam swap）。
- **Q3 sqlglot critic**：方案 1（薄 regex 守卫：ds 分区必带/SELECT \* 告警/表名∈候选）+ 方案 4（轻量 JSON path
  解析：GET_JSON_OBJECT $.a.b.c 取叶子段∈event_params，~30 行纯 TS，对齐 sql_critic.py:481 last-key）合体 +
  执行反馈兜底（QueryOutcome.failed→LLM 读 error 重写→近重复门防重发）；node-sql-parser 不引（留 P14+ 接口）。
  挂 agent/turn-stopping 填 P7 sql_syntax_gate 槽，返 GateResult(passed,reason) 对齐 phases.py:33，判罚
  error/warning/fail-open，F2 同源。critic 守卫数据从 P6 substrate（params_fields/partitions）+ 检索结果拿，
  不从 conventions。sqlglot_dialect drop。
- **Q3 conventions**：薄 conventions（key_differences/functions/cast_map/sql_templates）归 query 包
  （P4/Q5 既定 per-engine conventions.yaml，忠实 RBI rbi-query 包内多消费者）；nl2sql-engine 从 query conventions
  seam 拿 prompt 方言 grounding；query 自己消费 guard/cost/方言部分（limits/guards.yaml）留 P4b 生产。
- **Q4 fidelity**：LLM=dsh-llm-replay（确定性、无 key 可复现）+ ODPS=stand-in（模拟 3-state+错误形态 parse_failed/
  TABLE_NOT_FOUND/SEMANTIC_MISMATCH，仿 P4b stand-in sidecar，真 pyodps 延后→真 ODPS 不可得）；引擎逻辑全真；
  scenarios 确定性全绿、无外部依赖。
- **Q5 near-dup gate**：P13 自带薄版（同 SQL 哈希拒重试，引擎内 self-correction loop）；真 tool-query consumer
  near-dup gate（会话级跨 turn）留 Not-yet-specified 生产项（P4 决策会话门留 tool-query）。
- **Q6 生产毕业**：prototype（本目录 .mjs harness-stub，镜像 p4/p6/p7/p8）+ 生产 P13b（`packages/nl2sql-engine/`
  TS + bundle 接线 + conventions 提到 `packages/query/query-maxcompute/` + critic 生产接线）；P13 critic 生产
  preset 接线 fold 进 P7b（P7b blocked by P13）。

## drop

plan_query（LATENT，不在任何 phase allowlist，research §1.2）/ sqlglot AST critic（无 TS 等价）/
UnifiedQueryIndex answer-RAG（新域空语料）/ cross-encoder reranker / sqlglot_dialect。

## Run

```
cd wayfinder/data-agent/prototypes/p13-nl2sql-engine
node run.mjs --demo     # 自动跑 9 场景，每步打印状态
node run.mjs            # 交互菜单
```
无依赖（纯 node .mjs，无 build，无 node_modules）。

## Validated（六组件 + eval gate + honest decline + sql_syntax_gate 槽，9 场景全绿）

- **S1 BM25 linking 召回**：'充值' 匹配 dws_pay_order_di（per-field 权重 name×3 + CJK bigram + 单字）→ top-1。
- **S2 prompt 组装**：§3 staged SOP + §6 八规则 + §5 诚实拒答 + 工具目录 + MAX_SQL_PER_TURN + 方言 grounding
  （conventions seam）+ P7 四阶段适配（phase=generation）全段齐。
- **S3 critic gate 拦截**：ds 缺/SELECT \*→warning pass；表名∉候选/GET_JSON_OBJECT 字段∉params→error fail；
  无 SQL→fail-open pass；字段∈params→pass（判罚与 RBI sql_critic/sql_evaluator 同向）。
- **S4 critic JSON path 解析**：$.user.profile.level 取叶子段 'level' 校验∈event_params（嵌套路径覆盖）。
- **S5 feedback self-correction**：parse_failed→LLM 读 error 重写→done（对齐 BIRD-FIXER/Genie Inspect）；
  TABLE_NOT_FOUND→不可修复→honest decline（不消耗重试，§3 阶段D）。
- **S6 近重复门**：相同失败 SQL 第二次被同哈希拒重试→自修耗尽→honest decline。
- **S7 eval gate L1 pass-rate**：da-fresh EvalCase + EXECUTION 5 match_mode 判分 + dsh-llm-replay + 轻量 runner
  不经真 harness session；pass-rate 全 pass（scripted；诚实门值 < RBI 73.8% 上界）。
- **S8 honest decline**：BM25 召回空候选（语义层无定义）→LLM 编造表名∉候选→critic error fail→自修耗尽→honest decline（§5）。
- **S9 sql_syntax_gate 槽 + F2 同源**：critic 返 GateResult 对齐 phases.py:33 挂 agent/turn-stopping；F2 同源
  （critic 检查的 SQL = exec ctx.query.execute 收到的 SQL，extractSqlCandidate 单源，无 tools/post-execute 改写）。

## Surfaced findings（P13b 生产硬化须解，p4b/p7b 先例）

- **F1 conventions 生产化**：本 prototype conventions 作 .mjs export 对象（无 js-yaml 依赖）；生产化提到
  `packages/query/query-maxcompute/conventions.yaml` + load_conventions loader（复刻 RBI conventions.py:32），
  归 query 包（P4 seam），nl2sql-engine + query 多消费者。
- **F2 critic 生产接线**：本 prototype critic 返 GateResult 适配 P7 sql_syntax_gate 槽；生产化 critic 真 hook
  P7 `agent/turn-stopping`（生产 phase-gate 插件），fold 进 P7b（P7b blocked by P13）。
- **F3 向量侧 swap**：本 prototype BM25-only（向量侧禁用/FakeHash 占位不参与排序）；T2/用户自部署 embedder
  就绪后 swap P5 ctx.retrieval 真 embedder（seam 契约不变），不改 P13 引擎逻辑。
- **F4 tool-query near-dup gate**：本 prototype 近重复门引擎内薄版；真 tool-query consumer near-dup gate
  （会话级跨 turn）留 Not-yet-specified 生产项（P4 决策会话门留 tool-query）。
- **F5 残余风险（执行反馈兜底）**：动态拼接 GET_JSON_OBJECT 路径漏判（静态不可解，吃首次 ODPS 配额）/
  静默 NULL SQL（params 集合内错字段，ODPS 不报错→self-correction 不触发，留 Tier1/2 answer RAG 演进余地）/
  regex 子句边界弱（CTE/子查询 SELECT \* 误命中→fail-open）/ self-correction 上限耗尽→honest_decline
  （max_executions_per_turn=8 + max_llm_calls_per_turn=60，phases.py:124,131）。
- **F6 eval 生产化**：本 prototype eval 是 P11 早期切片（da-fresh EvalCase+EXECUTION 判分+dsh-llm-replay+
  轻量 runner）；P11 就绪后消费这批 cases + runner 升级到真 MultiTurnSession（经真 harness session）。

## Assumptions (react to these)

1. **`.mjs`, not TS.** Throwaway；无 build。真实实现是 TS（Schemastery + 真实 Cordis ctx.on/ctx.tools.guard/
   ctx.systemPrompt/ctx.agents）—— P13b 生产。
2. **P6 substrate 用 fixture 模拟.** critic 守卫数据（params_fields/partitions）用 fixture 对象模拟 P6
   EventDefinition/TableDefinition 输出（完整 zod schema见 ../p6-semantic-layer/types.mjs，P6 已自验）。
   生产化 P13 真 import P6 packages/semantic-layer/ 的 zod schema。
3. **P5 ctx.retrieval seam 用 stub.** RetrievalSeamStub 实现 BM25-only（P5 seam 契约 retrieve(query,
   {topK, mode:'bm25-only'})）；P5 prototype throwaway 非真接线，P13 用 seam 契约即可（map P5 决策）。
4. **LLM=dsh-llm-replay stub.** 确定性 scripted（按 question+attempt 返预设 SQL）；生产用
   @deepseek-ai/dsh-llm-replay 经 runtime cordis.yml（G2 审查 G：语言无关）。
5. **ODPS=stand-in.** StandInOdps 模拟 3-state+错误形态（scripted 按 SQL 子串）；P4b 真 query-maxcompute
   sidecar + 真 pyodps 延后→真 ODPS 执行实际不可得（prototype 阶段）。
6. **conventions 作 .mjs export.** 无 js-yaml 依赖（p7 先例"纯 node .mjs 无 node_modules"）；生产化 .yaml + loader。
7. **GateResult 对齐 P7.** critic 返 GateResult(passed,reason)（../p7-four-phase-preset/types.mjs，phases.py:33），
   适配 P7 sql_syntax_gate 槽；P7b 生产接线时真 hook。

## Files

- `types.mjs` — 配置（MAX_SQL_PER_TURN=8/MAX_FEEDBACK_RETRIES=2/PARTITION_COLUMNS）+ GateResult（对齐 P7 phases.py:33）+
  CriticFinding + QueryOutcome 3-state（对齐 P4 types.ts:38-41）+ FailureKind + MatchMode（da-fresh 5 种）+ makeCriticCtx。
- `conventions.mjs` — 薄 maxcompute conventions（P4 seam 早期切片，复刻 RBI conventions.yaml key_differences/
  functions/cast_map/sql_templates）+ loadConventions + renderConventionsPrompt。
- `bm25-linking.mjs` — BM25 schema-linking（rank-bm25 BM25Okapi 直译 + 极简 CJK tokenizer + per-field 权重 +
  RetrievalSeamStub 消费 P5 ctx.retrieval seam 契约）。
- `prompt.mjs` — SQL 生成 prompt（移植 RBI v2-baseline.md §3 staged SOP + §6 八规则 + §5 诚实拒答 + 工具目录 +
  MAX_SQL_PER_TURN + P7 四阶段适配 + 方言 grounding 从 conventions）。
- `critic.mjs` — 方案 1（薄 regex 守卫：ds 分区必带/SELECT \* 告警/表名∈候选）+ 方案 4（轻量 JSON path
  解析：GET_JSON_OBJECT $.a.b.c 取叶子段∈event_params）+ 判罚 error/warning/fail-open + sqlSyntaxGate 适配 P7 槽。
- `stand-in-odps.mjs` — stand-in ODPS（模拟 3-state QueryOutcome + 错误形态）+ outcome helper。
- `replay-llm.mjs` — dsh-llm-replay stub（确定性 scripted LLM）。
- `engine.mjs` — NL→SQL 主循环（BM25 linking→prompt→LLM→critic gate→execute→feedback self-correction→
  近重复门→honest decline）+ NearDupGate 薄版。
- `eval/cases.mjs` — da-fresh EvalCase ~9 条 + fixture dataSources/eventDef。
- `eval/scorer.mjs` — EXECUTION 判分 5 match_mode（scalar_exact/value_close/set_exact/set_subset/null_check）。
- `eval/runner.mjs` — 轻量 runner（直接调 engine.run + 算 L1 pass-rate，不经真 harness session）。
- `run.mjs` — demo driver（9 scenarios `--demo` + 交互菜单）。
- `../../research/p13-sql-critic-alternatives.md` — sqlglot critic 替代方案 cited 笔记（六方案+对比表+推荐架构）。
- `../../research/p6-nl2sql-feasibility.md` — (A)/(B)/(C) 三选项判定 + §4.4 最小组件清单 + RBI 一手源 cite。
