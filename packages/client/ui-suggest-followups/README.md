# @deepseek-ai/dsh-client-ui-suggest-followups

Toolview card for the `suggest_followups` INTERPRETATION tool. Renders follow-up question suggestions as a two-line list: the short label on the primary line, the full query `value` visible underneath. Clicking a row submits the value as a new message to the conversation.

## Style notes

The chip styles this package shipped with referenced six `--dsw-bg-*` / `--dsw-text-*` / `--dsw-border-*` custom properties that do not exist in the theme, so backgrounds and borders silently resolved to nothing. The list restyle consumes `--dsw-alias-*` tokens only.

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package does not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- Clicking a row submits immediately; there is no fill-composer-first mode and no undo for submitted follow-up messages (phase-2 candidates).
- Expired rows are inert: they cannot be re-sent from an older turn.
