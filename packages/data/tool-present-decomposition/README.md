# `@deepseek-ai/dsh-tool-present-decomposition`

Model-facing `present_decomposition`: **present a structured query decomposition** (summary, metrics, dimensions, time range) for the data agent's `INTERPRETATION` phase. The agent calls it to show the user how their natural-language question was understood — which metrics will be computed, over which dimensions, for what time range — before execution proceeds.

This is a **pure presentation tool** (`inject=['tools']` only): it records the decomposition and returns it for the UI to display. It has NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`. The phase-gate's `captureToolData` detects the call via `tools/post-execute`.

## Config

No knobs. Pure presentation.

## Verification

```sh
tsc -b packages/data/tool-present-decomposition/tsconfig.json
pnpm vitest run packages/data/tool-present-decomposition
pnpm verify-cordis-config
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure intent recording only — no downstream side effects or service interactions.
- The confidence score is model-self-reported; no ground-truth calibration exists yet.
- Metric `value` is a free-text expression, not validated SQL.
