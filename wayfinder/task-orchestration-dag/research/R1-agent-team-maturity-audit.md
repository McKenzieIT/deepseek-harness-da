# R1 — agent-team package maturity audit (resolved)

## 1. Missing fields for DAG visualization

**Current `TeamTaskSnapshot` fields**: `id`, `revision`, `subject`, `description`, `status`, `ownerId`, `blockedBy[]`, `writeScopes[]`.

**Gaps:**

| Need | Status | Notes |
|------|--------|-------|
| Node type discriminator (`kind: 'task' \| 'subagent' \| 'workflow'`) | **Missing** | Snapshot only represents tasks |
| Display metadata (icon, color, category) | **Missing** | `subject` serves as label; colors must be derived from `status` |
| Position hints (x, y, rank) | **Missing** | Layout engine must compute from topology — acceptable for dagre |
| Timestamps (createdAt, startedAt, completedAt) | **Missing** | README says "Session event `seq` and `time` own ordering" — recovering per-task timestamps requires fold replay |
| Parent/subtask hierarchy | **Missing** | DAG is dependency-only (blockedBy), not containment |

**Recommended path**: Overlay enrichment in a `TeamTaskView`-like projection (Option B from the ticket). The existing `TeamTaskView` pattern demonstrates this — it adds `ownerName`, `ready`, `writeScopeWarnings` without touching the snapshot schema.

## 2. Persistence story

- **Events stored in Lead Session log** via `root.session.append()` + `ctx.sessions.flush()`. Four durable event types: `team/member`, `team/task`, `team/message/queued`, `team/message/delivered`.
- **Survives session restart** — tested with both JSONL and SQLite persistence backends. Cold restart reconciles provisioning members, replays queued mail, deduplicates delivered mail.
- **Fold is recomputed on every call** — `foldTeam()` replays all events from the Lead Session log. No caching. Potential performance concern for large session logs.
- **Relation to `todo/write`**: Completely independent. `todo/write` is a flat whole-list-replacement projection cleared on each `turn/start`. Team tasks are multi-agent shared state with CAS revisions. No migration path, no interop, different event types.

## 3. Test coverage

| File | Lines | Tests |
|------|-------|-------|
| `team.spec.ts` | 1,692 | 43 |
| `persistence.spec.ts` | 485 | 5 |
| `fold.spec.ts` | 325 | 12 |
| `invariant.spec.ts` | 70 | 2 |
| **Total** | **2,572** | **62** |

Test-to-source ratio: ~1.1:1. Coverage includes: cycle detection (self-block, transitive cycles, missing/deleted blockers), authorization (owner-only mutations, Lead-only reassign), CAS stale revision rejection, persistence and recovery across backends.

**Gaps**: No performance/stress tests for large DAGs, no concurrent multi-Lead transaction tests, no timestamp extraction tests.

## 4. Migration from experimental

- **npm name**: `@deepseek-ai/dsh-experimental-agent-team` → would become `@deepseek-ai/dsh-agent-team`
- **Version**: `0.1.0-rc.8`, private
- **Only consumer**: `packages/experimental/tool-agent-team/` (also experimental)
- **No non-experimental package imports it**

**Graduation requires**:
1. Rename npm package (remove "experimental")
2. Move directory from `packages/experimental/` to `packages/` (or `packages/core/`)
3. Remove `"private": true`
4. Accept module augmentations (4 event types, 1 message source) as stable contracts
5. Establish Zod schema migration strategy (currently strict `version: 1`)
6. Graduate `tool-agent-team` simultaneously
7. Document or resolve 5 known limitations (single-process, advisory write scopes, flat roster, no auto-ownership-release, no cross-process mailbox)

## 5. Member/subagent overlap

**Deliberate layering, not duplication:**
- `TeamMemberSnapshot` = **durable identity record** persisted in Lead Session log (name, provider, lifecycle phase). Survives restart.
- `ctx.subagents` = **runtime lifecycle service** managing live Agent instances (start, interrupt, drain). No durable state.
- `TeamMemberView` merges both: durable `phase` from fold + live `status` from `ctx.agents.get()`.
- `tryMembership()` uses both layers to determine Lead vs. teammate vs. orphan.
- Removing either would break durability or runtime lifecycle management.

## Key takeaway

The package is architecturally solid for task DAG semantics (CAS, cycle detection, authorization, persistence). The main gaps for visualization are: no node type discriminator, no timestamps, no display metadata — all solvable via the existing `TeamTaskView` enrichment pattern without schema changes. Graduation is straightforward but requires accepting the 4 event types as stable contracts.
