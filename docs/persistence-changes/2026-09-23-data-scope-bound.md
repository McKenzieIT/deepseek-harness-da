---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-23-data-scope-bound

English | [中文](2026-09-23-data-scope-bound.zh.md)

## Summary

Adds a new fork-owned log event data-scope/bound that records which Data Scope a Management Session manages. Appended once immediately after a Management Session is created through the public sessionController.create(), before its first turn.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-23-data-scope-bound
baseline: false
changes:
  - root: "event:data-scope/bound"
    previous: null
    after: "c8e9fdac03c9f3fe2d7984edbed326bcc4faee9afff2912087508af7e854f3fe"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The event is a new root addition; no existing declared type changes. Old readers that do not know the event refuse to resume a persisted Management Session that contains it (the known-event-types registry gates replay), which is the intended fail-loud behavior for a Management Session whose binding an old reader cannot safely interpret. The binding payload is plain JSON ({ dataScopeId, workspaceId }); no ignorable flag is set. No Session format version bump is required (requiresVersionBump=false): the event is a same-version addition whose only reader is the fork-owned management-context projection.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/data/management-context/tests --no-cache: 24 tests passed (3 files). pnpm run verify-persistence-catalog: catalog up to date. The persistence.spec.ts test writes a data-scope/bound event through the real JSONL backend, closes the context, reopens, and reads the event back; it folds through the shipping dataScope projection and asserts the binding is recoverable.

<a id="dev-note"></a>
## Dev Note

None.
