# @deepseek-ai/dsh-tool-revert-edit

Model-facing revert_edit tool: roll back a semantic layer asset to a prior definition snapshot

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Rolls back to a prior snapshot only — no branching history.
- Snapshot availability is audit-trail-dependent.
- The revert itself is audited.
