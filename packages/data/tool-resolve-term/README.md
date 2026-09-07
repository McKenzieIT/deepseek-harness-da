# @deepseek-ai/dsh-tool-resolve-term

Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index

## Known Limitations and Deferred Work

- Exact alias resolution only — no fuzzy or typo tolerance.
- Resolution depends on the relation graph being available.
- Scope-bound — it does not resolve across scopes.
