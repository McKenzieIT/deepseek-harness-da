# P4d: Wire query_data results into resultCache

**Type**: task (AFK)
**Phase**: misc
**Status**: open
**Blocked by**: none (result-cache-service ✅, result-cache-memory ✅ already shipped)
**Blocks**: `compute` tool functional correctness

## Problem

`compute` tool reads from `ctx.resultCache.get(result_id)` but `query_data` execution never calls `ctx.resultCache.put()`. The result-cache service and memory provider are mounted (cordis.patch.yml line 204), but no integration writes query results into it.

Error observed in production session:
```
Error: compute: result_id "qr_k11_dau_trend_30d" not found in cache
```

## Root Cause

`phase-gate.ts` `captureToolData` for `query_data` only captures state metadata (`last_query_outcome`, `last_failure_kind`, `last_query_error`, `execution_auto_advance`). It does NOT store the actual TSV row data into `ctx.resultCache`.

## Fix

Add a `tools/post-execute` hook (in phase-gate or a dedicated wiring plugin) that:
1. On `query_data` completion with `state === 'completed'`:
   - Extracts the `result_id` from the tool arguments (model-assigned) or generates a deterministic one
   - Stores the TSV content (from tool result) into `ctx.resultCache.put(result_id, { rows, columns, ... })`
2. Uses the `qr_` prefix convention per the result-cache-service design

## Considerations

- The `result_id` in `present_table` args is model-generated (not system-assigned) per R3 research
- Need a mapping: model's semantic `result_id` → actual cache key
- OR: make `query_data` tool itself call `ctx.resultCache.put()` in its execute (the tool has access to ctx)
- Row data from `query_data` is TSV text in the tool/result content; parsing needed for structured storage
