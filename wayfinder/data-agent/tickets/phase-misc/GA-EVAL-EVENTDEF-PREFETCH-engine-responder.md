# GA-EVAL-EVENTDEF-PREFETCH — port G-DA4 event_view grounding to engine responder

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
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
