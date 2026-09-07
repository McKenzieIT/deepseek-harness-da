# @deepseek-ai/dsh-tool-get-coverage

Model-facing get_coverage tool: semantic layer coverage statistics (total assets by kind, domain breakdown, confirmation status)

## Known Limitations and Deferred Work

- Read-only counts; it does not mutate the semantic layer.
- Coverage reflects the on-disk semantic layer — in-flight edits are not counted until persisted.
- Domain breakdown is by domain tag only.
