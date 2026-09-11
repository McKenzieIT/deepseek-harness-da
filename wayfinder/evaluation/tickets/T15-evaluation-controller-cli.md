# T15 — Product Evaluation Controller 与 external CLI

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [T9 — Evaluation foundations](T9-evaluation-foundations.md)、[T13 — Production Context Projection capability](T13-context-projection-service.md)、[T14 — Data-analysis extension 与 canonical Pack migration](T14-data-analysis-extension-pack-migration.md)
**Blocks**: [T12 — Final Evaluation package graph 与 legacy cutover](T12-eval-package-consolidation.md)
**Mode**: AFK（后端方向，本地直接做）
**Branch**: `task/T15-evaluation-controller-cli`

## Question

如何实现唯一 Evaluation Controller 与首版 external CLI/SDK Host，使 controlled Product Evaluation 启动真实 production profile/bundle/preset、创建正常 Agent/session、叠加只读 Observer 和 Environment lifecycle Service，并从 sealed evidence 产生 GradeRecord 与 publication eligibility？

## Required scope

- One frozen DSH root per Evaluation Run; serial Attempts by default and explicit one-Attempt Run for stronger isolation.
- Product-composition and component subjects, plus operation identities for controlled run、shadow observation、rescore、reproject、model rerun and Environment re-execution.
- Explicit `--profile` + `--benchmark` resolution through production app-boot and BenchmarkRepository; no host case glob or private material parsing.
- Real `ctx.agents.create()`/public SDK path through session、prompt、tools、approval、hooks、guards、workflow、persistence and production Context Projection.
- Scope-local behavior-preserving Observer, Environment Lease, EvidenceCut sealing, Grading Runtime call, cleanup and PublicationEligibility.
- CLI output/reporting and SDK-facing run handle sufficient for cancel, flush and completion without a permanent Cordis Service Host.

## Success criteria

- Product-level path does not import agent-loop implementation, concrete Query Providers, NL2SQL engine internals or concrete Context Provider.
- Deterministic paired test proves Observer installation leaves model-visible events, request headers, tool actions and terminal state unchanged.
- Evidence/observer failure is not model failure; live output is provisional and formal grade binds a persisted sealed cut.
- HMR/provider replacement invalidates the Run; Run Identity Graph and materialized manifest are complete and secret-safe.
- Managed、attached-snapshot and observational assurance enforce publication/aggregation eligibility.
- Data-analysis vertical slice and data-engineering/data-science conformance fixtures execute through the same Controller interface.
- No `ctx.evalRunner`, model-facing `trigger_eval` or goal-eval feedback is required by the first-release path.

## Out of scope

- Final deletion of old packages and consumer migration ([T12](T12-eval-package-consolidation.md)).
- Remote Benchmark/Artifact providers or permanent Evaluation Service Host.
- New valid baseline ([R25](R25-evaluation-rebaseline.md)).
