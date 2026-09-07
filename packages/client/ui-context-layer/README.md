# @deepseek-ai/dsh-client-ui-context-layer

Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering

## Model Experience

None, as this browser-side context layer surface registers nothing model-facing.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- G6 v5 is a hard dependency — the graph will not render without it.
- The graph re-renders on domain-filter change (no incremental diff), so large graphs can thrash on rapid filter changes.
- Semantic-zoom levels are hand-tuned thresholds, not auto-computed from the data.
