# G10 — subagent tree integration (upstream sync)

**Type**: task
**Status**: open
**Blocked by**: [G6 infra contracts for dynamic workflows](G6-infra-contracts-for-dynamic-workflows.md)
**Blocks**: —

## Question

Enrich the subagent nodes in the DAG with full tree structure from session lineage, and integrate any upstream improvements to subagent event persistence.

### Current state (from R3)
- `subagent/start` and `subagent/end` are **ephemeral** Cordis events (not persisted in parent session)
- `subagent/descriptor` is persisted in the **child** session only
- Parent→child linkage: `SessionHeader.parentSession` (child side)
- G1's `dag/subagent-linked` event bridges the gap by persisting correlation in the parent session

### What full tree integration means
- Recursive subagent trees: agent A spawns B, B spawns C → tree visualization A→B→C
- Cross-session lineage queries via `SessionHeader.parentSession`
- Subagent node enrichment: label, provider, mode (one-shot/continuable) from `subagent/descriptor`

### Trigger condition
Monitor upstream for:
- `subagent/start` becoming a persisted event (parent session)
- `SubagentStartRequest` gaining a `taskId` or `contextId` field
- New session projection for subagent child listing
- Changes to `subagent/descriptor` schema

### If upstream adds native task↔subagent linkage
- Our `tools/pre-execute` correlation mechanism becomes redundant
- Switch to upstream's native linkage, remove our interception
- The `dag/subagent-linked` event remains for backward compatibility (older sessions)

## Upstream sync risk

**High** — subagent event persistence is a known gap that upstream is likely to address. When they do:
- If they persist `subagent/start` in parent session → simplifies our event consumption
- If they add `taskId` to `SubagentStartRequest` → our correlation mechanism becomes unnecessary (but still works as fallback)
- If they add a session projection for child listing → can replace cross-session queries

Track upstream changes on each merge and re-evaluate.
