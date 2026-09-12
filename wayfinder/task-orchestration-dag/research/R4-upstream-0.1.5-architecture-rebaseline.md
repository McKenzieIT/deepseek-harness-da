# R4 — Upstream 0.1.5 architecture rebaseline

> Current standing: the upstream capability inventory remains valid. Its tentative preference for a read-only composite graph is superseded by [R6 Agent orchestration and loop-engineering research](R6-agent-orchestration-and-loop-engineering.md), which restores the product requirement for a writable Plan DAG.

## Question

Which assumptions in the task-orchestration DAG map still hold against current upstream DSH, and which decisions must be reopened before implementation planning continues?

## Baseline

- Audit date: 2026-09-11.
- Upstream branch: `c291e7961a515f6d7af9304e7fd1d257929aef26`, committed 2026-09-10.
- Release: `dsh-v0.1.5-rc.2@fb2c4b9e698e30edb738bca4cf0618587db7d203`.
- Latest upstream commit explicitly absorbed by the fork during the audit: `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` through merge `8112743d6934fecbcf679e6ec438041da4a48a4e`.

## Findings

- Todo is a durable flat-plan domain with `todo/write`, a session projection, and a maintained UI. Replacing it is a composition decision, not an automatic cleanup.
- Experimental Agent Teams is publicly packaged and already owns revisioned tasks, dependencies, ownership, write scopes, graph validation, projection, and browser Remote methods. It remains unstable and belongs behind an optional adapter.
- Subagent parent-child discovery is now durable through a parent-owned catalog and projections. Task-to-subagent causality remains absent.
- `tool-workflow` already records top-level run and child facts. The Plan DAG should link attempts to those runs instead of duplicating workflow lifecycle state.
- Current Client state arrives through Host session projections and `useProjection`; a browser service must not replay raw session history as the durable authority.
- `ctx.tools.restrict()` requires an Agent-scoped context and filters inherited tools only. It cannot implement a universal host-level Todo replacement.
- Current client extension points include `conversation.input.dock`, a session-owned right sidebar, and global sidebar/main panels. Custom layout patches and root overlays are not the preferred graph owner.
- The fork's G6 prototype is useful evidence, but upstream does not own G6 and the renderer must be isolated behind an adapter.

## Route change

The map must decide a writable Plan DAG, explicit task-to-executor correlation, Host persistence and projection, Cordis outer-loop policy, executor adapters, current UI placement, renderer isolation, community packaging, and first-release evaluation before implementation.
