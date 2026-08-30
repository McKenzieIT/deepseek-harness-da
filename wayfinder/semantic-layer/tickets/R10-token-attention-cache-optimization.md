# R10 — Token/Attention/Cache 优化前沿调研

**Type**: research (AFK)
**Phase**: context-layer-alignment
**Status**: closed
**Assignee**: claimed
**Blocked by**: 无
**Blocks**: 无
**Related**: [G7](G7-context-projection-unification.md)（已关闭为 out of scope，本 ticket 为后续调研）、[R9](../research/r9-context-layer-frontier-audit.md)（context layer 前沿审计）

## Question

当前系统通过 agent tool call 按需加载 definition（非 bulk injection），eval pass rate 优秀（CL-8: 100%, CL-9: 91.7%）。但 token 用量优化、prompt cache 命中率提升、LLM 注意力窗口稳定性是持续重要的工程方向。

需要调研：

1. **Jedify 2026 benchmark 验证**：
   - Jedify "Semantic Fusion" context graph 的具体技术机制（预编码 → 子图投射）
   - Benchmark 数据：25,036 tokens/call（±6%）、87% 准确率（200 runs）vs 传统 50K-150K tokens
   - 是否存在非真实实验/benchmark gaming——验证方法论可信度
   - "50% fewer tokens at 100%+ accuracy" 主张的适用范围

2. **2026 H2 前沿研究**（需 web search）：
   - **Lost in the Middle 最新进展**：Stanford 原始论文后的 2025-2026 跟进研究，30-40% 注意力退化在新一代模型上是否改善
   - **Context Rot**：context window 使用超 25% 后推理质量退化——当前缓解方案
   - **Context Engineering**：2026 下半年核心研究方向，prompt caching 策略、context budgeting、programmatic context management
   - **Subgraph Projection / Context Selection**：从 knowledge graph / context graph 按需投射子图的最新方案和 benchmark
   - **Agentic Context Management**：agent 架构下的 token 优化策略（tool call vs bulk injection vs hybrid）

3. **本系统 token 分析**：
   - NL2SQL engine `buildPrompt` 的实际 token 构成分析（SOP / candidates / conventions / join constraints / metric context 各占比）
   - Agent 多轮交互的累积 token 增长模式
   - Prompt caching 命中率现状（如可测量）
   - 与 Jedify 的 25K baseline 对比

4. **优化方案评估**：
   - 是否需要 `project()` 统一投射接口（G7 推迟的问题）
   - Tool call 返回值裁剪（`get_definition` 返回完整 JSON vs 按需字段）
   - CorpusItem 描述文本压缩
   - Prompt 模板结构优化（提高 cache 命中率）
   - Context budgeting 机制（token 预算分配）

## Scope

Research 调研 + web search 前沿。产出为 `research/r10-token-attention-cache-optimization.md` 报告，含具体优化建议和优先级排序。若结论指向需要 plugin 层统一投射接口，建议重新开 G7。

## Resolution（2026-08-31）

**完整报告**：[research/r10-token-attention-cache-optimization.md](../research/r10-token-attention-cache-optimization.md)

### 核心发现

1. **本系统 token 效率行业顶尖**：~1,720-2,665 tokens/call，是 Jedify 25K baseline 的 7-15 倍效率，是传统方案 50K-150K 的 20-60 倍效率
2. **Jedify benchmark 为营销驱动的厂商自测**：苹果对橘子比较（不同数据集）、200 runs 样本量小、未披露 LLM 模型、与 Series A 融资同步发布。但"选择性上下文检索 > bulk injection"的方向性论证被 ESQ-Bench 等独立研究支持
3. **2026 前沿验证了本系统架构**：on-demand tool call = Context Engineering 的 Select 操作；graph-expand = Subgraph Projection；agent 驱动检索 = Agentic Context Management
4. **Context Rot 不是当前问题**：~1% window 使用率 vs ~25% rot 阈值，25 倍安全余量
5. **G7 维持 out of scope**：无需引入 `project()` 统一投射接口

### 优化建议（按优先级）

| 优先级 | 方案 | 收益 | 努力 |
|--------|------|------|------|
| P0 | Prompt caching（`cache_control` 断点） | **~70% token 成本节省** | 低 |
| P1 | Tool 返回值紧凑序列化（去缩进） | ~15-25% 动态部分节省 | 低 |
| P1b | Tool 返回值字段裁剪 | ~30-40% 动态部分节省 | 中（需 eval） |
| P2 | Context budgeting 机制 | 远期保障 | 中 |
| P3 | Conventions YAML 精简 | ~300 tokens/call | 低（需 eval） |
| P4 | Multi-turn compaction | 生产多轮场景 | 中 |

### 无新 fog 或新 ticket

本调研确认现有架构选择正确。优化项作为实施建议记录在报告中，待具体实施时再开票。
