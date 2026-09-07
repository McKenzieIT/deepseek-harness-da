# @deepseek-ai/dsh-tool-compute

English | [中文](README.zh.md)

Model-facing `compute` tool for the data-agent INTERPRETATION phase. Executes LLM-generated Python/pandas code against cached query results via `ctx.codeRuntime`, stores derived results via `ctx.resultCache` with `cr_` prefix, and returns a `result_id` for downstream `present_table` rendering.

## Services

| Service | Role |
|---------|------|
| `ctx.tools` | Tool registration |
| `ctx.codeRuntime` | Python execution (data-python Provider) |
| `ctx.resultCache` | Load source data + store derived results |

## Bundle

Preset row: `tool-compute` → `@deepseek-ai/dsh-tool-compute`

Phase-gate: `INTERPRETATION_TOOLS` already includes `'compute'`.

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The sandbox is a Python subprocess with no GPU access.
- `result_id` is unvalidated until `present_table` resolves it — a stale or colliding id surfaces there, not at compute time.
- Source data is loaded via the `data.load_result()` binding only; there is no ad-hoc SQL/file ingest path here.
