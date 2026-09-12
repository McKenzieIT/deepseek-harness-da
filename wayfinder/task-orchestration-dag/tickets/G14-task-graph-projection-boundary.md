# G14 — Durable events, projection, and Host/Client boundary

**Type**: grilling
**Status**: open
**Blocked by**: [G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G15 Current client placement](G15-current-client-placement.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md), [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md)

## Question

What required session events and Host projection preserve the Plan DAG without client-side replay or duplicate authorities?

Define event granularity, complete post-change values, schemas, projection key and `stateVersion`, mutation serialization, append-and-flush commit, and replay for Plan Runs, proposed and committed revisions, Tasks, Attempts and groups, layered revisions, holds, budgets, Stop Reasons, completion proposals, assurance verdicts, output references, and interrupted attempts. Also define bounded history, renderer-neutral wire values, SDK projection, and snapshot coverage.

React reads the normal projection and owns only selection, zoom, filters, disclosure, and renderer lifecycle. Authoritative events are required-on-read.
