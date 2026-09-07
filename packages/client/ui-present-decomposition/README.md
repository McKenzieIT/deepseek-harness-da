# @deepseek-ai/dsh-client-ui-present-decomposition

Toolview card for the `present_decomposition` INTERPRETATION tool. The card is the **query's contract, not a result card**: it shows what the agent understood, at what caliber, and with how much confidence — three layers plus a trust band (wayfinder: interpretation-client-rendering R9 audit + P1 prototype verdict).

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package does not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- Latest-turn collapse is the default; cards on past turns collapse unless the user toggles.
- `block.call === null` (window truncation) or malformed `argsRaw` falls back to plain-text `block.content` rather than throwing in render.
- Confidence is model-self-reported; the trust band only warns below 0.7, it does not independently validate the score.
