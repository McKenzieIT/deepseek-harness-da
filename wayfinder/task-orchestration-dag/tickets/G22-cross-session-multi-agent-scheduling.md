# G22 — Cross-session and multi-agent scheduling

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G9 Optional Agent Teams adapter](G9-team-task-upstream-integration.md), [G10 Subagent execution adapter](G10-subagent-tree-upstream-integration.md)
**Blocks**: —

## Question

How should a proven one-active-Run-per-Session Plan DAG expand to concurrent top-level Runs, shared Team planning, cross-session task ownership, peer claims, work stealing, mailbox coordination, and conflict handling?

Define shared authority, identity, leader and worker permissions, leases, worker failure and owner release, causal ordering, shared-checkout safety, and how Agent Teams integration avoids two task authorities.

## Inputs from the G15 resolution

The current graph remains one right-Sidebar page per DSH Session. If cross-Session scheduling requires a fleet or workspace view, add a root-scoped global `main` panel as an aggregate consumer; do not move or replace the per-Session current graph.

## Inputs from the G7 resolution

The first release serializes write admission inside one SQLite-backed TaskGraphStore scheduling domain. Any cross-Session, cross-Run, multi-worker, or cross-store scheduler must preserve all-or-nothing reservation sets, the unbounded-write barrier, quarantined conflicts, deterministic replay, and the rule that worker loss or lease expiry cannot release an uncertain external writer.
