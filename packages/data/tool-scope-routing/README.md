# @deepseek-ai/dsh-tool-scope-routing

Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The alias-based scope hint is advisory — the model may still misroute.
- `list_scopes`/`switch_scope` mutate session scope state.
- There is no scope CRUD here.
