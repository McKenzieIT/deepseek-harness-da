# G28 — History, trace, and plan inspection

**Type**: prototype
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G27 Execution Ledger extraction threshold](G27-execution-ledger-extraction.md)
**Blocks**: —

## Question

What UI should expose Plan revisions, replan diffs, Attempts, verification evidence, and linked executor traces without turning the current-state graph into a full trace explorer?

Prototype current versus history navigation, superseded branches, Attempt drill-down, evidence summaries, time filtering, large-history loading, privacy, and links to executor-owned detail views.

The first release stops at the current-state graph and latest RunStopRecord; it retains history in required Session events but provides no dedicated history/replan-diff/trace navigation. This follow-up owns that UI and must keep executor-owned traces linked rather than copied.
