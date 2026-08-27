# `@deepseek-ai/dsh-tool-suggest-followups`

Model-facing `suggest_followups`: **suggest follow-up questions the user might ask next** for the data agent's `INTERPRETATION` phase. The agent calls it after presenting results to offer actionable next steps — drill-downs, comparisons, time shifts, or related queries the user can click to continue the conversation.

This is a **pure presentation tool** (`inject=['tools']` only): it records the suggestions and returns them for the UI to display as clickable chips. It has NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`. The phase-gate's `captureToolData` detects the call via `tools/post-execute`.

## Model Experience

The model calls `suggest_followups` with:
- `suggestions` (required): array of 1-5 `{label, value}` objects
  - `label`: short tag for the row — at most ~8 Chinese characters, never
    repeating the value (the UI shows the full value under the label)
  - `value`: the full follow-up query to execute if the user clicks it

The tool returns `{ presented: true, suggestions }` and renders a bulleted list for the model's tool-result context.

## Known Limitations

- Pure intent recording only — the UI layer owns the click-to-query interaction.
- Suggestion values are free-text queries, not validated against any schema.
- The 5-suggestion cap is a UX constraint (chip overflow); the model must prioritize.

## Config

No knobs. Pure presentation.

## Verification

```sh
tsc -b packages/data/tool-suggest-followups/tsconfig.json
pnpm vitest run packages/data/tool-suggest-followups
pnpm verify-cordis-config
```
