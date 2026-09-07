# @deepseek-ai/dsh-tool-scope-routing

Scope-routing tools for the data agent: list_scopes, switch_scope + alias-based system-prompt hints for automatic scope detection

## Known Limitations and Deferred Work

- The alias-based scope hint is advisory — the model may still misroute.
- `list_scopes`/`switch_scope` mutate session scope state.
- There is no scope CRUD here.
