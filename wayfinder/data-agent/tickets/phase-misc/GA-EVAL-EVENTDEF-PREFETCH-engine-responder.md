# GA-EVAL-EVENTDEF-PREFETCH — port G-DA4 event_view grounding to engine responder

**Type**: task  ·  **Phase**: misc  ·  **Status**: resolved (2026-09-06)  ·  **Branch**: `task/ga-eval-eventdef-prefetch`
**Source**: [GA-EVAL-SQLGEN-FOLLOWUP](GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) Resolution（2026-09-06，per-case 确认 real-exec 瓶颈=event-case SQL-correctness：模型不知 event 表名 → placeholder/错表/null-SQL）
**Blocked by**: 无（FOLLOWUP 已 resolved）
**Blocks**: 无（与 [GA-EVAL-RETRY-FEEDBACK](GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) 互补——(a) 给 event schema，(d) 让 retry 一致；二者可并行）

---

## Question

engine responder（`packages/eval/eval-cli/src/context.ts` `Nl2sqlAgentResponder.respond()`）调 `engine.run({ question, scopeId, today })` **不传 `eventDef`** → prompt `# 事件定义（若已加载）` 渲染「未加载」→ event case（119-138）模型缺 event schema → 三态失败：(1) placeholder SQL（`FROM <数据视图> WHERE event='<事件名>'` → ParseError）；(2) null-SQL（decline→retry exhaust——被 [GA-EVAL-RETRY-FEEDBACK](GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) 的 feedback gap 放大）；(3) 错表 fallback（DWS summary table → wrong value，judge sj=1.0 放过）。这是 real-exec 0-gained 的主因。

**修**：engine responder pre-fetch eventDef + eventView（复用 [G-DA4](G-DA4-event-table-name-grounding.md) 已建 infra——`SemanticLayerService.loadEventDefinition(name)` + `extractEventView(semanticRoot)` 返 `EventViewInfo`{`full_name`=`ieu_ods.ods_10000251_all_view`, `params_extract_template`, `base_columns`}；G-DA4 已为 **harness path** 落地，本票 port 进 **eval path**），pass 给 `engine.run({...,eventDef})`，prompt `# 事件定义` 显式 surface `event_view.full_name` + `params_extract_template` 让模型写 `FROM ieu_ods.ods_10000251_all_view WHERE event='...'` + `GET_JSON_OBJECT(params, '$.<field>')`。

## 背景（why，from GA-EVAL-SQLGEN-FOLLOWUP 2026-09-06 per-case）

- event case 119 att1/att2 = `SELECT ... FROM <数据视图> WHERE event='<事件名>'`（ParseError，em=false）；119 att3 = `SELECT COUNT(DISTINCT user_id) FROM dws_10000251_univ_role_act_di ... act_fst=1` → 552 vs exp 510（错值，sj=1.0 judge 放过）；125/127/129/130 = 全 null-SQL（decline→retry exhaust）；126 att3 = placeholder；136 att3 = `SELECT COUNT(DISTINCT order_id) FROM dws_10000251_pay_order_act_di ... pay_type='2'` → 482 vs 432（错值，sj=1.0）。
- [G-DA4](G-DA4-event-table-name-grounding.md)（resolved 2026-08-25, commit `0548fe4f8a`）已为 **harness responder**（phase-gate path，经 `load_event_definition` tool + `captureToolData`→`candidate_tables`）surface eventView——但 **engine responder**（eval path，`Nl2sqlEngine`+`buildPrompt` contextPrefetched）从未 wire。本票=补这条 path（不重复 G-DA4——port 同 infra 进不同 path）。
- infra 存在且 exported（纯函数，testable w/o Cordis context）：`packages/data/semantic-layer/src/snapshot.ts:97` `loadEventDefinition(name): EventDefinition | null`；`packages/data/tool-load-event-definition/src/index.ts` `extractEventView(semanticRoot): EventViewInfo | undefined` + `loadEventDefinitionResult(schema, eventName): LoadEventResult`（含 event + event_view）。
- engine 已支持 eventDef：`engine.run({question, eventDef, ...})`（`EngineRunArgs.eventDef?: EventDefinitionLite`），prompt `# 事件定义` JSON-renders eventDef（contextPrefetched branch 渲染 `（未加载）` when absent）。`EventDefinitionLite` = `{params_fields?, partitions?, [k]: unknown}`（loose index——可塞 eventView full_name/template）。

## 工作清单

- [ ] **event-name detection（主风险/不确定项——先验证再选实现）**：investigate BM25 是否 retrieve 对 event doc 给 event question。events 在 corpus（`context.ts buildSchemaContext` 已 branch event candidates via `payload.params_fields`）→ 若 BM25 可靠，detect event candidate（has params_fields + event name）→ load full def。若 BM25 不可靠→加 focused alt_labels/name matcher（semantic layer 的 event `alt_labels`/`name`）。先 dump 几个 event case（119/125/126/136）的 engine trace（bm25_linking candidates）确认 BM25 是否 surface event doc。
- [ ] `Nl2sqlAgentResponder.respond()`：detect event candidate/intent → 调 `schema.loadEventDefinition(name)` + `extractEventView(semanticRoot)`（或直接复用 `loadEventDefinitionResult`）→ map 成 `EventDefinitionLite`（params_fields + partitions + eventView full_name/template）→ pass `engine.run({question, scopeId, today, eventDef})`。
- [ ] `prompt.ts` contextPrefetched branch：extend `# 事件定义` 显式 render `FROM <event_view.full_name>` + `params_extract_template`（不只 JSON.stringify eventDef——让模型 prominently 见 FROM table + GET_JSON_OBJECT 模板）。需 `BuildPromptArgs` 加 `eventView?: EventViewInfo` field（或塞进 eventDef loose index——择一，lean 倾向显式 field）。
- [ ] critic：`candidate_tables` 是否需加 `event_view.full_name`（mirror G-DA4 `captureToolData`）让 critic 接受 event view 作 FROM（否则 `table_not_in_candidates` false-reject）。查 `critic.ts` 的 candidate-tables 规则。
- [ ] smoke 1 event case（119）确认 SQL 用 `ieu_ods.ods_10000251_all_view` + `GET_JSON_OBJECT` + execution_match=true（值 510）。
- [ ] re-baseline real-exec + judge-only 双模式（39 EXEC, pass^k, conc=3, --today 20260806, --scope-id 10000251）对比 7.7%/56.4%——event case 应回升。
- [ ] append audit-log + 更新 README baseline 表（加 post-eventdef-prefetch 行）。

## 成功标准

1. event case（119-138）real-exec execution_match=true 数显著升（target：≥3/8 event case 通过，vs 当前 0/8）。
2. real-exec pass_rate > 7.7%（回升），非 SQL 发射维持 0%（不回退 criterion #1）。
3. 通过 G-DA4 已建 seam（`loadEventDefinition`+`extractEventView`）——无新 substrate；additive，harness responder 不受影响。

## 备注

- 与 [GA-EVAL-RETRY-FEEDBACK](GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) 正交互补：(a) 给 event schema（修错表/placeholder），(d) 让 retry 能用 feedback 自修（修 null-SQL/drift）。二者可并行，组合最大收益（(a) 给对 schema 后 retry 一致性由 (d) 保）。
- 与 [G-DA4](G-DA4-event-table-name-grounding.md) **不重复**——G-DA4=harness path（resolved），本票=eval path（port 同 infra 进 `Nl2sqlAgentResponder`→`engine.run`）。
- **subsumes GA-EVAL-SQLGEN-FOLLOWUP option (b)**（prompt `# 上下文` "if loaded" 诚实性）——load 真 eventDef 使「若已加载」preamble 真；(b) standalone 无额外价值。
- event-name detection 若 BM25 不可靠，可能需小 infra（alt_labels matcher）——估工不确定，先 trace 验证。
- 与 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 正交（本票 engine path，EXPAND case-set 维度）。
- 环境：maxc CLI 0.4.8（`~/Library/Python/3.13/bin/maxc`，需 export PATH），`MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml`，maxc-sidecar-k11.mjs（real wrapper，非 standin MOCK）。conc=3（conc=4 under load 触发 AGA empty-burst）。key 走 `~/.dsh/.credentials.yaml` credentials seam。
- 不 force-push；rebase onto origin/master；concurrent session 活跃（工作树 leftover 非我——rebase 前 stash）。

---

## Progress (2026-09-06) — risk-gate resolved; session pivoted to (d); (a) deferred (open)

Risk-gate (work-list item #1) DONE via 4 LLM-free/maxc-free scratch probes (deleted after). **Verdict: BM25 unreliable + lexical matcher unsafe → detection sub-problem harder than this ticket assumed.**

- **BM25 surfaces the expected event doc 0/4** (top-8 per raw question, no expansion): 119→top-8 all DWS `new_role` tables (model picks DWS = the wrong-table bug); 125→top-8 other events' role-uv metrics (`game.coin.change` absent); 126/136→the event's *metric* items surface (`game.item.change__..._cnt`, `game.recharge__..._fen`) but the event *definition* (FROM-table grounding) does not.
- **G-DA4 infra confirmed live in eval path** (no wiring yet): `schema.loadEventDefinition('game.role.create')`→found (23 params/4 metrics); `extractEventView(semanticRoot)`→`EventViewInfo{full_name:"ieu_ods.ods_10000251_all_view", params_extract_template:"GET_JSON_OBJECT(params,'$.{field_name}')", base_columns:[account_id,role_id,ds,event,params,...]}`. Seams work; this ticket's job (wire into `respond()`) unchanged.
- **Lexical alt_labels matcher UNSAFE**: 8 TP / **14 FP** / 7 TN / 10 FN. FPs are DWS derived-metric questions matching 2-char generic alt_labels ("新增"→role.create on 038/044/048/050/054; "付费"→recharge on 039-059). **FP regression is concrete (value-based execution_match)**: 038 expected DWS `act_fst=1`=**552** vs event SQL=**510**; 040 expected `pay=1`=**259** vs recharge event=**4227**; 130 "付费抽卡" wrongly→recharge not `game.card.gacha`.
- **Specific-only matcher (alt_label ∉ DWS table text) too aggressive**: 0 FP but only 2 TP (125/126). `game.role.create` alt_labels=[新增,新增用户,新注册] ALL generic; `game.recharge`=[氪金,充值,付费] ALL generic. Specific nouns ("创角","现金券") live in event *descriptions*, not alt_labels → 119/136/card.gacha undetectable lexically; description-mining over-generates.
- **Root issue is semantic**: 038 "新增了多少个角色" (dws, exp 552) vs 119 "创角的新增角色数" (event, exp 510) are near-identical questions w/ different expected sources — only the event-specific noun "创角" distinguishes, and it's not in role.create's alt_labels. Lexical can't reliably separate raw-event from derived-metric.

**Implication**: the "focused alt_labels matcher" this ticket anticipated is insufficient. Robust detection needs (i) LLM-based 2-stage (lexical pre-filter → qwen-flash pick, raw-event-vs-derived framing; P15a expandQuery precedent) or (ii) description-specificity mining (over-gen risk). Either is heavier than scoped. **The infra-wiring (prompt surface eventView; critic accept event_view as FROM) remains valid + achievable regardless of the detector** — only the detector is the open sub-problem.

**Decision (per user direction 2026-09-06)**: session pivoted to **(d) GA-EVAL-RETRY-FEEDBACK** (cheaper/deterministic/independent — wire `args.feedback` into prompt). (a) stays **open**. Next session on (a): do NOT re-investigate BM25/alt_labels (evidence above stands); go straight to LLM-detection or description-mining.

**Sharpened work-list item #1** (replaces "investigate BM25"): *implement event-name detection via LLM 2-stage OR description-specificity matcher; must handle the 038-vs-119 semantic-twin ambiguity (don't inject role.create for 038 "新增角色"); validate 0 FP on all 39 cases before re-baseline.* Items #2-#5 (responder wiring, prompt surface, critic candidate_tables, smoke, re-baseline) unchanged.

**LLM-detection prototype result (2026-09-06, throwaway probe, deleted after):** Two-stage (lexical alt_labels pre-filter → qwen-flash LLM pick, raw-event-vs-derived framing + few-shot) on 39 cases → **TP=7, FP=4, TN=17, FN=11 — NOT 0 FP**. The 4 FP are all 「付费」→game.recharge (039 付费总金额 / 040 完成了付费 / 049 付费类型 / 052 累计付费金额最高 — DWS 派生指标误触发). few-shot fixed the 「新增角色」→role.create FP (038/050/054) but introduced the 「付费」→recharge FP (**whack-a-mole** — qwen-flash can't reliably separate 泛词 付费/新增角色 from 特定词 充值/创角). 11 FN mostly from lexical pre-filter finding no candidate (card.gacha lacks 「抽卡」 alt_label, role.online lacks 「登录」, etc — recall bounded by alt_labels coverage). **Verdict: qwen-flash LLM-detection unreliable for this raw-event-vs-derived judgment.** Next-session options: (i) try **qwen3.7-max** (stronger, ~39 calls slower/costlier ~10-20min) — may crack the 付费-vs-充值 / 新增角色-vs-创角 distinction; (ii) **conservative path** (specific-only alt_label matcher: 0 FP / 2 TP, safe but low — only 125/126); (iii) **expand candidate recall** (description-mining or BM25 event-candidate extraction — over-generation risk). The 038-vs-119 + 付费-vs-充值 ambiguity remains the crux. Probe script `_detect-event-llm-probe.ts` (throwaway) deleted.

**qwen3.7-max LLM-detection (2026-09-06, throwaway probe, deleted after):** Same two-stage + few-shot + stronger rule 「付费泛词≠充值特定词」 → **TP=7, FP=0, TN=21, FN=11 — 0 FP!** qwen3.7-max perfectly separates 泛词 (付费/新增角色 → NONE) from 特定词 (创角/充值 → event); all 21 DWS cases correctly NONE, no regression risk. 11 FN are ALL lexical pre-filter finding no candidate (card.gacha lacks 「抽卡」 alt_label, role.online lacks 「登录」, etc) = **recall problem, not precision problem**. **(a) precision is SOLVABLE** — qwen3.7-max LLM-detection is safe (0 FP). Next session: impl with qwen3.7-max LLM-detection (lexical pre-filter → qwen3.7-max pick), safely inject eventDef for the 7 detectable event cases (119/125/126/135/136/138/057 — meets ≥3/8 target). Recall 7/18 bounded by alt_labels coverage — expand later (description-mining / BM25 event-candidate) but non-blocking. Cost: ~1 qwen3.7-max call/question (~10s) on top of generation; acceptable for the event-case win. **This unblocks (a)** — the LLM-detection path the qwen-flash probe seemed to foreclose is viable with the stronger model.

---

## Resolution (2026-09-06) — grounding landed and demonstrably works; the measurement instrument turned out to be broken in two places

**Approach**: two-stage detector（词法预筛 → qwen3.7-max pick）→ G-DA4 seam 加载 → 四处 surface（prompt / critic / judge / engine args）。Commits on `task/ga-eval-eventdef-prefetch`（backup 分支 `backup-ga-eval-eventdef-prefetch`）：`36622d45eb`（主体）、`3229590eeb`（timeout collision）、`761b8551d0`（仪表审计 + 新票）、`0f7b9234a2`（judge schema context）。

### 落地内容

1. **`packages/eval/eval-cli/src/event-detect.ts`（新）** —— 两段式检测。词法段从 responder 已经加载的 corpus 里取 event item（`payload.params_fields` 判别，`payload` 即完整 `EventDefinition`，含 `alt_labels`）建短语匹配；LLM 段一次 qwen3.7-max pick，raw-event-vs-derived 框架 + 泛词/特定词规则 + few-shot。**两段都是被证据逼出来的**：BM25 0/4 不返事件定义（所以检索驱动不了），词法单干 8 TP/**14 FP**（所以必须有第二段）。检测模型钉死 qwen3.7-max（qwen-flash FP=4）。
2. **`packages/eval/eval-cli/src/context.ts`** —— `respond()` 里 detect → `ctx.schema.loadEventDefinition` + `extractEventView`（G-DA4 seam）→ `engine.run({eventDef, eventView})`。**按 question 缓存**：`respond()` 每个 pass^k attempt 调一次，不缓存则 39 case × k=3 付 117 次检测调用；更要紧的是 `passKVerdict` 要求 k 次全过，检测若在 attempt 间翻转，差异会被记到 SQL 生成头上。`params_fields` 保持 **map** 形态（`projectEvent` 的 array 投影会让 critic 的 `Object.keys` 拿到 `0,1,2…`）。
3. **`packages/data/nl2sql-engine/src/prompt.ts`** —— `BuildPromptArgs.eventView` + `# 事件查询落表` 独立 section（FROM 表 / params 模板 / 必带 ds）。**没有塞进 eventDef 的 JSON**——把 FROM 表埋在 23 字段的 JSON blob 里正是模型写出 `FROM <数据视图>` 的原因。缺省不渲染 → byte-stable（5 个既有快照未动）。
4. **`packages/data/nl2sql-engine/src/engine.ts`** —— eventView 既进 promptBuilder 也进 `makeCriticCtx.candidateTables`（qualified + bare 两种名，因 `extractTableNames` 剥 `db.` 前缀）。**少了后者 (a) 会比不做更糟**：告诉模型用这张表、然后自己的 critic 以 `table_not_in_candidates` 拒掉它，把 retry 全烧光。
5. **测试 123/123**（+2 prompt：section 内容 + null/undefined/缺省三态 byte-stability；+1 scenario **S12**：event view 同时到达 prompt 与 critic，**带 without-view 对照**证明那个误拒是真实的而非假想）。
6. **`dev/event-detect-fp-probe.ts`** —— 0-FP 是活模型性质，单测测不了，留成可复跑探针（前两个 session 各重建了一遍）。

### 检测器标定（39 case，`dev/event-detect-fp-probe.ts`，连续两跑完全一致）

**TP=6 · FP=0 · TN=21 · FN=12**。6 个 TP = 057/119/125/126/135/136。**21 个 DWS case 全判 NONE**——这是安全性质，成立。

⚠️ **修正上 session 的 FP=0 结论**：上 session 的 FP 只算「DWS case 被误判成 event」，把「event case 被判成**错的** event」记成了 FN。用更严的定义复测，122「昨天开始PVE副本挑战…」命中 `DungeonOnkeyPass` 的泛 alt_label「副本」被选中（真值 `game.pve.begin`）——**那是 FP，注入错事件和注入 DWS 一样出静默错值**。加了一条通用规则（命中泛词 ≠ 对得上；候选若是另一个具名活动的埋点则回 NONE）后 122 → NONE，FP 归零。TP 从 7 降到 6（138「新增且当天就充值」按「新增角色是泛词」规则回 NONE，属规则内一致行为）。

**12 个 FN 全是词法段无候选**：整个 scope 453 个事件里**只有 6 个填了 `alt_labels`**（recharge / role.create / coin.change / item.change / DungeonOnkeyPass×2），`card.gacha` 没有「抽卡」、`role.online` 没有「登录」。召回上限由语料覆盖决定，不是检测逻辑问题——扩召回是独立后续。

### (a) 确实生效（机制级证据，不依赖 pass_rate）

| 指标（judge-only, 39 case × k=3 = 117 attempts） | (d) 基线 | (a)+(d) |
|---|---|---|
| 用上 `ieu_ods.ods_10000251_all_view` 的 attempt | **0** | **17** |
| null-SQL | **21**/117 | **13**/117（**−38%**）|
| 非 SQL tool-call 发射 | 0 | 0（维持）|
| `FROM <数据视图>` 占位符 | 0 | 1 |

- **null-SQL 21 → 13** 是 [GA-EVAL-RETRY-FEEDBACK](GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) 预测过但单独做不到的事（(d) 只把 22 挪到 21）。两票的「组合最大收益」这次被测到了：event schema 到位后模型不再因为无表可写而 decline。
- **smoke 119**（real-exec）生成 `SELECT COUNT(DISTINCT role_id) AS new_role_uv FROM ieu_ods.ods_10000251_all_view WHERE event = 'game.role.create' AND ds = '20260805'`——**与 case 自己的 reference SQL 逐字一致**。
- **params 提取模板也生效**（119 用不到，它 role_id 是基础列）：135 生成 `SUM(CASE WHEN CAST(GET_JSON_OBJECT(params,'$.moneyType') AS BIGINT)=1 THEN CAST(GET_JSON_OBJECT(params,'$.money') AS BIGINT) ELSE 0 END)`，与 reference SQL 同构。
- critic 那半：S12 单测（带对照）+ 实跑 `ok=true`（若被拒会像对照组一样 retry 到 decline）。

### 两个被这次改动暴露出来的仪表缺陷

**(i) case-set 的 event 期望值不是冻结锚点** → 新票 [GA-EVAL-CASESET-EVENT-ANCHOR](GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)。

把每个 case **自己的** `expected.sql` 实跑（`ds=20260805`）对账 `expected.result_value`：**event 侧 16/18 已不符**（另 2 个是 `0==0`），**DWS 侧 13/13 逐位相符**（8 个多行的未验）。119 `510→552`、136 `432→482`、057/135 `773500→2409900`（3.1×）。方向多数升但不全（137 `288→259`、138 `48→39`），所以只能确证「ODS 原始视图历史分区不稳定、DWS 汇总表稳定」，机制未证。

**后果**：[GA-EVAL-SQLGEN-FOLLOWUP](GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) 记为「模型错值」的 119 的 552 和 136 的 482，**正是那两条 reference SQL 今天的值——模型当时算对了，判错的是仪表**。据此本票 criterion #1 是 **uninstrumented（无法测量），不是 unmet（未达成）**：16/18 event case 无论 SQL 多正确都过不了 `scalar_exact`。

**(ii) SQL semantic judge 与 critic 犯同一个错** → 已在本票修掉（`0f7b9234a2`）。

judge 用 responder 的 `schema_context`（BM25 候选）打 `table_selection`/`field_selection`，而 event view 是 scope 级 config、不是 corpus item。case 135（`data_source: event`，reference SQL 就是 event view 查询）：

| | 生成的 SQL | sql_judge | verdict |
|---|---|---|---|
| (d) 之前 | 3/3 用 DWS 表 `dws_..._com_pay_order_di` | **1.0 / 1.0 / 1.0** | correct |
| (a) 之后 | 3/3 用 reference 同构的 event view SQL | **0.4 / 0.2 / 0.2** | wrong |

judge 原话：「SQL 使用了 **Schema 上下文之外的** ODS 底层表（ieu_ods.ods_10000251_all_view）及 params 字段…导致表和字段选择错误」（`table_selection: 0`、`field_selection: 0`）。**仪表在惩罚 (a) 做的事，并且此前一直在奖励「貌似合理但取错源」的答案**。修法与 critic 同构：检测到 event 时把 event view + 事件名 + params 字段追加进 `schema_context`（追加式，未检测到 event 的 21 个 DWS case 那段文本 byte 不变）。

### 顺带修掉的一个潜伏 bug（`3229590eeb`）

dev sidecar 跑 `maxc query run --wait 60` 才提交异步 job，而 `MaxComputeQueryEngine.toolCallTimeoutMs` **也**默认 60s——两个预算撞在同一刻，比 wait 窗口慢的查询表现为 `MCP error -32001: Request timed out` 而不是走 sidecar 设计好的 pending/attach 路径。之前一直潜伏，因为历次 real-exec 打的都是秒级返回的预聚合 DWS 表；(a) 把模型指向 event ODS 视图后，`COUNT(DISTINCT role_id)` 实测 **68s**，于是 (a) 自己的正确 SQL 被判 infra_failure（smoke 119 首跑：3 attempts / 222s 全超时）。修法：wait 窗口读 `MAXC_WAIT_SECONDS`（默认 60 = 原硬编码值），eval-cli 从同一个环境变量派生 timeout（+60s 余量），使两者构造上不可能相撞。

### 成功标准逐条核对（诚实版）

1. **criterion #1（event case real-exec `execution_match=true` ≥3/8）—— as-shipped UNINSTRUMENTED（0/18）；按 live 值重锚后 MET（3/18，且是最强形式：三次 attempt 全部精确命中）。**

| case | 三次 attempt 实际值 | live 锚点 | 记录的期望值 |
|---|---|---|---|
| **119** | 552 / 552 / 552 | **552** | 510（stale）|
| **125** | 4545 / 4545 / 4545 | **4545** | 4327（stale）|
| **126** | 3413512 / 3413512 / 3413512 | **3413512** | 2774223（stale）|

另外 3 个被检测到的也都算对了，只差在别处：**135** `[24099, 2409900, 24099]` 与 **057** `[24099×3]` 是同一个数的 **fen/yuan 单位差**（reference SQL 返 fen，模型 `/100.0` 返 yuan）；**136** `[482, query failed, 482]` 两次精确命中 + 一次瞬时查询失败。**6 个被检测到的 event case 计算全部正确——0 个因「不知道表名」失败。** 12 个未检测到的照旧崩坏（129 把事件名当表名、123 幻觉 `game.yanwu.match`、124/127/130 全 null）→ **下一个瓶颈是召回，不是精度。**

as-shipped 的 0/18 要等 [GA-EVAL-CASESET-EVENT-ANCHOR](GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) 定口径后回填。重锚工具 `packages/eval/eval-cli/dev/reanchored-score.mjs`。
2. **criterion #2 —— judge-only 侧 MET（53.8% → 61.5%）；real-exec 侧见下。**

| judge-only（39 case × k=3） | (d) | (a)+(d) v1（judge 未修） | (a)+(d) v2（judge 已修） |
|---|---|---|---|
| pass_rate | 21/39 = 53.8% | 16/39 = 41.0% | **24/39 = 61.5%** |
| null-SQL /117 | 21 | 13 | **13** |
| 非 SQL 发射 | 0% | 0% | **0%** |
| event view attempts | 0 | 17 | **18** |

v2 vs (d)：**+9**（057/119/125/126/128/136/137 = **7 个 event case**，其中 5 个正是检测器的 6 个 TP；另 045/059）、**−6**。**收益分布不是噪声形状——精准落在 (a) 针对的 case 上。**

real-exec 侧（run `eventdef-realexec`，1h35m）：

| real-exec（39 × k=3）| post-prompt-fix (09-05) | (a)+(d) |
|---|---|---|
| pass（as-shipped）| 3/39 = 7.7% | 2/39 = **5.1%** |
| pass（**重锚**）| — | **5/39 = 12.8%** |
| null-SQL /117 | 23 | **13**（−43%）|
| 用 event view 的 attempt | 0 | **18**（全属那 6 个 TP；**DWS 用它 0 次**）|
| `FROM <数据视图>` 占位符 | **3** | **0** |

**as-shipped 的 7.7%→5.1% 不可解读**：通过的 case 从 {036,037,039} 变成 {041,046}——**零重叠，全是 DWS**。n=39 + `passKVerdict=every` 下这个指标基本是 DWS case 之间的抽奖（036 三次都选 `univ_role_summary_di` 返 0；037 att2 用对表拿到 4336 但 att1/att3 换表返 null）。两次 run 的 pass 集合都不相交 → 该 n 上比较 real-exec pass_rate 无意义。

6 个回退逐一查明**无一由 (a) 造成**：5 个 DWS（038/039/042/043/051）三次 attempt 的 `eventView` **全为 false**，检测未触发、prompt 与 (d) 逐字节相同 → 只能是采样；每个都同时有 sj=1.0 与 sj≤0.6 的 attempt（038=[1,0.2,1]、039=[0.4,1,1]、042=[0.4,0,1]、043=[0.6,0.2,1]、051=[1,0,0]），是 `passKVerdict=every` 放大的抖动。135（唯一被注入的回退）的 judge 修复**已生效**——att1/att3 现在 sj=1.0 五维全 1、rationale 称赞「正确选择了事件视图表…完美契合」；att2 得 0.4 是 judge 换了领域论点（ODS 客户端埋点有掉单风险，「真实营收」应以服务端 DWS 订单表为准）且漏了 `/100.0` → case 口径歧义 + all-must-pass，非 (a) 缺陷。
3. **criterion #3（0 FP，DWS 不回退）—— MET（检测层面）。** 探针 21/21 DWS 判 NONE（两跑一致）；实跑 117 个 attempt 里 DWS case 用 event view 的次数为 **0**。038/039/041/043/051 的 verdict 变化经 per-case 确认与注入无关。
4. **criterion #4（走 G-DA4 seam、additive、harness responder 不受影响）—— MET。** 用的是 `loadEventDefinition` + `extractEventView`，无新 substrate；`harness-responder.ts` 不经 `buildPrompt`/`Nl2sqlEngine`；另一个 `engine.run` 调用点（`eval-runner-service:284`）不传新参数；prompt 缺省 byte-stable（快照未动）。

### 残留风险 / 后续

- **critic 的 `json_field_not_in_params` 现在对 event 问题是活的**（此前 eventParams 为空 → 该检查被跳过）。135/136 用的 `money`/`moneyType` 都在 `params_fields` 里，没踩到。但 critic 取 JSON path 的**叶子段**匹配，而 params_fields 里存在点号键（`coinList.gold`）——`'$.coinList.gold'` 的叶子 `gold` 不在 keys 里，**会误拒**。未在本次 case 上触发，未修。
- **few-shot 用的是 eval set 里的原句**，所以 0-FP 是部分 in-sample 的；对未见问题的泛化未测。安全侧的失败模式是「漏检 → 退回 pre-(a) 行为」而非静默错值，但这条得说明白。
- **召回 6/18** 受 `alt_labels` 覆盖（453 事件中仅 6 个有）限制——扩召回（description-mining / BM25 event-candidate）是独立后续。
- **检测成本**：每个有词法候选的问题 +1 次 qwen3.7-max 调用（~2-3s，按 question 缓存）。
- 056/130 的 reference SQL 返回 0（登录账号 UV=0、付费抽卡次数=0）本身可疑，已记进新票工作清单。
