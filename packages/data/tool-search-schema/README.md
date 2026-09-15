---
description: "Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-search-schema

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing search_schema tool: BM25 search over the semantic layer for the management agent to discover assets by natural-language query

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-search-schema` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- BM25 lexical search only — there is no semantic-embedding rerank.
- `topK` defaults to 20.
- Corpus is scope-bound — cross-scope search is not supported.
