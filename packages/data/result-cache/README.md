# @deepseek-ai/dsh-result-cache

English | [中文](README.zh.md)

Abstract result-cache seam (ctx.resultCache) for the DeepSeek Harness — store and retrieve query/compute results by result_id

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Abstract seam — no default in-memory implementation is shipped here; providers own TTL and eviction.
- `result_id` collision behavior is provider-defined.
- There is no cross-process invalidation.
