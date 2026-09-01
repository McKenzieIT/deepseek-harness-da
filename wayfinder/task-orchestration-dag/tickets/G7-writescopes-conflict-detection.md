# G7 — writeScopes conflict detection for multi-agent parallel work

**Type**: task
**Status**: open
**Blocked by**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Context from G5

G5 D2 将 DAG 定位为**执行状态的单一事实来源（SSOT）**——Agent 依据 DAG 状态做编排决策。writeScopes 冲突检测是 SSOT 的数据一致性职责：DAG 存储了每个 task 的 writeScopes，检测重叠是这份数据上的约束校验，类似数据库的 constraint check。

G5 D3 确认 DagModelService 提供同步命令式 API + 读写一致性保证。冲突检测应在 `dag_task_update({ status: 'in_progress' })` 时同步执行，结果通过 `writeScopeWarnings` 返回给调用者。

## Question

Implement the `scopesOverlap` detection logic for `DagTask.writeScopes`, generating warnings when two `in_progress` tasks have overlapping file write scopes.

The field exists in the DagTask model (decided in G1) but detection is deferred to the multi-agent phase. When implemented:
- Reuse the path-prefix overlap algorithm from `agent-team/src/task-board.ts` (~10 lines pure function)
- Generate `writeScopeWarnings` in the task view
- In the DAG visualization, show overlapping tasks with a red warning edge or badge

## Upstream sync risk

**Medium** — if upstream graduates `agent-team` and its `writeScopes` detection becomes available as a stable service, evaluate adopting upstream's implementation rather than maintaining our own. The algorithm is simple enough that duplication is acceptable, but the warning UX should be consistent with whatever upstream provides.
