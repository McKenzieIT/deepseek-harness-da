# @deepseek-ai/dsh-tool-search-schema

Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query

## Known Limitations and Deferred Work

- BM25 lexical search only — there is no semantic-embedding rerank.
- `topK` defaults to 20.
- Corpus is scope-bound — cross-scope search is not supported.
