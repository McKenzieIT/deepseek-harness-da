# dsh-data-agent 对话管道根因分析 — 2026-08-21

> 会话：wayfinder "work through the map" —— 用户在 `http://127.0.0.1:3080/` 以 data-agent 模式实测查询「帮我查询 K11 最近七天的 DAU 和付费情况」后报三个问题。
> 方法：只读源码 + 配置核证（路径 + symbol/line 级定位）。本笔记**只做诊断，不做修复**（wayfinder "plan, don't do"）。
> 与 `../2026-08-21-verification-audit.md` 的关系：那份审计的「能够实施对话 ✅」**只验了 LLM wiring（headless PONG）**，未验四阶段管道；本笔记补上管道层根因。

## 0. TL;DR（三个问题的根因 + 与 reverse-bi 的能力差）

| # | 用户现象 | 根因（代码层） | reverse-bi 对应能力（dsh 尚缺） |
|---|---|---|---|
| 1 | data-agent 模式无描述 | data-agent preset **缺 `preset.yml`**（standard/code 都有；`SKILL.md:26` 明示无元数据则显示裸目录名） | （非 rbi 能力；dsh preset 元数据缺失） |
| 2 | `search_data_sources` 恒返回 "No matching data sources found." | 工具回退到**空语料** `new Bm25Linker([])`；因 `ctx.retrieval`/`ctx.schema` 均**未注册**（data-agent bundle 把 embedder/retrieval/semantic-layer 全注释；且 data-agent profile 非默认 shipped，`dsh web` 走 web-app bundle 不挂任何 data 能力插件） | rbi：1450 events + 117 tables 语义层 + 混合检索（BM25+vec+RRF）真实语料 |
| 3 | 强制四阶段、不识别 query 是否是查询 query | UNDERSTANDING `always_pass` **必推进**到 GENERATION；`generationGate` 依赖 `critique_sql_tool`/`evaluate_sql_quality`（**未 ship**）→ 闸门恒 fail；**无意图/置信度路由**（rbi v2-baseline §2 high/mid/low 未迁移） | rbi：置信度分级路由（高→直答/中→澄清 HALT/低→诚实拒）+ 三层 SQL critic + 3-state 执行 + 结构化交付工具 |

**一句话**：dsh-data-agent 目前只有**四阶段脚手架（phase-gate 7 hook）+ seam 空壳 + LLM wiring**；让「查 DAU+付费」真正跑通的**内容**（真实语料 / critic / 真执行 / 交付工具 / 意图路由 / v2-baseline 提示脑）**全部未 ship 或未接线**。审计的 PONG 只证了最底层 LLM I/O。

---

## 1. 问题一：data-agent 模式无描述

### 事实
- preset = 一个目录，含 `agent.cordis.yml`，**可选**旁置 `preset.yml` 承载展示元数据（`name`/`description`/`order`）。
- `apps/cli/config/agent-presets/standard/preset.yml`：`name: 标准模式` / `description: 功能完整的编码 Agent…` / `order: 1`。
- `apps/cli/config/agent-presets/code/preset.yml`：`name: PTC 模式` / `description: …Code Mode SDK…` / `order: 2`。 ← **用户说的「PTC 模式」= `code` preset**。
- `apps/cli/config/agent-presets/data-agent/` 目录**只有** `agent.cordis.yml` + 3 个 G1 实验变体（`b-free-react-planning`/`c-hybrid`/`d-bare-react`），**无 `preset.yml`**。

### 根因（直接证据）
`apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md:26`：

> "A preset is a directory holding one `agent.cordis.yml`, optionally beside a `preset.yml` carrying display metadata — `name` and `description` (and, for shipped presets, a roster `order`). … **a preset without it shows up in every picker as its bare directory name.**"

→ data-agent preset 缺 `preset.yml`，故在模式选择器里**只显示裸目录名 `data-agent`、无 name/description**。standard/code 有 `preset.yml` 所以有「标准模式/PTC 模式」描述。

### 修复形态（task，非决策）
新增 `apps/cli/config/agent-presets/data-agent/preset.yml`，填 `name`（如「数据模式」）/ `description`（NL→SQL 取数 agent，四阶段…）/ `order`（如 3）。落地 ticket：`../tickets/phase-misc/DA1-preset-yml-display-metadata.md`。

---

## 2. 问题二：`search_data_sources` 恒返回 "No matching data sources found."

### 事实（工具实现）
`packages/data/tool-search-data-sources/src/index.ts`，`apply()`：
```ts
// Q1 thin default: empty corpus until P6b ctx.schema ships.
const linker: RetrievalLinker = new Bm25Linker([])   // ← 空语料
…
async execute(args, exec) {
  const retrieval = ctx.get('retrieval') as RetrievalService | undefined   // 探针
  if (retrieval !== undefined) { … return { candidates: hits.map(projectHit) } }
  const schemaProbe = ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
  if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') { … }
  return { candidates: searchDataSources(linker, args.query, topK) }   // ← 空语料 → 0 候选
}
```
`output.render`（同文件 ~L185）：`value.candidates.length === 0 ? 'No matching data sources found.' : …`。

→ **当 `ctx.retrieval` 与 `ctx.schema` 都未注册时，回退到空 `Bm25Linker([])` → BM25 返回 0 候选 → 渲染 "No matching data sources found."** 这是工具**设计内的「callable but unwired」诚实空态**（注释自述），不是 mount 崩溃。

### 根因（为什么两 seam 都未注册）
1. **data-agent bundle 把它们注释掉了** —— `packages/bundle/data-agent/cordis.patch.yml` 的 data capability insert 块里：
   - `embedder`（`@deepseek-ai/dsh-embedder-fakehash`）**注释**（pending D2c keep/regress）。
   - `retrieval`（`@deepseek-ai/dsh-retrieval-inproc`）**注释**（pending D2c）。
   - `semantic-layer`（`@deepseek-ai/dsh-semantic-layer`）**注释**（"name TBD - P6"）。
   - 仅 `query-engine`(maxcompute)/`audit`/`nl2sql-engine`/`identity`/`llm-dashscope` 解注释。
   - 注释自述："activation … is D2c's evals-driven keep/regress call; an unmounted seam keeps search_data_sources on its Bm25Linker default (no behavior change)"。
2. **而且 data-agent profile 非默认 shipped** —— 同 bundle 文件注释："A standalone data-agent profile is created out-of-tree through `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` once the four-phase preset (P7) and its driver land." → 默认 `dsh web` 走 **web-app bundle**（`packages/bundle/web-app/cordis.patch.yml`），它**完全不挂**任何 data 能力插件（只有 llm-dashscope + UI roster + standard preset 作 default）。
   - 故 `:3080` 选 data-agent 模式 = web-app bundle + data-agent **preset**（phase-gate + 4 工具行）；`ctx.query`/`ctx.schema`/`ctx.retrieval`/`ctx.audit`/`ctx.nl2sql` **全部 undefined**（连 bundle 里解注释的 query-engine/audit/nl2sql 也没挂，因为 data-agent bundle 根本没被 web profile 应用）。

### 结论
**无论是否启用 data-agent profile，`search_data_sources` 都拿不到语料**：
- 走 web 默认 → 所有 data seam 缺席 → 空语料。
- 即便启 data-agent profile → bundle 仍把 retrieval/semantic-layer 注释 → 仍空语料（live-ODPS provider 是 P6b follow-up「`load_* tool 包 + live-ODPS provider = follow-up`」，见审计 §5）。

→ 这是「No matching data sources found.」的**确定性**根因，非偶发。

---

## 3. 问题三：强制四阶段 + 不识别 query 是否是查询 query

### 事实（phase-gate 实现）
`packages/data/phase-gate/src/phase-gate.ts` + `types.ts`。

#### 3a. 「无论上一阶段是否成功，强制跑下一阶段」
`types.ts` `PHASE_CONFIGS`：
- UNDERSTANDING: `gate: 'always_pass'`, `fallback_phase: null`
- GENERATION: `gate: 'sql_syntax_gate'`, `fallback_phase: UNDERSTANDING`
- EXECUTION: `gate: 'always_pass'`（"never consulted"，由 `ctx.query` 3-state 驱动）
- INTERPRETATION: `gate: 'always_pass'`

`phase-gate.ts` `onTurnStopping` → `runGate(s)`：UNDERSTANDING 走 `always_pass` 分支 → **直接 `advance()` 到 GENERATION**，**不论 UNDERSTANDING 是否真检索到候选**（即便 `search_data_sources` 返回空、`candidate_tables` 为空，也只是触发 `forcedLoad` 再搜一次——仍是空语料——然后照常 advance）。

→ **UNDERSTANDING→GENERATION 是无条件推进**。这就是用户感知的「上一阶段没成功也强制下一阶段」的来源：UNDERSTANDING 的 gate 是 `always_pass`，没有「检索为空 → 不进入 GENERATION / 转澄清或拒答」的闸门。

#### 3b. GENERATION 闸门是「死的」——critic 工具未 ship
`phase-gate.ts` `generationGate(s)`：
```ts
const sql = extractSqlCandidate(s.phase_output)      // 正则抽数（无 sqlglot）
if (sql !== null) s.last_sql = sql
const gate = sqlSyntaxGate(s.phase_output, criticCtx) // 正则 + JSON-path（无 sqlglot AST）
if (!gate.passed) return GateResult(false, gate.reason)
if (s.last_critique === null) return GateResult.fail('critique not run (critique_sql_tool missing)')
if (s.last_critique < critique_confidence_floor) …
if (s.last_quality === null) return GateResult.fail('quality not run / not evaluated (evaluate_sql_quality missing)')
if (s.last_quality < quality_score_floor) …
return GateResult.pass()
```
- `s.last_critique` / `s.last_quality` 由 `captureToolData`（`tools/post-execute`）从 `critique_sql_tool` / `evaluate_sql_quality` 的返回值填充。
- **但 `critique_sql_tool` / `evaluate_sql_quality` 工具包未 ship** —— `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 中这两行（+ `present_*`）**注释**（"name TBD - P13b"）。
- → `s.last_critique === null` 恒成立 → `generationGate` **恒 fail** → 重试 5 次 → `fallback` 回 UNDERSTANDING → 兜圈，最终 `honest_decline`（或模型干脆不产 SQL，`extractSqlCandidate` 返回 null，闸门更早 fail）。

→ **GENERATION 阶段永远无法合法 pass**（critic 缺席）。这是「管道跑不动」的闸门层根因。

#### 3c. 「不识别 query 是否是查询 query」——无意图/置信度路由
- phase-gate **无任何意图分类器**。BASE_PERSONA + PHASE_INSTRUCTIONS 直接告诉模型「跑四阶段」；唯一拒答路径是模型在 INTERPRETATION **自愿** emit `INCOMPLETE_MARKER`（`interpretGate`），或预算/看门狗耗尽 `honest_decline`。
- 没有「这是闲聊/问候 → 不进 SQL 管道 → 直答」的确定性路由。
- → 任何输入（含「你好」）都被推进 UNDERSTANDING→GENERATION→…。

#### 3d. EXECUTION / INTERPRETATION 同样无米下锅
- EXECUTION `executionDecision` 读 `s.last_query_outcome`（done/running/failed），由 `query_data` 填充。`@deepseek-ai/dsh-query-tool` **包已 ship**（`packages/query/query-tool/package.json` v0.1.0-rc.7），但 `ctx.query`（maxcompute）在 web 默认下未注册；真 ODPS 执行路径（`P4c-real-odps-execution-path`）是 hard gate（未 ship）。→ `query_data` 无 `ctx.query` → 执行失败/不可达 → 无真实 3-state → 无法 done→advance / failed→fallback。
- INTERPRETATION 交付工具 `present_decomposition`/`present_table`/`compute`/`suggest_followups` **全部未 ship**（preset 注释）→ 无法结构化交付「DAU+付费」表/图。

### 审计「能够实施对话 ✅」的盲点
审计 §2 的证明是 headless `Reply with exactly one word: PONG → PONG`。该测试**不挂 data-agent preset / phase-gate**（headless profile = dsh-base + dsh-headless，审计本会话才 insert llm-dashscope），只证了**llm-dashscope 的 LLM I/O 通**。一旦选 data-agent 模式（phase-gate 上挂），PONG 这种非数据回复也会被推进四阶段、撞上死闸门。**审计把「LLM 能回话」误当成「data-agent 管道能对话」**，这正是用户实测发现「基础对话能力并没有真正可用」的落差。

---

## 4. 与 reverse-bi 的能力差（「同等使用」还差什么）

reverse-bi 的「data agent」= `libs/rbi-agent/src/rbi_agent/data_agent/DataAgentPipeline`（`rbi-purpose-arch.md` §4 列 15 项能力、§5 列端到端生命周期）。要「同等使用」（查 K11 七天 DAU+付费），dsh 仍缺：

| rbi 能力（§4 编号） | rbi 落地 | dsh 现状 | 差距 |
|---|---|---|---|
| #4 置信度分级路由 | `v2-baseline.md §2`：high→直答 / mid→`present_clarification` HALT / low→诚实拒或 discovery | **无**（UNDERSTANDING always_pass，无意图/置信度闸门） | **核心缺**（问题三的「不识别 query」） |
| #3 语义层+混合检索真实语料 | 1450 events + 117 tables YAML；`search_data_sources` 返回 ranked candidates + query_matches + verified_hit | 语料**空**（retrieval/semantic-layer 未挂、live-ODPS provider follow-up） | **核心缺**（问题二） |
| #5 SQL critic 三层 | `critique_sql_tool`（sqlglot AST + JSON-path + registry-grounded）+ `evaluate_sql_quality`（100 分制） | 工具**未 ship**；phase-gate 仅正则 `sqlSyntaxGate`（无 sqlglot AST） | **核心缺**（GENERATION 死闸门） |
| #6 Guard Chain + 真执行 3-state | `query_data` 跑 Guard Chain（SELECT-only/分区/成本/真超时 300s/歧义），返 done/running/failed | `dsh-query-tool` ship 了但 `ctx.query`(maxcompute) web 下未挂；`P4c` 真执行路径 hard gate 未 ship | **核心缺**（EXECUTION 无真实 3-state） |
| #10 结构化交付（present_*） | `present_decomposition`→`present_table`→`compute`→`suggest_followups`+`log_audit`；"pass intent not data" + `result_id` handle | 全部**未 ship**（preset 注释） | **核心缺**（INTERPRETATION 无法交付） |
| — v2-baseline 提示脑 | §1-§6 完整：load_* grounded / 置信度 / 复合拆解 / 六类消歧 / 诚实拒 why-what-how / 交付纯度 | 仅薄 `BASE_PERSONA` + 4 段 `PHASE_INSTRUCTIONS` + SQL_CONVENTIONS | **核心缺**（无置信度/消歧/诚实拒细则） |
| #7 原子拆解 | 复合→原子（≥2 指标/维度级/"对比"），`max_subquestions=4`，`【拆解】` marker | 有 marker + budget 配置，**无真实拆解逻辑/产物** | 部分 |
| #8 消歧一等公民 | 六类 checklist（A 数据源/B 口径/C 术语/D 隐含/E 内容/F 组合）+ 三层决策 + `save_accumulated_definition` 持久 | 有 `present_clarification`+`awaiting_clarification`，**无六类扫描 + accumulated-definition 持久** | 部分 |
| #9 诚实拒答 | why/what/how + discovery 路径（A 问定义 / B 广搜+present_clarification），预算内可多次 | 仅预算/看门狗耗尽 + INTERPRETATION INCOMPLETE marker | 部分 |
| #14 全链审计 | `log_audit` 全流程 trace + 自校准根因分类 | `@deepseek-ai/dsh-audit` ship（P8b） | 较近（但 web 默认未挂） |
| #11 自改进（Prompt Evolution + Golden-Case） | 双闭环 | 未迁移（map 判为 harness/UX，可能 out-of-scope） | 视 scope |
| #13 多租户+多 game | Game=数据配置单元，Tenant=访问主体 | `dsh-admin`/访问隔离 P9 resolved，但 P9b（per-user 登录）**unblocked 未做** | 部分（P9b） |

### 一句话总结
**dsh-data-agent = 四阶段脚手架 + seam 空壳 + LLM wiring；reverse-bi「同等使用」所需的 6 块内容（意图路由 / 真实语料 / SQL critic / 真执行 3-state / 交付工具 / v2-baseline 提示脑）全部未 ship 或未接线。** 这是「基础对话能力不可用」的总根因——不是某一处 bug，而是**端到端管道的每一阶段都缺内容**。

---

## 5. 落到 wayfinder（决策/ ticket 建议，非实施）

- **问题一**（preset.yml 缺失）→ task ticket `../tickets/phase-misc/DA1-preset-yml-display-metadata.md`（新增元数据文件，非决策）。
- **问题二**（语料空）→ 细化已有 `../tickets/phase-misc/data-agent-conversation-readiness.md` 的「Remaining #3」；deep decision 受 **D2c**（retrieval keep/regress）+ **P4c**（真 ODPS 执行）门控，非新决策。
- **问题三**（死闸门 + 无意图路由）→ 新 grilling ticket `../tickets/phase-misc/G-DA2-intent-confidence-router.md`（是否迁移 rbi 置信度分级路由作 UNDERSTANDING 闸门 + critic/交付工具 ship 顺序）。其余（critique/evaluate/present 工具包 ship）并入 conversation-readiness #3。
- **map 指针**：本笔记 + 上述 ticket 已在 tickets/README frontier 索引登记；`map.md` 的 Decisions-so-far 宜补一行「2026-08-21 实测：对话管道非可用——根因见 research/2026-08-21-conversation-pipeline-root-causes；审计 PONG 仅证 LLM wiring」（受 61KB map 体量，本会话未安全内联编辑，留 follow-up）。
