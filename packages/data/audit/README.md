# @deepseek-ai/dsh-audit

English | [中文](README.zh.md)

Per-user audit store (`ctx.audit`) for the DeepSeek Harness: relational `node:sqlite` for tool/session/guard audit events + G3 per-user Qoder Credits reconciliation. P8b production hardening (ports the throwaway `prototypes/p8-audit/`).

## Overview

An additive Cordis `Service` that observes `tools/post-execute` and `session/event` waterfalls, recording structured audit events (tool calls, session lifecycle, guard decisions, Credits) into an immutable append-only SQLite store with per-user ownership isolation.

## Key design decisions

- **Own SQLite** (`ctx.audit`, not `ctx.storageDomain`) — the relational 3-table schema (audit_event / audit_override / audit_tag) needs secondary indexes, cross-table transactions, and multi-segment keys that `storage-domain` KV cannot provide.
- **Immutable append + verdict-only patch** — identity fields are never overridable; corrections use `appendCorrection` (new row with `tag=attribution_correction` + `extra.corrects=originalLogId`).
- **`stats` vs `correctedStats`** — `stats` aggregates immutable originals (fast, always consistent with `rawPayload`); `correctedStats` applies corrections for compliance reconciliation (O(n), on-demand).
- **Tier-2 hash-not-body** — `recordTier2Write` stores a content hash, not the full payload, for semantic-layer write audit.

## Verification

```sh
tsc -b packages/data/audit/tsconfig.json   # typecheck
pnpm vitest run packages/data/audit         # 12 specs
pnpm verify-cordis-config                   # bundle mount resolves
```

## Model Experience

None, as the service records tool calls and session events into an immutable SQLite audit store for compliance and never surfaces records into a model's context.

#### KV Cache effect

No effect; audit records persist only in the SQLite store and never enter a model prompt.

## Known Limitations and Deferred Work

- **userId per-user dimension** — today NULL (T1 fallback); requires P9 `@deepseek-ai/dsh-admin` to land and wire `resolveIdentity()` (small additive change).
- **`guard_deny` automatic tagging** — post-execute has no `decision` parameter, so guard denials cannot be auto-distinguished from tool failures; explicit tagging via `ctx.audit.record({auto_tags:['guard_deny']})` is deferred to P10 intranet tool-gate.
- **Qoder internal tool/reasoning stream** — P8b audits call outcomes (final state + Credits), not internal reasoning streams; forensic stream audit requires a separate core seam ticket (map Not-yet-specified).
- **`verify-cordis-config` llm-dashscope** — pre-existing issue (P2 committed insert without bundle dep); not introduced by P8b.
- **Identity `''` vs NULL inconsistency** — `sameOwner` and `_where` handle empty-string vs NULL identity fields differently (code-review L2, edge-case).
- **`dumpAll` no ownership guard** — not in production paths (code-review L3, edge-case).
