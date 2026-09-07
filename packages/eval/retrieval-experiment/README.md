# @deepseek-ai/dsh-retrieval-experiment

Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Level 0-3 graph snapshots are point-in-time — no live streaming.
- Blending variants are research scaffolding, not production-tuned.
- Metrics are precision@K/recall@K only — no nDCG.
