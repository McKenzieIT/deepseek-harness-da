# CL-3 — 检索策略实验设计（A/B/C 对比 + alias 质量验证）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: resolved
**Assignee**: claude
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

## Resolution

### D1 — 主指标
检索级指标为主（precision@K、recall@K，以 case 的 `covered_assets` 为 ground truth），端到端 pass_rate 为辅助 sanity check。理由：策略差异仅在检索阶段，直接量检索可消除 LLM 生成随机性的噪声，且成本低、确定性、可重复。

### D2 — 目标策略方向
Strategy C 是目标。图谱稀疏时降级 BM25 兜底，同时 data agent 通过 **subagent 并行 enrichment** 补全图谱缺口（方案 γ：主 agent 用当前图谱正常回答，spawn subagent 补全发现的缺口，不阻塞查询延迟，下次查询受益）。形成数据治理自进化闭环：使用 → 发现缺口 → subagent 补全 → 图谱增长 → 检索提升。

### D3 — 实验结构：覆盖率梯度
不做静态 A/B/C 对比，而是在不同图谱覆盖率下测检索质量：

| Level | 图谱状态 | 目的 |
|-------|---------|------|
| 0 | 零 alt_labels、零 concept（纯 BM25） | 基线下界 |
| 1 | 当前状态（10 concept，已有 alt_labels） | 现状 |
| 2 | 模拟中等覆盖（~50% case 可通过 alias 命中） | 中间态 |
| 3 | 模拟高覆盖（~90% case 可通过 alias 命中） | 目标态 |

关键推论：A/B/C 是同一公式的特例——A ≈ 硬切换阈值极低，B ≈ 固定权重不随 coverage 变化，C ≈ 权重随 coverage 变化。实验本质是找最优 blending 函数 f(coverage) → weight。

### D4 — Fallback 机制：实验变量
硬切换（阈值 sweep）vs 连续混合（coverage 作为权重）不预设答案，作为实验变量对比验证。毕业为 [CL-5](CL5-retrieval-gradient-experiment.md) 实验票。

### D5 — Alias 质量评估
分层机制：
- **日常筛查**：基于 `covered_assets` 标注做 per-alias precision 统计（alias 命中时，多少次真正需要该表），成本近零
- **精确验证**：对可疑 alias 跑 with/without lift 测试（有 alias vs 无 alias 两遍全量 case），确认真实影响

### D6 — 实验规模
80 个 k11-v2 case 不够，需补充 alias-dependent case（表名关键词无法直接命中、必须通过别名/概念桥接的场景）。来源 = LLM 模拟 K11 业务角色（产品/运营/策划）生成 + 人工筛选，确保自然语言真实性。毕业为 [CL-4](CL4-supplement-alias-eval-cases.md) 实验票。

### 毕业票
- [CL-4](CL4-supplement-alias-eval-cases.md)：补充 alias-dependent eval case
- [CL-5](CL5-retrieval-gradient-experiment.md)：检索策略覆盖率梯度实验实施（含 fallback 机制对比）
