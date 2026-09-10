# @deepseek-ai/dsh-tool-discover-alt-labels

English | [中文](README.zh.md)

Model-facing discover_alt_labels tool: AI-native SKOS alias discovery over the semantic layer (CL-1 Phase 3 enrichment), for the management agent's enrichment phase

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure suggestion — discovered labels are not written back to the semantic layer.
- Names are capped at 200 characters.
- Callable in the enrichment phase only.
