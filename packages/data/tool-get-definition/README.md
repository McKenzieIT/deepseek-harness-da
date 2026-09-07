# @deepseek-ai/dsh-tool-get-definition

Model-facing get_definition tool: load a unified data asset definition (table, event, or metric) by name from the semantic layer

## Known Limitations and Deferred Work

- Single-asset lookup — there is no batch variant.
- The name must be exact-match resolved; there is no fuzzy matching.
- Names are capped at 200 characters.
