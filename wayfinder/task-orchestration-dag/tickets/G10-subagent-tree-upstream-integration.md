# G10 — Subagent execution adapter

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md), [G17 Executor adapters](G17-native-source-adapters.md)
**Blocks**: [G22 Cross-session and multi-agent scheduling](G22-cross-session-multi-agent-scheduling.md)

## Question

How does an Attempt dispatch and observe a subagent while reusing native run identity, parent-owned catalog, descendant listing, descriptor, timing, cancellation, and result semantics?

Decide correlation for one-shot, continuable, nested, remote, and no-local-Session runs; what is recorded before and after dispatch; interruption and missing terminal settlement; and partial UI facts.
