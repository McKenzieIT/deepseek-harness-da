# @deepseek-ai/dsh-evidence-query

Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption.

## Known Limitations and Deferred Work

- Read-only projection — it never writes back to the semantic layer.
- Gap analysis proposes relations but does not persist them.
- Reachability is BFS-bounded with no path-length cap beyond the default.
