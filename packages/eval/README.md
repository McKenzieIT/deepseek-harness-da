# eval

English | [中文](README.zh.md)

Data-agent eval harness group: the `dsh-eval` package mirrors reverse-bi `rbi-eval` orchestration design (not code) as a da-fresh TypeScript pure library. It registers nothing on a Cordis context; a host wires the real `dsh-sdk-client` / `dsh-query` / `dsh-llm-dashscope` collaborators and injects them.

| Package | ctx-key | Role |
|---|---|---|
| [`eval/`](eval/README.md) | — (none; pure library) | `MultiTurnSession` + pass_k + DELIVERY/EXECUTION scoring + injected responder/executor/judge |

Rules: [package](../AGENTS.md), [root](../../AGENTS.md#conventions).
