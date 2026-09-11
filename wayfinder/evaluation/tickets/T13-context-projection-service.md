# T13 — Production Context Projection capability

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G10 — Harness Benchmark/Harness/Environment 拆分](G10-harness-bhe-split.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)
**Blocks**: [T9 — Evaluation foundations](T9-evaluation-foundations.md)、[T15 — Product Evaluation Controller 与 external CLI](T15-evaluation-controller-cli.md)、[G13 — Context evaluation protocol](G13-context-evaluation-protocol.md)
**Mode**: AFK（生产 data-agent capability，本地直接做）
**Branch**: `task/T13-context-projection-service`

## Question

如何在正常 data-agent 中建立唯一的生产级 Context Projection Service，使 Agent、NL2SQL 与后续 Evaluation 共享同一 `request → projection + evidence` 路径，同时保留 schema、retrieval、ontology/relations、terminology 和 ranking 的独立 Provider ownership？

## Required scope

- Service Definition、production Provider 与真实 product Consumer；Evaluation package 不拥有该 seam。
- Typed `ContextProjectionRequest`、`ContextProjection`、`ContextProjectionEvidence` 与 content identity。
- DataScope、consumer、phase、requirement、budget、serialization 与 injection timing 的显式输入。
- Candidates、selected items、relation paths、scores、provenance、token count 与 model-visible digest 的 evidence。
- Normal data-agent Context assembly 迁到该 Service；删除 CLI/service 中自行重建 retrieval/projection 的理由基础。

## Success criteria

- Normal production Agent uses the new service; Evaluation only observes the same calls and results.
- Service does not own schema authoring, DataScope registry, Benchmark/private material, Environment execution, prompt assembly or grader policy.
- Production behavior has model-visible parity/snapshot coverage and latency/token regression evidence.
- No-context、schema-only、relations-only and production Providers/configs can be selected explicitly; oracle remains grader-controlled and cannot enter a production profile.
- Registrations are effect-owned; Consumers inject only the Definition package and do not import concrete Providers.
- Context identity and evidence can be included in a Run Identity Graph without exposing secrets or hidden material.

## Out of scope

- Context evaluation metrics and counterfactual experiment design ([G13](G13-context-evaluation-protocol.md)).
- Evaluation Controller wiring ([T15](T15-evaluation-controller-cli.md)).
- Retrieval/ranking algorithm selection.
