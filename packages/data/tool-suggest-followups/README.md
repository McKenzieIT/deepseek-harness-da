# `@deepseek-ai/dsh-tool-suggest-followups`

Model-facing `suggest_followups`: **suggest follow-up questions the user might ask next** for the data agent's `INTERPRETATION` phase. The agent calls it after presenting results to offer actionable next steps — drill-downs, comparisons, time shifts, or related queries the user can click to continue the conversation.

This is a **pure presentation tool** (`inject=['tools']` only): it records the suggestions and returns them for the UI to display as clickable chips. It has NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`. The phase-gate's `captureToolData` detects the call via `tools/post-execute`.

## Config

No knobs. Pure presentation.

## Verification

```sh
tsc -b packages/data/tool-suggest-followups/tsconfig.json
pnpm vitest run packages/data/tool-suggest-followups
pnpm verify-cordis-config
```

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure intent recording only — the UI layer owns the click-to-query interaction.
- Suggestion values are free-text queries, not validated against any schema.
- The 5-suggestion cap is a UX constraint (chip overflow); the model must prioritize.
