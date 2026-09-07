# @deepseek-ai/dsh-tool-update-table-config

Model-facing update_table_config tool: write a per-table ODPS project override to the semantic-layer substrate for the data agent's self-evolution loop (admin-only; Tier-2 audited)

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Admin-only (Tier-2 audited).
- Per-table ODPS project override only — no field-level config.
- The write is substrate-coupled.
