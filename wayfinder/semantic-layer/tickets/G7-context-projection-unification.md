# G7 — Context Projection 统一接口设计（CL-3）

**Type**: grilling (HITL)
**Phase**: context-layer-alignment
**Status**: open
**Assignee**: unclaimed
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
