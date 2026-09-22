---
description: "Toolview card for the present_decomposition INTERPRETATION tool: query-contract card with focal summary, lineage chips, always-visible metric calibers, and a trust band"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-present-decomposition

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Toolview card for the present_decomposition INTERPRETATION tool: query-contract card with focal summary, lineage chips, always-visible metric calibers, and a trust band

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Toolview card for the `present_decomposition` INTERPRETATION tool. The card is the **query's contract, not a result card**: it shows what the agent understood, at what caliber, and with how much confidence — three layers plus a trust band (wayfinder: interpretation-client-rendering R9 audit + P1 prototype verdict).

No runtime invariant companion is published because `@deepseek-ai/dsh-client-ui-present-decomposition` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package does not extend or invalidate the agent loop's reusable request prefix.

## Known Limitations and Deferred Work

- Latest-turn collapse is the default; cards on past turns collapse unless the user toggles.
- `block.call === null` (window truncation) or malformed `argsRaw` falls back to plain-text `block.content` rather than throwing in render.
- Confidence is model-self-reported; the trust band only warns below 0.7, it does not independently validate the score.
