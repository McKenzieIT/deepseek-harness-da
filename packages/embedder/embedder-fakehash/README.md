# @deepseek-ai/dsh-embedder-fakehash

English | [中文](README.zh.md)

Zero-dependency FakeHash embedder provider (deterministic sha256 hash vectors) + FakeReranker peer for the data agent's retrieval pipeline (P5b default tier).

## Overview

Provides `FakeHashEmbedder` — a zero-dependency provider that generates deterministic vectors from sha256 hashes of input text. Paired with `FakeReranker` as the default reranker peer. This is the boot-time default: retrieval works out of the box without an external embedding service, at the cost of semantic quality.

## Model Experience

None, as the deterministic sha256 hash-vector stub and token-recall reranker load no model and register no prompt, tool, schema, or session event, and their vector and score outputs never enter model context.

#### KV Cache effect

No direct effect; hash vectors and recall scores serve retrieval similarity, not the LLM context.

## Known Limitations and Deferred Work

- **Weak semantic quality** — FakeHash produces deterministic but non-semantic vectors (sha256-derived); ranking quality is low by design. This is intentional for the default tier: it guarantees retrieval functions without an external service, but results lack real semantic similarity.
- **Upgrade to real embedder for production** — production workloads should mount `embedder-http` (InfinityEmbedder) or a future sidecar provider for meaningful vector similarity.
- **FakeReranker is a pass-through** — the paired reranker applies no learned scoring; it exists solely to satisfy the Reranker protocol contract at the default tier.
- **D2 keep/regress evals-driven activation** — whether hybrid retrieval (which depends on embedder quality) is activated by default is deferred to D2c evaluation results.
