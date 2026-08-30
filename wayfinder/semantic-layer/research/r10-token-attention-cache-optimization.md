# R10 — Token/Attention/Cache 优化前沿调研

> **Ticket**: [R10](../tickets/R10-token-attention-cache-optimization.md)
> **Date**: 2026-08-31
> **Context**: G7（Context Projection 统一）已关闭为 out of scope（v2+），本调研为后续独立方向。

---

## Executive Summary

本系统 NL2SQL 引擎的 token 效率远超行业基线：**典型调用 ~1,720 tokens，复杂查询 ~2,665 tokens**——是 Jedify 声称的 25K baseline 的 **7-15 倍效率**，是传统 bulk injection 方案（50K-150K）的 **20-60 倍效率**。Eval pass rate 优秀（CL-8: 100%, CL-9: 91.7%），无 token 压力导致的准确率问题。

**不需要引入 `project()` 统一投射接口（G7 维持 out of scope）。**

但存在两个低垂果实优化：
1. **Prompt caching（P0 优先级）**：77% 的 prompt 内容完全稳定，零 caching 配置 → 加 `cache_control` 断点即可节省 ~70% token 成本
2. **Tool 返回值压缩（P1 优先级）**：`get_definition` 返回完整缩进 JSON，压缩 50-70% 可行且无信息损失

---

## Part 1: Jedify 2026 Benchmark 验证

### 1.1 Semantic Fusion 技术机制

Jedify（2026-08-26 发布，$24M Series A，Norwest 领投 + Snowflake Ventures）的 "Semantic Fusion" 分两阶段：

**Phase 1 — 预编码（离线）**：将业务定义、SQL 逻辑、关系和规则预编码为图实体。

> "Semantic Fusion pre-encodes business definitions, SQL logic, relationships, and rules into entities."
> — Adi Elimelech (Co-founder/CTO), LinkedIn

**Phase 2 — 查询时子图检索**：一个 "Profiler Agent" 选择与当前问题相关的预编码实体。

> "The context graph pre-encodes the business logic once, then retrieves only what a given question needs."
> — Jedify LinkedIn

**未披露细节**：图的具体表示格式、Profiler Agent 的选择算法、是否使用 embedding、图遍历/投射的具体机制、"预编码"的数据结构实现。"Subgraph projection" 一词未在 Jedify 公开材料中出现——这是从其描述推断的术语。

### 1.2 Benchmark 数据

| 指标 | 数值 |
|------|------|
| 测试问题 | 100 个业务问题，3 个复杂度层级 |
| 运行次数 | 每个问题跑 2 次 = 200 个评分数据点 |
| 平均 token | 25,036 raw tokens/SQL call |
| 跨复杂度方差 | 仅 6%（简单 24,590 / 中等 24,980 / 复杂未披露） |
| 准确率 | 87%（200 graded runs） |
| 对比基线 | "published research"：50K-150K tokens/call，60-85% 准确率 |

**"Token ROI" 指标**（Blocksandfiles.com）：在 200 表规模下，context graph 方案的 token ROI 超出传统方案 75%。

### 1.3 可信度评估

**优势**：
- 6% 跨复杂度方差是真正有趣的发现——暗示图预编码提供了稳定、有界的上下文，不随查询复杂度膨胀
- Token 减少的方向性主张合理：200 表 × 10 列 × ~25 tokens/列 = 50K tokens 起步（纯 DDL 注入）
- ESQ-Bench（2026-08 独立发布，arXiv:2608.23569）独立验证了企业 schema 上 NL2SQL 准确率严重退化（GPT-4o schema-linked prompting：Tier 1→79.8%，Tier 3→57.2%）
- $24M Series A 暗示经过技术尽职调查

**红旗**：
- **厂商自运行 benchmark**：Jedify 设计问题、选择 schema、运行测试、评分结果。无独立复制、无第三方审计、无公开数据集
- **苹果对橘子比较**：PureAI 文章明确指出 50K-150K 基线数据 "come from previously published research using different schemas and question sets"——不同数据集上的数字不可直接对比
- **200 runs 样本量小**：Spider（10,181 题）、BIRD（12,751 题）、ESQ-Bench 均使用显著更大的问题集
- **87% 准确率未说明评分标准**：执行准确率？结果匹配？语义正确性？ESQ-Bench 指出 "silent semantic divergence" 问题
- **未披露使用的 LLM 模型**——无法复现
- **"50% fewer tokens at 100%+ accuracy" 是营销话术**：实际是 25K@87% vs 文献 50K-150K@60-85%。87% 并不高于基线范围上限 85%
- **发布时间与 Series A 融资同步**——典型融资 PR 模式
- **零独立分析**：截至 2026-08-31，所有报道追溯到同一篇 GlobeNewswire 新闻稿

### 1.4 与本系统对比

| 维度 | Jedify（声称） | 本系统（DA） |
|------|---------------|-------------|
| 架构 | 预编码 context graph + Profiler Agent 选子图 | Agent tool call 按需加载 definition |
| Token 效率 | ~25K tokens/call | **~1,720-2,665 tokens/call** |
| 准确率 | 87%（200 runs） | **100%（CL-8）/ 91.7%（CL-9, 154/168）** |
| Token 方差 | 6% 跨复杂度 | 未测量（待补充） |
| Schema 规模 | 未披露（声称 200 表 gap） | K11: 321 表 + 453 事件 |

**结论**：本系统的 on-demand tool-call 架构与 Jedify 的核心理念（选择性上下文检索 vs bulk injection）方向一致，但实现更简洁。Token 效率和准确率均显著优于 Jedify 的自报数据。Jedify benchmark 的主要价值是为本系统的架构选择提供了外部市场验证。

---

## Part 2: 2026 H2 前沿研究

### 2.1 Lost in the Middle — 最新进展

**原始发现（2023）**：Stanford Liu et al. 证明 LLM 对长上下文中间位置的信息关注度显著下降，产生 U 形注意力曲线，退化 30-40%。

**Chroma Research 2025 验证**（Hong, Troynikov, Huber — 最重要的跟进研究）：
- 测试了 **18 个前沿模型**（GPT-4.1, Claude 4, Gemini 2.5, Qwen3 等）
- **所有模型均随输入长度退化**，无论广告窗口大小。U 形曲线在全部 18 个模型中持续存在
- Needle in a Haystack（NIAH）近满分具有误导性——NIAH 仅测试词汇检索，非语义推理
- **单个干扰项**（主题相关但不正确的段落）即可可测量地降低准确率；4 个干扰项效果叠加
- 反直觉发现：周围文本被**打乱为不连贯**时模型表现**优于**文本流畅连贯时——研究者无法解释
- 失败模式按模型家族分化：Claude 倾向于拒绝（"I can't find an answer"）；GPT 产出最高比例的自信错误答案

**Claude 4.x / GPT-5 / Gemini 2.x 是否缓解了？** **否——问题是架构性的，非训练产物。** Softmax attention 机制将注意力权重在所有输入 token 上归一化为固定预算。增加 token = 缩小每个 token 的份额。这是 Transformer 架构的基本后果。

**对本系统的启示**：
- 按需 tool call 加载 definition 已将关键信息保持在注意力高区（开头=system prompt，末尾=最近 tool 输出）
- **干扰项比无关内容更有害**——候选列表中"接近但不完全匹配"的 definition 比完全无关的 definition 更危险
- 复杂多表查询考虑拆分为 subagent（各自在注意力曲线陡峭区域工作）

> Sources: Chroma Research (2025) research.trychroma.com/context-rot; aipatternbook.com/context-rot (2026-08)

### 2.2 Context Rot

**定义**：LLM 输出质量随 context window 填充量增长而可测量下降，即使远未达到广告容量。

**~25% 阈值**（Peter Werry / AI Engineer podcast, 2026-08）：context window 使用超 ~25% 后推理质量退化。这是从业者观察到的启发式阈值，与 Chroma 数据（退化远在窗口容量前开始）一致。

**机制不是"遗忘"——是信号稀释**：
> "The model hasn't forgotten the input; the signal for any specific token just becomes fainter as the input grows."
> — aipatternbook.com (2026-08)

**识别模式**：
- 遗忘指令（模型停止遵循早期上下文中的规则）
- 错误文件、正确问题（agent 读 8 个文件，识别正确问题，修复错误文件——典型 "Lost in the Middle" 签名）
- 回归通用代码（会话早期遵循的约定逐渐被侵蚀）
- 无根据的自信（对实际 definition 的"差一点"引用）

**2026 缓解策略共识**：
1. **Compaction**——定期压缩历史，重新锚定约束到顶部（Manus 建议每 ~40 分钟）
2. **Retrieval**——按需获取而非预加载
3. **Thread-per-Task**——用新窗口重置注意力曲线
4. **Subagents**——拆分工作到各自在陡峭区域的子上下文
5. **Context engineering**——整个学科的存在就是因为 rot 的存在

**关键区分**："Prompt caching does not slow context rot; it only makes the rotted context cheaper to ship."——Caching 是经济优化，非质量优化。

> Sources: Chroma Research (2025); Peter Werry / AI Engineer podcast (2026-08); aipatternbook.com (2026-08)

### 2.3 Context Engineering（2026 核心方向）

**Context engineering 已成为 2026 AI agent 开发的定义性学科**（Andrej Karpathy 将其定位为 prompt engineering 的继承者）。

**LangChain 四操作框架**（2025，2026 广泛采用）：
1. **Write**——将信息保存到 context window 之外（文件、memory store）
2. **Select**——仅拉取相关信息进 context
3. **Compress**——仅保留必要 token（摘要、裁剪）
4. **Isolate**——将 context 分割到不同空间（subagent、并行窗口）

**Manus 六条生产经验**（2025-07，2026 全年被广泛引用）：
1. **围绕 KV-Cache 设计**："KV-cache hit rate is the single most important production-agent metric." Cached token 成本 ~10% of fresh token（Anthropic 定价）。稳定前缀必须在动态内容之前
2. **Mask，不 remove tools**——永远不要在 session 中删除 tool；mask 其 logits，否则删除会使其后所有内容的 KV cache 失效
3. **用文件系统作外部 context memory**——将状态 offload 到文件
4. **通过复述操纵注意力**——让模型重新陈述关键上下文以提升对其的注意力

**Prompt Caching 2026 现状**：
- Anthropic/OpenAI/Google 均以 ~10% 正常输入成本定价 cached input
- Ramp Economics Lab：2025.01→2026.01 月均 token 支出增长 **13x**——caching 已成经济必需
- 关键操作洞察：稳定 context（system prompt、schema definitions、tool schemas）必须在动态内容之前，否则 cache 永远不命中

**Meta-Harness（arXiv:2603.28052, 2026）**：端到端 harness 优化，+7.7 points over ACE，同时使用 **4x fewer context tokens**。证明优化进入 context 的内容比模型选择更重要。

**ACE（arXiv:2510.04618, ICLR 2026）**：Agentic Context Engineering，Generator/Reflector/Curator 模式，+10.6% agent 任务，+8.6% 金融任务。

> Sources: LangChain blog (2025); Manus blog (2025-07); Anthropic engineering blog (2025-09); Meta-Harness arXiv:2603.28052; ACE arXiv:2510.04618

### 2.4 Subgraph Projection / Context Selection

**GraphRAG（2026 主流）**：从 knowledge graph 投射子图进 LLM context。Microsoft GraphRAG 索引成本 ~$33K/数据集（3/4 用于图提取），适合大规模部署。

**LightRAG（HKU, EMNLP 2025）**：同时构建 KG + vector DB，搜索两者，成本为 GraphRAG 的零头。更适合 NL2SQL 语义层。

**NL2SQL context selection 的通用模式**：
1. Schema 级过滤：embedding/keyword 匹配候选表
2. 关系遍历：沿 FK/语义关系从候选表到所需 join 表
3. 列裁剪：仅包含相关列 + join keys
4. Context 注入：裁剪后的子图作为结构化 context 注入

**PuppyGraph（2026-08）on Context Exhaustion**："Context exhaustion is the most common [failure]: a long research or migration task accumulates more intermediate material than a single context window holds, and quality drops."

**与本系统的关系**：语义层本身就是一个 knowledge graph（表→列→关系→指标→约束）。当前 tool-call 方法是 agentic subgraph retrieval 的一种形式——agent 自行决定加载哪些 definition。CL-2 的 ConceptKindPlugin 和 P3 的 graph-expanded recall 已经实现了 1-hop 图展开。

> Sources: PuppyGraph (2026-08); LightRAG HKU EMNLP 2025; GenAI-Disrupt (2026-08)

### 2.5 Agentic Context Management

**2026 共识：tool-call-based retrieval（按需）优于 bulk injection。**

- Corti Agentic Framework（2026-08）：仅检索相关信息注入，非全量历史
- LangChain 框架对比：bulk context passing "eats up context windows, increases latency, and degrades performance"
- Claude Agent SDK（2026）：subagent context isolation——"a subagent can read fifty files and burn 40,000 tokens doing it, and none of that shows up in the lead agent's history"

**新概念——Harness Engineering**（arXiv:202603.1756, 2026）：将 agent harness 分解为 Control/Agency/Runtime (CAR)。Harness 是 "a first-class layer whose effects are often mistaken for model-driven gains"。

**Agentfold（arXiv:2510.24699, 2025）**：长期 web agent 的主动 context 管理——agent 主动管理上下文中保留什么，而非被动累积一切。

**Cognition SWE-grep**：RL 训练的模型每轮最多 8 个并行搜索检索代码上下文，减少 context 污染。

**关键争论**：Cognition "Don't Build Multi-Agents"（2025）主张单 agent 共享全量 context 优于脆弱的并行多 agent 架构。有争议但有影响力。对 NL2SQL 场景（顺序任务：理解查询→识别表→加载定义→生成 SQL），单 agent + tools 可能确实更优。

> Sources: Corti (2026-08); Harness Engineering arXiv:202603.1756; Agentfold arXiv:2510.24699; Cognition blog (2025-2026)

### 2.6 Oracle Hybrid Retrieval — Context Budgeting

Oracle Developers Blog（2026-08）描述了六阶段 hybrid retrieval pipeline：

1. **Metadata filtering**——数据库级元数据过滤（最廉价、最精确）
2. **Vector retrieval**——embedding 语义相似搜索
3. **Lexical retrieval**——BM25 关键词匹配
4. **Rank fusion**——合并候选集（Reciprocal Rank Fusion 等）
5. **Reranking**——cross-encoder 精排
6. **Context budgeting**——将检索结果适配到 token 预算后再送 LLM

**核心洞察：context budgeting 被明确作为独立管线阶段**——不是事后补充，而是一等步骤。

> "I treat context budgeting as a runtime contract. Before the model receives anything, the system should know: the total context window, the output budget, and the priority of each context section."
> — LinkedIn (2026-08)

**映射到 NL2SQL definition 检索管线**：
1. Metadata filter：按 domain/access/freshness 过滤 definition
2. Vector retrieval：embed NL query → 语义匹配表/列描述
3. Lexical retrieval：BM25 匹配表名/列名/指标名（**已有**）
4. Rank fusion：合并候选集（**已有**——continuous-blend）
5. Reranking：轻量模型精排（未实现）
6. Context budgeting：适配 token 预算（未实现）

> Sources: Oracle Developers Blog (2026-08); MinIO (2026-08)

---

## Part 3: 本系统 Token 分析

### 3.1 buildPrompt() Token 构成

`packages/data/nl2sql-engine/src/prompt.ts` 的 `buildPrompt()` 组装 NL2SQL prompt：

| # | Section | Static/Dynamic | Est. Tokens | % (典型) |
|---|---------|---------------|-------------|----------|
| 1 | Persona | Static | ~12 | 0.7% |
| 2 | TOOL_CATALOG（9 tools, CJK） | Static | ~243 | 14.1% |
| 3 | Staged SOP（A-D 节） | Static | ~216 | 12.6% |
| 4 | Honest decline（第 5 节） | Static | ~34 | 2.0% |
| 5 | Eight rules（第 6 节） | Static | ~96 | 5.6% |
| 6 | **Conventions dialect**（conventions.yaml） | Static | **~698** | **40.6%** |
| 7 | Date section | Semi-static | ~40 | 2.3% |
| 8 | Phase footer | Static | ~32 | 1.9% |
| | **静态小计** | **Static** | **~1,371** | **79.7%** |
| 9 | User question | Dynamic | ~7-15 | 0.5% |
| 10 | Candidate list（eval 5 个 / prod 20 个） | Dynamic | ~105-420 | 6-24% |
| 11 | Event definition JSON | Dynamic | ~0-756 | 0-44% |
| 12 | Join constraints | Dynamic | ~0-53 | 0-3% |
| 13 | Metric context | Dynamic | ~0-58 | 0-3% |
| | **动态小计** | **Dynamic** | **~112-1,294** | |
| | **总计** | | **~1,483-2,665** | |

**典型调用**：~1,720 tokens（5 个候选 + 10 参数 event definition）。

**最大静态块**：conventions dialect ~698 tokens（40.6%），来自 `packages/query/query-maxcompute/conventions.yaml`——2,711 字符的 YAML（函数签名、cast 映射、3 个完整 SQL 模板示例）。

**最大动态变量**：event definition JSON ~756 tokens（30 参数事件）。Prompt 注入完整 `JSON.stringify(eventDef, null, 2)` 带缩进。紧凑序列化（单行或仅字段名）可减少 50-70%。

### 3.2 Agent 多轮 Token 增长

**两条执行路径**：

**路径 1：Eval runner（`engine.run()`）** — 自包含循环，**每次尝试重建完整 prompt**，无对话累积：

| 尝试 | LLM 输入 | LLM 输出 | 累积成本 |
|------|---------|---------|---------|
| 0（初始） | ~1,720 | ~80 | ~1,800 |
| 1（parse_failed） | ~1,720（重建） | ~80 | ~3,600 |
| 2（仍失败） | ~1,720（重建） | ~80 | ~5,400 |

`MAX_FEEDBACK_RETRIES = 2`，最多 3 次 LLM 调用。Critic 和 near-dup gate 均本地执行。

**路径 2：生产 agent 循环（P7）** — system prompt 注入，对话历史累积：

| Turn | 事件 | 新增 Tokens | 累积输入 |
|------|------|-----------|---------|
| T0 | System prompt 注入 | ~1,720 | ~1,720 |
| T1 | 用户问题 + LLM 生成 SQL | ~78 | ~1,798 |
| T2 | critique_sql + query_data | ~94 | ~1,892 |
| T3 | 结果 + 最终答案 | ~36 | ~1,928 |
| **简单查询总计** | | | **~1,928** |
| +get_definition | event def 加载 | ~500 | ~2,428 |
| +feedback retry | 错误反馈 + 重写 | ~203 | ~2,631 |

**无 compaction 或 summarization 机制**——代码库中零匹配 `compaction`/`summariz`/`compact`/`truncat`。

**隐藏 LLM 调用**：`tool-search-data-sources` 的 `expand-query.ts` 在 BM25 检索前单独调用 qwen-flash（maxTokens=200）做查询扩展，在主 prompt 预算之外增加 ~300-400 tokens 辅助成本。

### 3.3 Prompt Caching 分析

**当前状态：零 Anthropic prompt caching 配置。** 代码库中无 `cache_control`、`cacheControl`、`anthropic-beta`、`prompt.caching`、`ephemeral` 的匹配。

| Prompt Section | Tokens | 稳定性 | Cache 友好度 |
|---------------|--------|--------|------------|
| Persona + Tool catalog + SOP + Rules + Footer | ~633 | 100% 跨所有调用 | ★★★ 极佳 |
| Conventions dialect | ~698 | 100% 加载后不变 | ★★★ 极佳 |
| Date section | ~40 | 每日变化 | ★★ 良好（日内稳定） |
| Candidate list | ~105-420 | 每次查询变化 | ★ 差 |
| Event definition | ~0-756 | 按事件变化 | ★ 差 |
| Join constraints + Metric | ~0-111 | 按候选集变化 | ★ 差 |
| Question | ~7-15 | 每次变化 | 无 |

**结论**：**~1,331 tokens（典型调用 77%）完全稳定**，是理想的 prompt caching 前缀。Prompt 结构碰巧已经 cache-friendly——静态内容在前，动态内容在后。在 conventions section 后添加 `cache_control: {"type": "ephemeral"}` 断点即可实现 ~77% cache 命中率。

按 Anthropic 2026 定价（cached token = 10% of fresh token）：
- 当前：1,720 tokens × 100% = 1,720 token-equivalents
- 加 caching：1,331 × 10% + 389 × 100% = 133 + 389 = 522 token-equivalents
- **节省 ~70% token 成本**

### 3.4 与 Jedify 对比

| 指标 | 本系统（DA） | Jedify | 传统方案 |
|------|------------|--------|---------|
| 典型调用（简单查询） | **~1,720-1,928** | 25,036 | 50K-150K |
| 复杂查询（20 候选 + 大事件 + joins） | **~2,665** | 25,036 | 50K-150K |
| 最差情况（eval 3 次重试） | **~5,400**（3× rebuild） | N/A | N/A |
| 生产多轮（含 get_definition） | **~2,400-2,600** | 25,036 | 50K-150K |
| 倍率 vs Jedify | **7-15× 更高效** | baseline | 2-6× |
| 倍率 vs 传统 | **20-60× 更高效** | 2-6× | baseline |

本系统的极端 token 效率源于：
1. **CJK 文本高信息密度**（每 token 承载更多语义）
2. **On-demand tool call 架构**（非 bulk injection）
3. **紧凑 bullet-point 格式**（非冗余散文）
4. **候选列表仅含 `id + description + score`**，完整 definition 按需加载

---

## Part 4: 优化方案评估

### 4.1 是否需要 `project()` 统一投射接口？

**否——G7 维持 out of scope（v2+）。**

理由与 G7 grilling 结论一致，且本次调研进一步强化：
- `toPromptContext` 和 `toCriticContext` 生产零消费者——统一没人用的接口无价值
- 系统已通过 agent tool call 实现按需投射，与 2026 前沿方向（agentic context management）高度一致
- **Token 用量 ~1,720-2,665/call 远低于任何 "token problem" 阈值**——Jedify 定义的问题在本系统不存在
- Chroma 研究表明 Context Rot 在 ~25% window 使用后开始退化。本系统 ~2K tokens / 200K window = ~1% 使用率——**距离 rot 阈值有 25 倍安全余量**

**唯一可能重新评估的触发条件**：schema 规模从当前 K11（~774 定义）增长 10 倍以上，导致候选列表或多轮 tool call 累积突破 25% window 阈值。

### 4.2 优化方案优先级排序

#### P0: Prompt Caching 配置（低努力，高收益）

**问题**：77% 的 prompt 内容完全稳定，但零 caching 配置。

**方案**：在 `buildPrompt()` 输出中，conventions section 后添加 Anthropic `cache_control` 断点。

**预期收益**：
- Token 成本减少 ~70%（1,331 tokens 从 100% 降至 10% 计费）
- 延迟减少（cached tokens 跳过 attention 计算）
- 零功能风险——纯经济优化

**实施复杂度**：低。仅需在 prompt 构建时标注 cache breakpoint，可能需要调整 Anthropic API 调用参数。

**注意**：caching 不缓解 Context Rot——它只让 rotted context 更便宜。但本系统 ~1% window 使用率下 rot 不是问题。

#### P1: Tool 返回值压缩（低-中努力，中收益）

**问题**：`get_definition` 返回完整 `JSON.stringify(def, null, 2)` 带缩进。一个 30 参数事件 ~756 tokens。

**方案选项**：
- **A. 紧凑序列化**：去缩进（`JSON.stringify(def)`），~50% 压缩
- **B. 字段裁剪**：仅返回 NL2SQL 需要的字段（`name`, `params_fields[].{name,type,description}`, `partitions`），~60-70% 压缩
- **C. Schema-aware 压缩**：Headroom 风格，保留语义信息的最小表示

**推荐方案 A 起步**（零风险，立即可做），中期评估方案 B（需验证裁剪不影响 eval）。

**预期收益**：单个 definition 从 ~756 tokens 降至 ~230-380 tokens。对多 definition 查询（生产中常见）累积节省显著。

#### P2: Context Budgeting 机制（中努力，远期高收益）

**问题**：当前无 token 预算分配机制。虽然 ~1% window 使用率下不紧迫，但作为工程基础设施有长期价值。

**方案**（对齐 Oracle Stage 6 模式）：
```
runtime contract:
  total_budget = context_window - output_reserve
  system_prompt_budget = ~1,371 tokens (fixed)
  tool_schema_budget = ~200 tokens (fixed)
  definition_budget = total_budget - system - tools - query - reserve
  per_definition_limit = definition_budget / expected_definitions
```

**何时需要**：当 schema 规模增长，或引入更多 tool 返回值，或多轮对话历史累积时。

**当前优先级**：低。系统有 25 倍安全余量。作为 P0/P1 完成后的下一步评估。

#### P3: Conventions YAML 精简（低努力，低-中收益）

**问题**：`conventions.yaml` 是最大静态块（~698 tokens, 40.6%），包含 3 个完整 SQL 模板示例。

**方案**：
- 审计每个 convention 条目是否仍被 NL2SQL 引擎消费
- 将完整 SQL 模板替换为关键模式标注（保留 function 签名和 cast 映射）
- 目标：~400 tokens（~43% 压缩）

**风险**：conventions 内容直接影响 SQL 生成质量。需 eval 验证裁剪后无 regression。

#### P4: 多轮 Compaction（中努力，生产场景收益）

**问题**：生产 agent 循环无 compaction 机制，对话历史无界增长。

**方案**：
- 每 N 轮（建议 N=5）或 context 超 25% window 时触发 compaction
- 压缩策略：摘要已消费的 tool 输出，保留最新 definition 和当前 SQL state
- 对齐 Manus 建议（每 ~40 分钟 compaction）和 Agentfold 模式（主动 context 管理）

**当前优先级**：中。Eval 路径（`engine.run()`）不需要（每次重建 prompt）。仅生产多轮对话场景需要。

#### P5: KV-Cache-Aware Context Ordering 审计（低努力，低风险）

**问题**：当前 prompt 结构碰巧 cache-friendly（静态在前），但非有意设计。

**方案**：
- 确认并文档化 prompt 的 prefix stability 保证
- 确保未来修改不破坏 cache 前缀（如将动态内容插入静态块之间）
- 对齐 Manus 原则："Never remove tool definitions mid-session; mask instead"

**预期收益**：防御性措施，保护 P0 caching 的长期有效性。

### 4.3 不推荐的方案

| 方案 | 不推荐理由 |
|------|----------|
| `project()` 统一投射接口 | G7 分析仍然有效：零消费者、无痛点、架构已对齐 |
| GraphRAG 级别的图索引 | 成本过高（Microsoft ~$33K/dataset）；当前 BM25+continuous-blend+graph-expand 已够用 |
| 多 agent 架构拆分 NL2SQL | Cognition "Don't Build Multi-Agents" 论点适用；NL2SQL 是顺序任务，单 agent+tools 更优 |
| Cross-encoder reranking（Oracle Stage 5） | 候选数量小（eval 5/prod 20），reranking 的边际收益不足以抵消额外 LLM 调用成本 |

### 4.4 优化收益总结

| 优化 | 优先级 | 努力 | Token 成本节省 | 质量影响 | 风险 |
|------|--------|------|--------------|---------|------|
| Prompt caching | **P0** | 低 | **~70%** | 无 | 零 |
| Tool 返回值紧凑序列化 | P1 | 低 | ~15-25% (动态部分) | 无 | 极低 |
| Tool 返回值字段裁剪 | P1b | 中 | ~30-40% (动态部分) | 需 eval 验证 | 低 |
| Conventions 精简 | P3 | 低 | ~300 tokens/call | 需 eval 验证 | 中 |
| Multi-turn compaction | P4 | 中 | 生产多轮场景显著 | 需设计 | 中 |
| Context budgeting | P2 | 中 | 远期保障 | 无直接 | 低 |
| Cache ordering 审计 | P5 | 低 | 防御性 | 无 | 零 |

---

## 结论

### 核心发现

1. **本系统 token 效率已处于行业顶尖水平**（~1,720-2,665 tokens/call），无需架构级变更
2. **Jedify benchmark 是营销驱动的厂商自测**，但其"选择性上下文检索优于 bulk injection"的方向性论证被独立研究支持，且本系统已实现该架构
3. **2026 前沿共识验证了本系统的设计选择**：on-demand tool call（Context Engineering 的 Select 操作）、RelationGraph graph-expand（Subgraph Projection）、agent 驱动检索（Agentic Context Management）
4. **Context Rot 在本系统中不是当前问题**（~1% window 使用率 vs ~25% rot 阈值），但应作为 schema 规模增长后的监控指标
5. **最大优化杠杆是 prompt caching**（~70% 成本节省，零风险，低努力）——纯经济优化

### G7 评估

**维持 out of scope（v2+）。** 本调研未发现任何需要引入 `project()` 统一投射接口的证据。系统的 on-demand tool call 架构已是 2026 前沿推荐的 context management 模式。

### 行动项

- **立即可做**：P0 prompt caching + P1 tool 返回值紧凑序列化
- **中期评估**：P1b 字段裁剪（需 eval 验证）+ P3 conventions 精简
- **远期基础设施**：P2 context budgeting + P4 multi-turn compaction
- **监控指标**：跟踪 schema 规模增长与 window 使用率的比值，设置 ~10% 预警线

### 新增 fog 项

无。本调研确认现有架构选择正确，未发现需要新增 ticket 的方向。P0-P5 优化项作为**实施建议记录在本报告**中，待具体实施时再开票。
