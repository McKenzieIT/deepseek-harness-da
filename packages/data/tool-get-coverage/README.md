# @deepseek-ai/dsh-tool-get-coverage

English | [中文](README.zh.md)

Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only counts; it does not mutate the semantic layer.
- Coverage reflects the on-disk semantic layer — in-flight edits are not counted until persisted.
- Domain breakdown is by domain tag only.
