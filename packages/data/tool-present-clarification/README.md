# @deepseek-ai/dsh-tool-present-clarification

English | [中文](README.zh.md)

Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)

## Model Experience

Indirectly, through @deepseek-ai/dsh-nl2sql-engine's LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

- Pure presentation — it HALTs the turn and stores no answer.
- Callable in any phase, but only one pending clarification is allowed per turn.
