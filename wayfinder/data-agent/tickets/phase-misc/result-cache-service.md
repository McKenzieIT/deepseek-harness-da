# resultCache Service Definition + Provider

> Spawned from [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) research (2026-08-26). The research identified that no result cache seam exists — both `compute` and `present_table` need to retrieve query results by `result_id`, and there is no reusable service for this today.

**Type**: task (AFK)
**Phase**: misc
**Assignee**: claimed (2026-08-26)
**Blocked by**: none (grilling resolved 2026-08-26)
**Blocks**: [code-runtime-data-python](code-runtime-data-python.md), `compute` tool ship
**Status**: ✅ resolved (2026-08-26)

## Question

Ship the `resultCache` Service Definition and an in-memory Provider so that tools can store and retrieve query/compute results by `result_id`.

## Resolution

Shipped as two packages following the SpillStore pattern (thin SD + separate Provider):

### `@deepseek-ai/dsh-result-cache` (SD) — `packages/data/result-cache/`

- `ResultCache` abstract service declaring `get`/`put`/`has`
- `ResultEntry` type: `{ columns: string[], rows: unknown[][], metadata?: { sql?, truncated?, row_count? } }`
- Augments `ctx.resultCache` on the Cordis Context

### `@deepseek-ai/dsh-result-cache-memory` (Provider) — `packages/data/result-cache-memory/`

- `MemoryResultCache` extends `ResultCache` with a `Map<string, ResultEntry>` store
- `tools/post-execute` hook:
  - Watches `query_data` results where `state === 'completed'`
  - Generates deterministic `qr_<sha256(sql)[0:12]>` result_id
  - Stores `{columns, rows, metadata}` in cache
  - Augments tool value with `result_id` field (so the model sees it for present_table)
  - Delegates to `next()` for downstream waterfalling
- `put()` semantics: idempotent on same entry, throws on conflicting entry (immutable)
- `get()` returns `undefined` on missing (caller decides error behavior)
- Session-scoped lifecycle (Map GC'd with plugin context)

### Tests — 14 passing

- Direct: put/get/has, missing-id, idempotent put, conflicting put throws
- Hook: captures completed results, ignores failed/pending, ignores non-query_data tools, stores metadata (truncated, row_count), explicit `cr_` put for compute-derived results

## Acceptance criteria

- [x] `ctx.resultCache` resolves in bundle
- [x] `tools/post-execute` hook captures query_data done results with `qr_<hash>` ids
- [x] `ctx.resultCache.get(rid)` returns `{columns, rows}` for captured results
- [x] `ctx.resultCache.put(rid, entry)` stores compute-derived results with `cr_<hash>` ids
- [x] Unit tests cover: put/get/has, post-execute capture, missing-id behavior

## Scope

### Service Definition (`@deepseek-ai/dsh-result-cache`)

```typescript
abstract class ResultCache extends Service {
  abstract get(resultId: string): ResultEntry | undefined
  abstract put(resultId: string, entry: ResultEntry): void
  abstract has(resultId: string): boolean
}

interface ResultEntry {
  columns: string[]
  rows: unknown[][]
  metadata?: { sql?: string; truncated?: boolean; row_count?: number }
}
```

### Provider (in-memory, session-scoped)

- Stores entries keyed by `result_id`
- Hooks `tools/post-execute` to capture `query_data` results (when `state === 'completed'`)
- Session-scoped lifecycle (entries GC'd with session)
- Prefixes: `qr_` (query engine results), `cr_` (compute-derived results)
- Fail-loud: `get()` on missing id returns `undefined` (caller decides error); `put()` on existing id is idempotent (same entry) or throws (different entry, immutable)

### Design decisions (from research)

- **Option C (hybrid)**: resultCache is a reusable seam; compute's `load_result` binding is a thin facade over `ctx.resultCache.get(rid)`
- **Multi-consumer**: present_table materialization also uses `ctx.resultCache`
- **No persistence**: session-scoped only (compute derivations are cheap to recreate)
- **No scope isolation (v1)**: single-user single-scope data-agent; scope isolation deferred to P9

## 关联

- [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) (parent research)
- [present-delivery-tools](present-delivery-tools.md) (present_table needs resultCache for D6 intent-not-data)
- `packages/spill/spill/src/index.ts` (SpillStore pattern to follow: thin SD + separate Provider)
- RBI `libs/rbi-mcp/src/rbi_mcp/result_view.py` (reference implementation)
