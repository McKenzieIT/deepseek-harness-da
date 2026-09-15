---
description: "Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present-clarification

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)

No runtime invariant companion is published because `@deepseek-ai/dsh-tool-present-clarification` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure presentation — it HALTs the turn and stores no answer.
- Callable in any phase, but only one pending clarification is allowed per turn.
