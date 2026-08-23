# W4 — Evidence-query backend（表现无关查询层）

**Type**: task
**Status**: Open
**Blocked by**: W1（SchemaGateway，coverage/gap/reachability 读 `ctx.schema`）

## Question

表现无关的 evidence-query 层（G4 演进约束 **#3 共享后端**）：同后端服务**侧栏（B 子集）**与**未来 dashboard（A 全量）**两种消费者，不 per-view 取数。

查询面：
- **coverage stats**：`getCoverageStats()`（经 W1 SchemaGateway）
- **gap / reachability delta**：复用 P2 `RelationGraph` BFS——"加这条 relation 后哪些查询新可达"（per-mutation 结构性证据的计算半，G4 tiered evidence）
- **eval-result querying**：查 W3 持久化的 run 结果 + before/after delta + per-case flip（与 W3 协调 result schema）

## 验收

- [ ] 侧栏与 dashboard 读同一查询层（不重复取数逻辑）
- [ ] coverage / gap-reachability / eval-trajectory 可查
- [ ] 满足演进约束 #3（promote 到 dashboard 不需重 plumbing）

## 参考

- G4（演进约束 #3 / tiered evidence per-mutation 结构性证据）
- 依赖：W1（ctx.schema 读）、W3（eval result schema，coordinate）、P2（RelationGraph BFS）
