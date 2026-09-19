# R10 Session Prompt — Token/Attention/Cache 优化前沿调研

## 任务

处理 wayfinder map（`wayfinder/semantic-layer/map.md`）上的 open ticket R10
（Token/Attention/Cache 优化前沿调研）。这是一张 research（AFK）票，
由 `/research` subagent 驱动，产出报告到 `research/r10-token-attention-cache-optimization.md`。

## 背景

G7（Context Projection 统一接口）已于 2026-08-30 grilling 后关闭为 out of scope（v2+）。
关闭理由：

- `DataSourceKindPlugin<T>` 的三个投射方法中，`toPromptContext` 和 `toCriticContext`
  在生产路径零消费者。唯一被消费的是 `toCorpusItem`（BM25 检索）。
- NL2SQL 引擎通过 agent tool call 按需加载 definition JSON（`load_event_definition`、
  `load_table_dimensions`），已是按需投射模式，非 bulk injection。
- Eval 结果优秀：CL-8 100% pass rate，CL-9 91.7%（154/168）——无 token 压力。

但 grilling 过程中确认：**减少 token 使用量、提高 prompt cache 命中率、稳定 LLM
注意力窗口是持续重要的工程方向**，需要独立调研。

## 调研范围（4 部分）

### 1. Jedify 2026 benchmark 验证

Jedify（2026.08.26 发布）声称：
- Context graph 架构平均 25,036 tokens/SQL call（±6%），87% 准确率（200 graded runs）
- 传统方案 50,000–150,000 tokens/call
- "50% fewer tokens at 100%+ accuracy"

需验证：
- Semantic Fusion 的具体技术机制（预编码 → 子图投射）
- Benchmark 方法论可信度——是否存在 benchmark gaming / 非真实实验
- 主张的适用范围和限制条件

关键来源：
- https://pureai.com/articles/2026/08/26/enterprise-ai-has-a-token-problem.aspx
- https://finance.yahoo.com/technology/ai/articles/jedify-benchmark-shows-context-graphs-130000573.html
- https://jedify.com/blog/
- LinkedIn: Jedify official posts

### 2. 2026 H2 前沿研究（web search 必须）

- **Lost in the Middle**：Stanford 原论文后 2025-2026 跟进，30-40% 注意力退化在
  新一代模型（Claude 4.x / GPT-5 / Gemini 2.x）上是否改善
- **Context Rot**：context window 使用超 25% 后推理质量退化（Peter Werry / AI Engineer
  podcast 引用）——当前缓解方案
- **Context Engineering**：2026 下半年核心方向，prompt caching 策略、context budgeting、
  programmatic context management（UT-ACA 等论文）
- **Subgraph Projection / Context Selection**：从 knowledge graph / context graph
  按需投射子图的最新方案和 benchmark
- **Agentic Context Management**：agent 架构下的 token 优化（tool call vs bulk
  injection vs hybrid）
- Oracle Hybrid Retrieval 的 "context budgeting" stage 6 模式

### 3. 本系统 token 分析

关键文件：
- `packages/data/nl2sql-engine/src/prompt.ts` — `buildPrompt()`：SOP + tool catalog +
  方言规范 + 候选列表 + join 约束 + metric context
- `packages/data/nl2sql-engine/src/engine.ts` — NL2SQL 引擎主循环
- `packages/data/tool-get-definition/src/index.ts` — 返回完整 JSON
- `packages/data/tool-search-data-sources/src/index.ts` — BM25 检索
- `packages/data/semantic-layer/src/index.ts` — `loadRetrievalCorpusAll()`

需分析：
- `buildPrompt` 各组成部分的 token 占比
- Agent 多轮交互的累积 token 增长模式
- Prompt caching 命中率现状（结构稳定性）
- 与 Jedify 25K baseline 对比

### 4. 优化方案评估

基于前三部分的调研和分析，评估以下优化方向的优先级：
- 是否需要 `project()` 统一投射接口（G7 推迟的问题）
- Tool call 返回值裁剪（`get_definition` 返回完整 JSON vs 按需字段）
- CorpusItem 描述文本压缩
- Prompt 模板结构优化（提高 cache 命中率）
- Context budgeting 机制（token 预算分配）

## 产出

- 报告：`wayfinder/semantic-layer/research/r10-token-attention-cache-optimization.md`
- 如有具体优化建议，标注优先级和预估收益
- 如结论指向需要 plugin 层统一投射接口，建议重新开 G7

## 执行方式

1. Claim R10 ticket（更新 Assignee）
2. 用 `/research` skill 执行调研（web search 必须包含 2026 H2 前沿）
3. 本系统 token 分析部分直接读代码计算
4. 产出报告到 `research/r10-token-attention-cache-optimization.md`
5. 关闭 R10 ticket，更新 map Decisions-so-far
