# G7 — Context Projection 统一接口设计（CL-3）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: closed (out of scope — v2+)
**Assignee**: claimed
**Blocked by**: [CL-1](CL1-terminology-aliases-migration.md)、[CL-2](CL2-concept-kind-plugin.md)
**Blocks**: 无
**Related**: [G1](G1-data-model-decision.md)（KindPlugin 接口）、[R9](../research/r9-context-layer-frontier-audit.md)（审计：G1 偏窄）

## Question

当前 `DataSourceKindPlugin<T>` 的三个投射方法（toCorpusItem / toPromptContext / toCriticContext）各自独立。Jedify 2026 benchmark 证明：统一 context graph + 按需投射子图 → 14x token 压缩 + 更高准确率。

何时/是否需要引入统一的 `project(def, opts)` 接口？

需要讨论：

1. **时机**：CL-1（aliases 入 definition）和 CL-2（concept 节点）落地后，三接口是否仍然足够？什么场景会暴露分离的不足？

2. **接口设计**：
   ```typescript
   project?(def: T, opts: ProjectionOptions): ProjectionResult

   interface ProjectionOptions {
     view: 'corpus' | 'prompt' | 'critic' | 'full'
     graph?: RelationGraph        // 可选：注入图上下文
     tokenBudget?: number         // Jedify-style token 预算
     includeAliases?: boolean
     includeRelations?: boolean
     includeTrust?: boolean       // CL-4 后
   }
   ```

3. **向后兼容**：现有三方法保留为 `project` 的快捷调用？还是直接替换？

4. **实际收益**：当前 NL2SQL prompt 的 token 用量是多少？是否面临 Jedify 发现的 "token problem"？若不面临则统一投射的紧迫性低。

## Scope

Grilling 讨论。当前标记为 low priority（CL-1/CL-2 后再评估）。若讨论后确认当前不需要，关闭并记录为 out of scope（v2+）。

## Resolution（2026-08-30）

**结论：关闭为 out of scope（v2+）。** 统一投射接口当前不需要引入。

### 代码事实（grilling 中验证）

- **`toCorpusItem`**：唯一有真实生产消费者的投射方法。`SemanticLayerService.loadRetrievalCorpusAll()`（`index.ts:371`）+ `retrieval-experiment/graph-snapshot.ts` 调用。
- **`toPromptContext`**：三个 kind plugin 均实现，但**生产路径零消费者**。`tool-get-definition` 返回原始 JSON（不经 toPromptContext）。NL2SQL 引擎从 CorpusItem payload 渲染候选列表。
- **`toCriticContext`**：table-kind 和 event-kind 均实现，但**生产路径零消费者**。NL2SQL 引擎 `engine.ts:218-241` 直接读 `eventDef.params_fields` 和 `eventDef.partitions` 构建 `CriticCtx`，完全绕过此方法。
- **NL2SQL prompt 架构**：agent 按需 tool call（`load_event_definition` / `load_table_dimensions`）加载单个 definition JSON，非 bulk injection。系统天然已是"按需投射"模式。
- **eval 结果**：CL-8 100% pass rate（80/80），CL-9 91.7%（154/168）——无 token 压力导致的准确率问题。

### 决策理由

1. **三接口分离当前无痛点**：`toPromptContext` 和 `toCriticContext` 生产零消费——统一没人用的接口无价值。
2. **系统已通过 agent tool call 实现按需投射**：与 Jedify context graph 方向一致，不需要 plugin 层 `project()` 驱动。
3. **Token/attention/cache 优化是重要方向，但正确入口不是 `project()` 接口**：Jedify benchmark 的 "token problem"（50K-150K tokens/call → Lost in the Middle 注意力退化 + 成本）在本系统中不存在（按需加载模式），但减少 token、提高缓存命中、稳定注意力窗口作为工程方向值得独立调研。

### 后续

- 新增 research ticket [R10](R10-token-attention-cache-optimization.md)：Token/Attention/Cache 优化前沿调研
- 若 R10 结论指向需要统一投射接口，届时重新开票
