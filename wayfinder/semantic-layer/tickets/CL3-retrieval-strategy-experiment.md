# CL-3 — 检索策略实验设计（A/B/C 对比 + alias 质量验证）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [CL-1](CL1-terminology-aliases-migration.md)（Phase 2 实现后才有实验基础设施）
**Blocks**: 无
**Related**: [P3](P3-ontology-nl2sql-integration.md)（graph-expanded recall 先例）

## Question

设计一套实验验证三种检索策略的效果差异，并建立 alias 质量的持续评估机制。

### 待决策

1. **实验指标**：retrieval precision/recall/MRR？SQL 准确率？token 消耗？三者如何权衡？
2. **实验基线**：当前 BM25-only 作为基线？还是 BM25 + P3 graph-expand 作为基线？
3. **Strategy A/B/C 的具体实现差异**：
   - A（Graph-first, BM25 fallback）：alias 命中 → skip BM25？还是 alias 命中 → only BM25 on remaining terms?
   - B（Always-fused）：boost 值如何确定？fixed constant vs learned?
   - C（Jedify-style subgraph projection）：覆盖率多高才能切换？阈值如何定义？
4. **alias 质量 eval**：什么构成一个好的 alias？如何衡量单个 alias 的增益/损害？
5. **实验规模**：K11 161 eval cases 够吗？是否需要扩展 case set？

### 背景

CL-1 D4a 决策选择了 Strategy B（always-fused graph-anchored hybrid）作为初始实现。但三种策略的优劣需要**数据验证**而非直觉判断。本票设计对比实验框架，使策略选择可以 eval-driven 演进。

### 实验框架草案

```
Baseline: BM25 + P3 graph-expand (current behavior, no alias resolution)

Treatment A: resolve_first → if hit, use directly + skip BM25
Treatment B: always-fused (alias boost = X) + BM25 parallel + rank fusion
Treatment C: graph-resolve all terms → subgraph projection only → BM25 fallback on no-hit

Metrics:
  - Retrieval: precision@K, recall@K, MRR
  - End-to-end: SQL accuracy (eval pass_rate)
  - Efficiency: tokens/query, latency
  - Alias-specific: per-alias retrieval lift (with-alias vs without)

Sweep: boost parameter (for B), coverage threshold (for C switch)
```
