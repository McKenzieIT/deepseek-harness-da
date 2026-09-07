# @deepseek-ai/dsh-result-cache

Abstract result-cache seam (ctx.resultCache) for the DeepSeek Harness — store and retrieve query/compute results by result_id

## Known Limitations and Deferred Work

- Abstract seam — no default in-memory implementation is shipped here; providers own TTL and eviction.
- `result_id` collision behavior is provider-defined.
- There is no cross-process invalidation.
