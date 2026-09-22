---
description: "Data-agent eval harness group: dsh-eval mirrors reverse-bi rbi-eval orchestration design as a da-fresh TypeScript pure library"
kind: "package-group"
---

# eval

English | [中文](README.zh.md)

## Summary

The `eval/` group provides the data-agent evaluation library, CLI, runner service, and retrieval experiments. Its pure evaluation types accept injected responders, executors, and judges; host packages wire real model and query providers. Package READMEs describe each execution mode and artifact format.

## Table of Contents

- [Packages](#packages)
- [Dev Note](#dev-note)

## Packages

Data-agent eval harness group: the `dsh-eval` package mirrors reverse-bi `rbi-eval` orchestration design (not code) as a da-fresh TypeScript pure library. It registers nothing on a Cordis context; a host wires the real `dsh-sdk-client` / `dsh-query` / `dsh-llm-dashscope` collaborators and injects them.

| Package | ctx-key | Role |
|---|---|---|
| [`eval/`](eval/README.md) | — (none; pure library) | `MultiTurnSession` + pass_k + DELIVERY/EXECUTION scoring + injected responder/executor/judge |

## Dev Note

Rules: [package](../AGENTS.md), [root](../../AGENTS.md#conventions).
