# `@deepseek-ai/dsh-tool-present-decomposition`

Model-facing `present_decomposition`: **present a structured query decomposition** (summary, metrics, dimensions, time range) for the data agent's `INTERPRETATION` phase. The agent calls it to show the user how their natural-language question was understood — which metrics will be computed, over which dimensions, for what time range — before execution proceeds.

This is a **pure presentation tool** (`inject=['tools']` only): it records the decomposition and returns it for the UI to display. It has NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`. The phase-gate's `captureToolData` detects the call via `tools/post-execute`.

## Model Experience

The model calls `present_decomposition` with:
- `summary` (required): a natural-language description of the interpreted intent
- `metrics` (required): array of `{name, value, unit?}` identifying the measures
- `dimensions` (required): array of group-by axis names
- `time_range` (required): the temporal scope of the query
- `source` (optional): the primary data source
- `filters` (optional): applied filter conditions
- `confidence` (optional): 0-1 interpretation confidence score

The tool returns `{ presented: true, summary, metrics, dimensions, time_range, ... }` and renders a readable decomposition summary for the model's tool-result context.

## Known Limitations

- Pure intent recording only — no downstream side effects or service interactions.
- The confidence score is model-self-reported; no ground-truth calibration exists yet.
- Metric `value` is a free-text expression, not validated SQL.

## Config

No knobs. Pure presentation.

## Verification

```sh
tsc -b packages/data/tool-present-decomposition/tsconfig.json
pnpm vitest run packages/data/tool-present-decomposition
pnpm verify-cordis-config
```
