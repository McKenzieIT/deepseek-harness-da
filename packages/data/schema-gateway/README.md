# @deepseek-ai/dsh-schema-gateway

Read-only Remote projection of ctx.schema (SemanticLayerService) for client UI consumption

## Known Limitations and Deferred Work

- Read-only — there is no write path through this gateway.
- The BM25 linker index is rebuilt on corpus-version bump, with no live incremental update.
- The projection is client-facing, not the source of truth.
