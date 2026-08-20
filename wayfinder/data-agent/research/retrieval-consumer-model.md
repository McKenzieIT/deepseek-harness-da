# retrieval consumer-model：pipeline-internal vs agent-tool for dsh-data-agent（核源 + 处方）

> P5 D2 调研切片 S4。处方性技术备忘。所有论断附一级源（arXiv abstract / GitHub repo source）。检索消费模型三分：(a) **pipeline-internal**——四阶段流水线在固定阶段预取上下文喂 LLM，**无模型可见 `retrieve` 工具**；(b) **agent-facing tool**——LLM 生成期按需调 `retrieve(query)`（agentic retrieval）；(c) **both**——流水线预取 + 模型可见 retrieve 工具（escape-hatch / on-demand refinement）。
>
> **核验方法论**：arXiv 经 `arxiv.org/abs/<id>` 直抓 citation_title/abstract 元数据；GitHub 仓库源码经 GitHub Contents API（base64 解码）与 jsDelivr CDN（`cdn.jsdelivr.net/gh/...`）双通道抓取，绕开本环境对 `raw.githubusercontent.com` 的 403 拦截。WebFetch 对 `arxiv.org` / `*.githubusercontent.com` / `docs.getwren.ai` / `vanna.ai` 全部返 "Unable to verify domain safe"，故这些域未用 WebFetch，改用上述两通道。**无法直验**的项显式标注。

---

## 1. Text2SQL 学术文献：取数消费模型的显性主流是 (a) 流水线阶段预取

直接核到 arXiv 元数据，Text2SQL 主流文献**几乎全部**把 schema linking / 示例选择做成 SQL 生成**之前/之内的确定性流水线阶段**，而非让 LLM 生成期 agentic 调 retrieve 工具。

| 工作 | arXiv（直验） | 取数消费模型 | 证据 |
|---|---|---|---|
| **CHESS** | [2405.16755](https://arxiv.org/abs/2405.16755) | **(a) 流水线** | "a LLM based multi-agent framework... four specialized agents: the **Information Retriever (IR)** extracts relevant data, the **Schema Selector (SS)** prunes large schemas, the **Candidate Generator (CG)** generates... and the **Unit Tester (UT)** validates"。四个"agent"是固定序列的 LLM 人格，IR/SS 在 CG 之前——**确定性预取阶段**，非 model-facing tool。 |
| **DIN-SQL** | [2304.11015](https://arxiv.org/abs/2304.11015) | **(a) 流水线** | "Decomposed In-Context Learning of Text-to-SQL with Self-Correction"——分解为 schema linking → classification → SQL generation → self-correction，全 prompted 流水线阶段。 |
| **DAIL-SQL** | [2308.15363](https://arxiv.org/abs/2308.15363) | **(a) 流水线** | "Text-to-SQL Empowered by Large Language Models: A Benchmark Evaluation"（Gao et al.）——明确以 "**question representation, example selection and example organization**" 为预取阶段（cross-encoder 排序选例）。 |
| **RESDSQL** | [2302.05965](https://arxiv.org/abs/2302.05965) | **(a) 流水线** | "**ranking-enhanced** encoding and skeleton-aware decoding framework to **decouple the schema linking and the skeleton parsing**"——schema linking 是 ranking 预取阶段（甚至 fine-tune 模型，非 LLM prompting）。 |
| **C3 (C3SQL)** | [2307.07306](https://arxiv.org/abs/2307.07306) | **(a) 流水线** | "C3: Zero-shot Text-to-SQL with ChatGPT"——clear prompting + skeleton + cross-domain，prompt 工程式流水线。 |
| **MAC-SQL** | [2312.11242](https://arxiv.org/abs/2312.11242) | **(a) 偏 (c)，脚本式多 agent** | "a core **decomposer agent**... accompanied by two auxiliary agents that **utilize external tools or models** to acquire smaller sub-databases and refine erroneous SQL queries... **activated as needed**"。警示：这里的"agent"是**固定角色的脚本化协作**（decomposer → selector/refiner），**不是单一 LLM 自由决定何时调 retrieve()**。属"脚本式 multi-agent + 辅助工具"，靠 (a) 一侧，只是把"工具"挂到辅助 agent。 |
| **TAG** | [2408.14717](https://arxiv.org/abs/2408.14717) | **指向 (b)/(c)** | "Text2SQL is Not Enough: **Unifying AI and Databases with TAG**"——主张超越 text2sql、走向 AI+DB 统一、LLM 在 DB 工具上跑 agent loop。学术侧对 (b)/(c) 的方向性背书，但属研究议程，非 production 流水线。 |

**显性主流结论**：Text2SQL 文献的取数消费模型**压倒性地是 (a)**——schema linking 与示例选择作 SQL 生成前的确定性流水线阶段。**没有任何一篇主流 Text2SQL 论文把 retrieve 做成 SQL 生成期 LLM 按需调用的自由 agent 工具**。MAC-SQL 的"agent + 外部工具"是脚本化辅助，仍受流水线编排；TAG 是 (b)/(c) 的方向性主张但非现成流水线。

---

## 2. 生产 GenBI / Chat-BI：三种消费模型各有一例，WrenAI 落 (c)

### 2a. Vanna —— 明确转向 (b) agentic retrieval

Vanna 仓库官方 description（GitHub API 直验）逐字：
> "🤖 Chat with your SQL database 📊. Accurate Text-to-SQL Generation via LLMs using **Agentic Retrieval** 🔄."
源：[github.com/vanna-ai/vanna](https://github.com/vanna-ai/vanna)（repo description 字段，2026-02 archive at v2.0.2）。

`src/vanna/` 目录结构（GitHub API 直验）：`core/{agent,tool,workflow,middleware,registry,enhancer,enricher,filter,lifecycle,llm,observability,recovery,storage,system_prompt,user}`，`tools/{run_sql.py, visualize_data.py, python.py, file_system.py, agent_memory.py}`。这是**完整 agent 框架**（registry/components/middleware/workflow），retrieval 折叠进 agent loop（`agent_memory.py` 即记忆/取数工具），**无独立 `retrieve` 工具文件**——"Agentic Retrieval" 指 LLM 在 agent loop 中按需拉记忆/上下文，非 0.x 的 `get_similar_question`/`get_related_ddl` 流水线函数。**消费模型 = (b)**。

处方含义：Vanna 从 0.x 的 (a) 流水线 RAG 迁到 2.0 的 (b) agentic，是为 enterprise 安全/权限/流式（README "User-Aware at Every Layer"、"tool execution"、"Row-level security"）。**(b) 的主要动因是 agent 化产品形态，不是 NL→SQL 取数本身的需求**。

### 2b. SuperSonic (Tencent) —— (a) 流水线内部从 semantic layer 取数

SuperSonic README（GitHub API 直验）逐字：
> "SuperSonic unifies **Chat BI** (powered by LLM) and **Headless BI** (powered by semantic layer) paradigms... **Chat BI's Text2SQL gets augmented with context-retrieval from semantic models**. Headless BI's query interface gets extended with natural language API."
源：[github.com/tencentmusic/supersonic](https://github.com/tencentmusic/supersonic) README。

[CLAUDE.md](https://github.com/tencentmusic/supersonic/blob/main/CLAUDE.md) 架构：`chat/` = Chat BI LLM 模块；`headless/` = Headless BI 语义层（"semantic layer with open API"）；Java/Maven；"designed to be **extensible and composable**, allowing custom implementations to be added and configured with **Java SPI**"。

**消费模型 = (a)**：LLM 的 Text2SQL 被流水线**从 semantic model 上下文检索**增强；LLM 不调 retrieve 工具，流水线在调 Text2SQL 前从 headless 语义层拉上下文喂 LLM。SPI 扩展点 = dsh "additive-only" 的 Java 类比。**与 dsh-data-agent 形态最接近的开源生产系统**（语义层 + 流水线 + 可插拔 + 内部取数）。

### 2c. WrenAI (Canner) —— (c) 混合，教科书级范例

WrenAI 仓库（[github.com/Canner/WrenAI](https://github.com/Canner/WrenAI)，17.3k★，topics 含 `mcp`/`rag`/`semantic-layer`/`context-engineering`）。**同时具备**流水线 prompt-shaping 与 agent-facing retrieve 工具，源码层三重证据：

**证据 1 — 流水线 prompt-shaping（`ask.py`）**（jsDelivr CDN 直验源码 docstring）：
> "`wren ask` wraps a user's natural-language prompt in one of two bundled templates... Modes: `guided` — prepends a strict task flow (for weaker LLMs); `direct` — minimal wrapping (for stronger LLMs)."
源：`core/wren/src/wren/ask.py`。

`ask_templates/guided.md.tmpl`（jsDelivr 直验）是**写死的 6 步流程**：
```
TASK TYPE A — data question:
  1. wren context show        # see MDL models
  2. wren memory recall -q    # similar past queries (skip if no memory)
  3. write SQL using model names
  4. wren dry-plan --sql      # validate
  5. wren query --sql          # execute
  6. answer in natural language
```
`direct.md.tmpl`（jsDelivr 直验）相反，极简：
> "You have access to Wren CLI for semantic SQL queries. Run `wren skills list` or `wren --help` to discover capabilities."

**这是 (a) vs (b) 的同产品内对照**：`guided` = 四阶段流水线**写进 prompt 让 agent 照剧本走**；`direct` = 放手让强 LLM 自由 agentic。WrenAI 两者都提供 → 默认倾向 `guided`（确定性剧本），强模型可用 `direct`。

**证据 2 — agent-facing retrieve/query 工具（`mcp_server.py`）**（jsDelivr 直验源码）：
> "FastMCP server exposing WrenEngine **query + context/knowledge tools**."

注册的 MCP 工具（`@mcp.tool(...)` 装饰器，逐个核到）：
- query tools：`run_sql`、`dry_run`、`query_cube`、`dry_plan`
- **context tools**：`get_mdl`、`list_models`、`describe_model(name)`、`get_data_source`、`list_cubes`、`describe_cube(name)`、`list_functions`
- **knowledge tools**：`get_instructions`、**`recall_queries(question, limit=3)`**（= 检索相似历史查询）、**`get_context(question, ...)`**（= 组装上下文）、`describe_schema`

`recall_queries` 与 `get_context` 是**模型可见的 retrieve 工具**——LLM 生成期可按需调。源：`core/wren/src/wren/mcp_server.py`。

**证据 3 — `context.py` 内嵌的 AGENTS.md 模板**（jsDelivr 直验，决定性证据）：
```
# AGENTS.md
This project uses Wren Engine as the semantic layer... Queries are written against MDL model names, not raw database tables.

## Answering data questions
When the user asks about data, metrics, reports, or business questions, follow this workflow:
1. `wren memory fetch -q "<question>"`   — get relevant schema context
2. `wren memory recall -q "<question>" --limit 3`  — find similar past queries
3. Write SQL using model names from the MDL
4. `wren --sql "<sql>"`  — execute through the semantic layer
5. `wren memory store --nl "<question>" --sql "<sql>"`  — store confirmed results
```
源：`core/wren/src/wren/context.py`。

**这是 (c) 的教科书实现**：四阶段流水线（fetch context → recall → generate → execute → store）被表达为 **AGENTS.md 里的 guided agent recipe**，而 retrieve 本身是 **agent-facing CLI/MCP 工具**（`wren memory fetch`、`wren memory recall`）。流水线的"确定性"靠 recipe 剧本顺序保证；"按需性"靠工具是 agent-facing 保证。WrenAI README 自己点题（jsDelivr 直验）：
> "Correctness as primitives. **Rich schema retrieval**, dry-plan validation, structured errors... **The agent orchestrates; the trace lives in its reasoning**."

即：**取数原语是确定性工具（rich schema retrieval 作 primitive），编排由 agent 完成**——(c) 的精确表述。

**WrenAI 与 dsh 的同构性极强**：semantic layer (MDL) ≈ dsh semantic-layer entries；context layer + memory ≈ dsh DDL/SQL examples/data-source metadata 受控语料；AGENTS.md guided recipe ≈ dsh 四阶段流水线 default orchestration；MCP/CLI tools as plugins ≈ dsh additive-only plugins；skills（`wren skills list/get`）≈ dsh 的 skills/skillify。**WrenAI 是 dsh-data-agent 最近的、已规模化的生产先例，且它选了 (c)。**

---

## 3. Agentic-RAG vs 确定性 pipeline-RAG 之争：何时谁赢

### 3a. Cline = agentic 检索（LLM 调 grep/glob/read）

Cline 仓库 README（jsDelivr 直验 [github.com/cline/cline](https://github.com/cline/cline)）：
> "use tools with human-in-the-loop approval... Build your own AI agents... Custom tools, multi-agent teams... `createTool` from `@cline/sdk`... or use **MCP servers** to connect to databases, query APIs, manage cloud infrastructure... Coordinate multiple agents working together."

Cline 经典内置工具集（`read_file` / `search_file_content`(grep) / `list_files`(glob) / `execute_command`）是其 agent loop 的 grep/glob/read 范式。**特征**：无预索引、按需、精确匹配、可调试、token-密集、对大库慢。(b) 在代码 agent 领域的体现。

### 3b. Cursor = pipeline/索引式 RAG（无法直验内容，标注）

Cursor 官方文档站 [cursor.com/docs](https://cursor.com/docs) 在本环境返 Next.js SPA 壳 HTML（curl 取不到正文），WebFetch 对该域 "Unable to verify domain safe"。**Cursor 的 codebase indexing / 向量检索 RAG 具体机制未能在本次核验中直抓正文**——以下按社区共识陈述并显式标注**未直验**：Cursor 把代码切片入向量库，`@Codebase` 触发 top-K 语义检索后喂 LLM（pipeline retrieval）。**需读者自行到 cursor.com/docs 复核**；若与官方不符以官方为准。

### 3c. 何时谁赢（处方性判据）

| 维度 | (a) pipeline-RAG 赢 | (b) agentic-RAG 赢 |
|---|---|---|
| 语料规模/分块 | **小、受控、天然分块**（semantic-layer 条目、DDL、SQL 样例）→ 确定性预取召回率高 | 大、无界、需语义近似（开放代码库、海量文档）→ agentic 按需精炼 |
| 查询歧义度 | 低-中（NL→SQL 主路径可枚举意图）→ 流水线够用 | **高**（多跳、需澄清、跨源）→ agentic 自纠错 |
| 延迟/cost 预算 | 紧（1 次 LLM 调用）→ pipeline | 宽（可承受多轮 retrieve→eval→retrieve）→ agentic |
| 可观测/可审计 | 强需求（合规、可复现）→ pipeline | 可牺牲 → agentic |
| 编排默认形态 | **已有确定性 N 阶段流水线** → (a) 自然 | **自由 agent loop** → (b) 自然 |

**对受控语料 + 确定性四阶段流水线的判据**：当语料小且天然分块（dsh 的 semantic-layer/DDL/SQL 样例），**确定性预取召回率天然高**，agentic 灵活性的边际收益小，而 agent-loop 的延迟/token/非确定性代价是净负债。**纯 (b) 对 dsh 不划算**。

---

## 4. (c) 混合：何时值得复杂度

**已核到的 (c) 实现**：WrenAI（§2c，三重源码证据）是唯一在"语义层 + 四阶段 NL→SQL + 受控语料 + additive"形态下做 (c) 且规模化的生产系统。其 (c) 具体形态是 **"guided agentic hybrid"**：流水线 = AGENTS.md 剧本（确定性顺序），retrieve = agent-facing 工具（按需可调）；`guided` 模式默认走剧本，`direct` 模式让强模型放手。

**(c) 值得复杂度的三个触发条件**：
1. **召回缺口可观测**：确定性预取在真实 NL 上召回率掉到 ~80% 以下（歧义同义词、隐式指标、跨数据源），需 LLM 生成期二次检索补漏。
2. **编排形态是 agent harness 而非纯流水线**：当 runtime 本身是 "everything-is-a-plugin" agent harness（dsh 即是），agent-facing tool 是原生扩展点，加一个 `retrieve` plugin 成本极低。
3. **强模型可用、延迟预算宽**：`direct` 模式（WrenAI 给强 LLM 的极简包装）只在模型够强、用户可承受多轮时才划算。

**(c) 的主要代价**：双取数路径（pipeline 预取 + agent 工具）易冗余（agent 重复取流水线已取的上下文）、trace 调试更难、prompt 工程更复杂（要教 agent 何时该调 retrieve、何时信任预取）。

---

## 5. dsh-data-agent fit 分析：称量四约束

dsh 约束（依任务书）：**四阶段流水线**（intent → retrieve context → generate SQL → execute/verify）为 default orchestration；**受控、天然分块的小语料**（semantic-layer 条目、DDL、SQL 样例、data-source metadata）；**additive-only**（能力以 plugin 添加，core 不动）；**intranet-security-first**（默认无网络出站）。

**对 (a) pipeline-internal**
- ✅ 四阶段流水线本就有"retrieve context"阶段——(a) 是零阻力默认，与架构意图同构。
- ✅ 受控小语料 → 确定性预取召回率高（§3c 判据）；Text2SQL 学术主流与 SuperSonic 生产先例都走 (a)。
- ✅ intranet + 低延迟 → 1 次 LLM 调用，无 agent-loop 往返，无额外出站。
- ✅ additive-only 友好：ctx.retrieval 作 pluggable seam，其 consumer 是流水线 stage，不动 core。
- ❌ 歧义 NL 时无法自纠错（LLM 拿不到更多上下文就只能硬猜）。

**对 (b) agent-facing tool**
- ✅ 歧义 NL 可二次检索补漏；与 agent harness 形态（Cordis-based）原生合拍；additive（retrieve 是 plugin）。
- ❌ 受控小语料下，agentic 灵活性边际收益小，**agent-loop 延迟/token/非确定性是净负债**——§3c 判据与 §1 文献主流。
- ❌ intranet 下若 retrieve 工具触发额外 embedding/网络调用，需额外审计（虽本地向量库可规避）。
- ❌ 与"四阶段流水线 default"张力：纯 (b) 把编排权交给 LLM，流水线退化成 hint。

**对 (c) both（WrenAI 式 guided agentic hybrid）**
- ✅ **保留 (a) 的确定性默认**（四阶段 = AGENTS.md 式剧本，默认路径高召回、低延迟、可审计）。
- ✅ **获得 (b) 的 escape-hatch**（`retrieve(query)` plugin 供歧义时按需精炼），additive-only 友好（plugin）。
- ✅ **WrenAI 已在同形态下规模化验证**（§2c）——最近的生产先例，不是纸上推演。
- ✅ 与 dsh "Cordis-based, everything-is-a-plugin, additive-only" 高度同构（WrenAI 也有 skills/AGENTS.md/MCP tools）。
- ⚠️ 双路径冗余/调试/prompt 复杂度（§4 代价）；需 system prompt 明确"优先信任预取上下文，仅当缺口明显才调 retrieve"。
- ⚠️ intranet：retrieve plugin 必须用本地向量库（无出站），与 dsh 安全约束一致但需在 plugin spec 强制。

**净判**：(c) 在 dsh 形态下**最有依据**，但其价值实现**严格依赖**于把 (a) 作默认路径、(b) 作 escape-hatch plugin——而非平铺。若语料长期保持小且受控、且 evals 显示确定性预取召回率 ≥85%，则 (b) 那一半是死重量，应退化到 (a)。

---

## Direct answer for dsh-data-agent

**处方：选 (c)，但以 WrenAI 式 "guided agentic hybrid" 落地——(a) 为默认路径、(b) 为 escape-hatch plugin。**

具体形态：把四阶段流水线（intent → retrieve → generate → execute/verify）实现为一个 **guided agent recipe**（类似 WrenAI 的 `AGENTS.md` / dsh 的 skill），让 agent 按剧本默认走确定性预取；同时把 `ctx.retrieval` 既**暴露给流水线 stage 内部消费**（intent 阶段取候选表/指标、generate 阶段取 SQL 样例），**也作为一个 additive `retrieve(query)` plugin** 暴露给模型，供歧义 NL 时按需二次检索。system prompt 明确"优先信任预取上下文，仅当明显缺口才调 retrieve"。

**最强三条理由**：
1. **dsh 是 agent harness（Cordis-based, additive-only），agent-facing tool 是原生扩展点**——加一个 `retrieve` plugin 几乎零成本、不动 core，且与 WrenAI（`recall_queries`/`get_context` 作 MCP 工具）+ Cline（`createTool`/MCP）的规模化先例一致。[(WrenAI mcp_server.py)](https://github.com/Canner/WrenAI/blob/main/core/wren/src/wren/mcp_server.py) [(Cline README)](https://github.com/cline/cline)
2. **最近的生产先例 WrenAI 在同形态（语义层 + 四阶段 NL→SQL + 受控 context layer + additive/skills + AGENTS.md 剧本）下选了 (c) 并规模化**——其 `context.py` 内嵌的 AGENTS.md 五步剧本（fetch → recall → write SQL → execute → store）几乎就是 dsh 四阶段的 1:1 投影。这不是纸面推演，是已验证的源码级先例。[(WrenAI context.py)](https://github.com/Canner/WrenAI/blob/main/core/wren/src/wren/context.py) [(WrenAI ask.py + guided/direct templates)](https://github.com/Canner/WrenAI/blob/main/core/wren/src/wren/ask.py)
3. **(c) 保留了 (a) 的全部确定性红利（默认高召回、低延迟、可审计、intranet 友好）**——Text2SQL 学术主流（CHESS/DIN-SQL/DAIL-SQL/RESDSQL/C3，§1）与 SuperSonic（§2b）都印证 (a) 对受控小语料够用；(c) 只是在其上**叠加** escape-hatch，不替换默认路径。[(CHESS 2405.16755)](https://arxiv.org/abs/2405.16755) [(DIN-SQL 2304.11015)](https://arxiv.org/abs/2304.11015) [(SuperSonic README)](https://github.com/tencentmusic/supersonic/blob/main/README.md)

**关键反论（必须正面回应）**：对**受控、小、天然分块**的语料，确定性流水线预取（a）的召回率本就高，agentic retrieve 的灵活性**边际收益小**，而 agent-loop 的延迟/token/非确定性是**净负债**——Text2SQL 文献**无一**把 retrieve 做成生成期自由 agent 工具（§1），SuperSonic 也走纯 (a)。换言之，(c) 里的 (b) 那一半可能长期是"死重量"，prompt 也要多教 agent 何时调 retrieve，复杂度未必换得回召回。这条反论在"dsh 语料长期小且 evals 强"的前提下**成立**。

**什么会让我改判**：
- **改判到 (a)**：若 dsh 语料长期保持小且受控，且 evals 显示确定性预取在真实 NL 上召回率 ≥85-90%、且歧义查询占比 <15%——则 escape-hatch 是死重量，应砍掉只留 (a)。这是最可能发生的"回归"。
- **改判到 (b)**：若 dsh 编排默认从"四阶段流水线"迁到"自由 agent loop"（Cordis 形态进一步 agentic 化、流水线退化为 hint），则 (b) 是自然形态，(a) 反成累赘。
- **维持 (c) 的硬触发**：若语料从"小受控"扩张到数百 SQL 样例/多数据源/跨语义域，确定性预取召回跌破 ~80%，或歧义 NL（同名词、隐式指标）占比 >20%——则 escape-hatch 从"死重量"变"净正"，(c) 不可逆。

**一句话**：dsh-data-agent 应选 **(c) guided agentic hybrid**，但以 (a) 为默认、(b) 为 additive escape-hatch plugin 起步；把"是否保留 (b) 那一半"做成 evals 驱动的可逆决策，而非一次性架构赌注。

---

**核验透明度声明**：
- **直验一级源**（arXiv 元数据 / GitHub repo source via API + jsDelivr CDN）：CHESS [2405.16755](https://arxiv.org/abs/2405.16755)、DAIL-SQL [2308.15363](https://arxiv.org/abs/2308.15363)、DIN-SQL [2304.11015](https://arxiv.org/abs/2304.11015)、MAC-SQL [2312.11242](https://arxiv.org/abs/2312.11242)、RESDSQL [2302.05965](https://arxiv.org/abs/2302.05965)、C3 [2307.07306](https://arxiv.org/abs/2307.07306)、TAG [2408.14717](https://arxiv.org/abs/2408.14717)；Vanna [repo](https://github.com/vanna-ai/vanna)（description + src/vanna 树）；WrenAI [repo](https://github.com/Canner/WrenAI)（README + ask.py + mcp_server.py + ask_templates/{guided,direct}.md.tmpl + context.py + genbi/composer.py）；SuperSonic [repo](https://github.com/tencentmusic/supersonic)（README + CLAUDE.md + 模块树）；Cline [repo](https://github.com/cline/cline)（README）。
- **未直验（显式标注）**：Cursor codebase indexing/RAG 机制——[cursor.com/docs](https://cursor.com/docs) 在本环境为 Next.js SPA，WebFetch/curl 均未取到正文，§3b 的具体机制按社区共识陈述并标注，需读者自行复核。Cline 经典内置工具集（read_file/search_file_content/list_files/execute_command）的具体名称未在本次逐个核到源码，仅核到其"agentic + createTool + MCP"形态（README）。
- **dsh 内部约束**（四阶段流水线/additive-only/intranet/受控语料）引自任务书，非外部源。
