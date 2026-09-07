# @deepseek-ai/dsh-tool-present-clarification

Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)

## Known Limitations and Deferred Work

- Pure presentation — it HALTs the turn and stores no answer.
- Callable in any phase, but only one pending clarification is allowed per turn.
