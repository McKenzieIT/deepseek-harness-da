# G9 — team-task integration (upstream sync)

**Type**: task
**Status**: open
**Blocked by**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Question

When upstream graduates `agent-team` from experimental (or evolves `todo_write` to include IDs and dependencies), integrate `team/task` events into the DAG visualization's composite projection.

### What this means
- The `ConversationNodeDefinition` adds a new match rule for `team/task` events
- `team-task` nodes replace `task` nodes when the preset composes `agent-team`
- `TeamTaskSnapshot.blockedBy[]` provides real `dependency` edges (replacing `sequence` edges inferred from list order)
- `TeamTaskSnapshot.ownerId` feeds into multi-agent ownership display

### Integration strategy
- The DAG plugin's projection layer already separates event consumption from rendering — adding a new event source is a localized change
- No architectural rework needed — the multi-source composite projection was designed for this

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
