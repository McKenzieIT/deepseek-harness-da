# G9 — team-task integration (upstream sync)

**Type**: task
**Status**: open
**Blocked by**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Question

When upstream graduates `agent-team` from experimental (or evolves `todo_write` to include IDs and dependencies), integrate `team/task` events into the DAG visualization's composite projection.

### What this means
- `DagModelService`（Cordis 服务，G5 D1）订阅 `team/task` 事件，将 TeamTaskSnapshot 转换为 DAG 节点
- `team-task` nodes replace `task` nodes when the preset composes `agent-team`
- `TeamTaskSnapshot.blockedBy[]` provides real `dependency` edges (replacing `sequence` edges inferred from list order)
- `TeamTaskSnapshot.ownerId` feeds into multi-agent ownership display

### Integration strategy
- G5 D1 确认 DagModelService 通过事件订阅维护 DAG 状态，渲染层完全解耦。Adding a new event source (`team/task`) is a localized change to the service's event handler
- G5 D3 的内核 `applyEvent(state, event) → state` 纯函数只需新增一个 case 分支
- No architectural rework needed — the Cordis service + event replay architecture was designed for multi-source composition

### Trigger condition
Monitor upstream for:
- `agent-team` package moved out of `packages/experimental/`
- `private: true` removed from `agent-team/package.json`
- `todo_write` tool schema changed to include `id`, `blockedBy`, or similar fields
- New bundle rows composing `agent-team` in `standard` or `code` presets

## Upstream sync risk

**High** — this ticket's timing is entirely determined by upstream decisions. The experimental package could be:
- Graduated as-is (straightforward integration)
- Significantly refactored (may need to adjust our event consumption)
- Removed/replaced (our plugin continues without it — graceful degradation)

Track upstream changes on each merge and re-evaluate.
