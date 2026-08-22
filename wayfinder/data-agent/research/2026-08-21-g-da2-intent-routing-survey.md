# G-DA2 意图/置信路由调研 — 2026-08-21

> `/research` 子代理（general-purpose）外部调研 + dsh 约束核证。机制决策（乙 / 丙 / 变体）**待 grill 定稿**——本笔记落 survey（稳定）+ 乙′ 提案（标注 pending）。
> 子代理 web 工具降级（WebFetch 被网关拦、WebSearch 多为 LLM fallback），但 bing MCP 搜出真实可引结果；dsh 5 文件（`phase-gate.ts`/`types.ts`/`tool-search-data-sources/src/index.ts`/`agent.cordis.yml`/`cordis.patch.yml`）全读、约束逐条核证。

## 调研结论（survey-level，强）

**业界无生产 NL2SQL/data-agent 用「入口确定性意图分类器」（方案丙）。** 最接近的生产对标 **Databricks Genie** 用方案乙形态：**生成流内的 3 态自评**（answerable→SQL / ambiguous→clarify / unanswerable→decline），以语义模型作「可答性」的确定性边界。原文引述："Genie evaluates the instruction and determines whether it is answerable, ambiguous, or unanswerable. If ambiguous → clarifying question. If unanswerable → declines rather than guesses."

- 「分类」在研究里（DIN-SQL）= **查询复杂度路由**（simple/moderate/complex 选生成策略），**非 chitchat 意图**——这是常见混淆点。
- 「置信度」（CHASE-SQL 多路候选选优、BIRD selective prediction）= **生成后/执行后**，非 pipeline 前置。
- 生产鲁棒性真正靠三件：(a) 语义模型/检索作可答性边界（确定性 grounding 信号）、(b) 执行反馈环（确定性）、(c) 生成 LLM 经**响应形状**自路由（Cortex Analyst 的 text/sql/suggestions/error 内容块）。= 乙的架构，非丙。
- Vanna = dsh 当前坏状态的同款（无意图分类、无置信、无 clarify/abstain，假设输入都是 SQL 问题、强制生成）——佐证此痛普遍。

## 乙 / 丙 优缺点

### 乙（rbi 机制 + gate 最小回退）
- **优**：对齐 Genie（有据）；additive + 插件化；与 D2c/P4c 无关（空语料时回退即触发=当前正确行为，D2c 挂载后获 `no_strong_match` 信号，前向兼容不重写）；无额外 LLM 调用；可答性按 **grounding 问题**处理（检索后判，非前置瞎猜）。
- **缺**：自由文本自评对 prompt 不合规脆弱（模型可自评 high 进垃圾——回退只兜 high+空，**兜不住 high+噪声**）；mid 路径今天**无 enforcement seam**（`present_clarification` 未 ship，自由文本不可靠解析「模型选了 clarify」）；不短路明显闲聊（每条问候白跑一次检索 + UNDERSTANDING 推理）。

### 丙（入口确定性分类器）
- **缺（决定性）**：业界无生产系统这么做；**LLM 分类器与乙自评同款 prompt 不合规失败**（只是前移——为成本不买真鲁棒性）；规则式脆（误封含问候词的真数据 query / 漏新闲聊）；embedding 式需标注语料（dsh 没有，D2c 前空）；**前置无检索上下文地猜可答性**（Genie/Cortex 证可答性是 grounding 问题，pre-retrieval 分类器在瞎猜）；每轮额外 LLM 调用（热路径加延迟）；违 additive/minimal ethos。

## 更优变体：乙′（乙的硬化，仍在乙哲学内，pending grill）

**乙′ = 乙 + (1) 结构化 route enum（融进既有 UNDERSTANDING LLM 调用，零额外调用）+ (2) 保守确定性闲聊前置过滤 + (3) 检索回退作承重确定性信号。**

1. **结构化 route enum**：模型 emit `【route:proceed|clarify|decline】` token（像既有 `INCOMPLETE_MARKER`/`【未完成】` 正则一样可解析）→ gate 在 `clarify` 上 HALT、在 `decline` 上 `honest_decline`，**无需 prose 解析、无需 `present_clarification`**（未 ship）。闭合乙的 mid-enforcement + 自由文本脆弱两缺口，零额外 LLM 调用。= 纯自评（乙）与独立分类器（丙）的**真中间地带**：拿路由收益、不付额外调用。
2. **保守闲聊前置过滤**：入口极小正则/关键词 guard，**仅短路高 precision 模式**（问候/感谢/meta-about-agent）→ 直答文本；其余全 fallthrough 到自评。假阴性落自评+回退（无害），假阳性靠高 precision 规避。= 丙里唯一值得拿的一块，去掉 LLM 调用；embedding 式留待 D2c 后语料存在。
3. **检索回退（承重）**：`forcedLoad` 后若 `candidate_tables` 仍空 **且** 模型未 emit `clarify`/`decline` → 强制 `honest_decline`。prompt 不合规的兜底（模型说 proceed 但检索空）。**与 (1) 同批落地**（见下反驳处理）。

## 推荐：乙′（pending grill 定稿）

**最强反驳**：结构化 route 仍是 prompt 自评，不合规模型可 emit `proceed` on garbage → 乙′ 不比丙更鲁棒地拦坏 turn。
**为何不改变推荐**：正因为如此，**检索回退（层 3）承重，必须与结构化 route 同批落地**——它把模型 `proceed` 在检索空时转成强制 `honest_decline`。残余失败收窄到：*模型 proceed 且 检索返回非空噪声 且 生成垃圾 SQL*——这是**检索质量问题（D2c 域）**，下游 GENERATION gate（`sql_syntax_gate` + critic confidence floor + `candidate_tables`/`event_params` 校验，已在 `generationGate`）接住。丙也修不了检索噪声（它前置运行看不到噪声）。调研（Genie 的 grounding-boundary 可答性、BIRD 的执行后置信）佐证：鲁棒性来自 grounding + 执行信号，非入口分类器。

## 源

- **live-verified**：Databricks Genie architecture（[MS Learn](https://learn.microsoft.com/en-us/azure/databricks/genie/genie-architecture) + [Databricks docs](https://docs.databricks.com/aws/en/genie/genie-architecture) + [deep dive blog](https://www.databricks.com/blog/databricks-ai-bi-genie-deep-dive)）；[AmbiQT (EMNLP 2023)](https://aclanthology.org/2023.emnlp-main.436/)；[Agentic-SQL taxonomy (arXiv 2608.15389)](https://arxiv.org/abs/2608.15389v1)；[Atlan](https://atlan.com/know/ai-agent/data-for-ai/text-to-sql-with-ai/) / [Cube](https://cube.dev/articles/semantic-layer-for-ai-agents-2026) / [LinkedIn](https://www.linkedin.com/pulse/stop-dumping-ddls-prompts-how-we-built-secure-llm-powered-arun-r-fuonc) 生产痛点文；[Sema4.ai Cortex Analyst template](https://sema4.ai/docs/team-edition/templates/template-analyst)；[Snowflake context-layer blog](https://www.snowflake.com/en/blog/snowflake-internal-context-layer-for-ai-agents/)；Vanna（[guvi.in](https://www.guvi.in/blog/generate-sql-with-ai/) / [DataPilot](https://github.com/Gloria119/DataPilot)）。
- **canonical（未 live-fetch，架构据既有公开知识）**：[Vanna repo](https://github.com/vanna-ai/vanna) / [Dataherald repo](https://github.com/Dataherald/dataherald) / [Cortex Analyst docs](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst) / MAC-SQL、DIN-SQL、[BIRD](https://bird-bench.github.io)、CHASE-SQL（arXiv）。
- 设计结论依赖 **Genie（强）+ 业界无丙（survey-level）**，不依赖弱源。
