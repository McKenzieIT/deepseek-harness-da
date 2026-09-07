# @deepseek-ai/dsh-management-session

Dedicated management agent session for the full-screen graph management UI — creates a scoped session under the semantic-layer-management preset with read-only parent context reference

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- The parent-context reference is read-only (no write-through).
- The management preset is a separate scope — edits do not auto-reflect in the parent session until reload.
