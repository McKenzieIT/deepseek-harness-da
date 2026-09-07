# @deepseek-ai/dsh-tool-search-schema

Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- BM25 lexical search only — there is no semantic-embedding rerank.
- `topK` defaults to 20.
- Corpus is scope-bound — cross-scope search is not supported.
