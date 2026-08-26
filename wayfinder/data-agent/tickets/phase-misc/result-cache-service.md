# resultCache Service Definition + Provider

> Spawned from [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) research (2026-08-26). The research identified that no result cache seam exists — both `compute` and `present_table` need to retrieve query results by `result_id`, and there is no reusable service for this today.

**Type**: task (AFK)
**Phase**: misc
**Assignee**: (unclaimed)
**Blocked by**: none (grilling resolved 2026-08-26)
**Blocks**: [code-runtime-data-python](code-runtime-data-python.md), `compute` tool ship

## Question

Ship the `resultCache` Service Definition and an in-memory Provider so that tools can store and retrieve query/compute results by `result_id`.

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
- Hooks `tools/post-execute` to capture `query_data` results (when `state === 'done'`)
- Session-scoped lifecycle (entries GC'd with session)
- Prefixes: `qr_` (query engine results), `cr_` (compute-derived results)
- Fail-loud: `get()` on missing id returns `undefined` (caller decides error); `put()` on existing id is idempotent (same entry) or throws (different entry, immutable)

### Design decisions (from research)

- **Option C (hybrid)**: resultCache is a reusable seam; compute's `load_result` binding is a thin facade over `ctx.resultCache.get(rid)`
- **Multi-consumer**: present_table materialization also uses `ctx.resultCache`
- **No persistence**: session-scoped only (compute derivations are cheap to recreate)
- **No scope isolation (v1)**: single-user single-scope data-agent; scope isolation deferred to P9

## Acceptance criteria

- [ ] `ctx.resultCache` resolves in bundle
- [ ] `tools/post-execute` hook captures query_data done results with `qr_<hash>` ids
- [ ] `ctx.resultCache.get(rid)` returns `{columns, rows}` for captured results
- [ ] `ctx.resultCache.put(rid, entry)` stores compute-derived results with `cr_<hash>` ids
- [ ] Unit tests cover: put/get/has, post-execute capture, missing-id behavior

## 关联

- [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) (parent research)
- [present-delivery-tools](present-delivery-tools.md) (present_table needs resultCache for D6 intent-not-data)
- `packages/spill/spill/src/index.ts` (SpillStore pattern to follow: thin SD + separate Provider)
- RBI `libs/rbi-mcp/src/rbi_mcp/result_view.py` (reference implementation)
