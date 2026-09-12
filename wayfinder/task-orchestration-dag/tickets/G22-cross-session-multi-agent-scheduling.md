# G22 — Cross-session and multi-agent scheduling

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G9 Optional Agent Teams adapter](G9-team-task-upstream-integration.md), [G10 Subagent execution adapter](G10-subagent-tree-upstream-integration.md)
**Blocks**: —

## Question

How should a proven one-active-Run-per-Session Plan DAG expand to concurrent top-level Runs, shared Team planning, cross-session task ownership, peer claims, work stealing, mailbox coordination, and conflict handling?

Define shared authority, identity, leader and worker permissions, leases, worker failure and owner release, causal ordering, shared-checkout safety, and how Agent Teams integration avoids two task authorities.
