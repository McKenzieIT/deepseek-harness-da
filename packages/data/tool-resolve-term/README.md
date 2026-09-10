# @deepseek-ai/dsh-tool-resolve-term

English | [中文](README.zh.md)

Model-facing resolve_term tool: exact alias resolution from SKOS pref_label/alt_labels via the relation graph's reverse index

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Exact alias resolution only — no fuzzy or typo tolerance.
- Resolution depends on the relation graph being available.
- Scope-bound — it does not resolve across scopes.
