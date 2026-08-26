# @deepseek-ai/dsh-tool-compute

Model-facing `compute` tool for the data-agent INTERPRETATION phase. Executes LLM-generated Python/pandas code against cached query results via `ctx.codeRuntime`, stores derived results via `ctx.resultCache` with `cr_` prefix, and returns a `result_id` for downstream `present_table` rendering.

## Model Experience

The model calls `compute` when it needs calculations the SQL query did not cover — ratios, running totals, pivots, statistical tests, etc. The code runs in a sandboxed Python subprocess with pandas and numpy. Source data is loaded via a `data.load_result()` binding; the code must return `{"columns": [...], "rows": [...]}`.

## Services

| Service | Role |
|---------|------|
| `ctx.tools` | Tool registration |
| `ctx.codeRuntime` | Python execution (data-python Provider) |
| `ctx.resultCache` | Load source data + store derived results |

## Bundle

Preset row: `tool-compute` → `@deepseek-ai/dsh-tool-compute`

Phase-gate: `INTERPRETATION_TOOLS` already includes `'compute'`.
