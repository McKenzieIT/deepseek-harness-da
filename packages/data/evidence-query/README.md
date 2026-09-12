# @deepseek-ai/dsh-evidence-query

English | [中文](README.zh.md)

Unified evidence-query backend layer — coverage, gap analysis, reachability, eval results, and asset health for both sidebar and dashboard consumption.

`FileBackedEvalResultStore` reads both legacy unversioned eval JSONL and version-2 records. Version-2 metadata retains runner verdicts, run configuration, attempt execution evidence, and case provenance; all six runner verdicts map explicitly, with `unjudged`, `infra_failure`, and `case_defect` represented as `error` rather than unfinished `pending` work.

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Read-only projection — it never writes back to the semantic layer.
- Gap analysis proposes relations but does not persist them.
- Reachability is BFS-bounded with no path-length cap beyond the default.
