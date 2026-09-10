# @deepseek-ai/dsh-tool-get-definition

English | [中文](README.zh.md)

Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Single-asset lookup — there is no batch variant.
- The name must be exact-match resolved; there is no fuzzy matching.
- Names are capped at 200 characters.
