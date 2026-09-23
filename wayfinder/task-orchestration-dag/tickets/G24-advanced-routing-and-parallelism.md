# G24 — Advanced routing, parallelism, and optimization

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

How should the scheduler extend G12's concurrent Tasks and explicit Attempt Groups with progress-aware executor and model routing, dynamic batch sizing, speculative work, voting, and cost/latency optimization?

Define independence and resources, limits, progress signals, executor availability, loser cancellation, quality-cost policy, no-progress detection, budget allocation, deterministic fallback, and which choices are model proposals versus enforced policy.

[G17 Executor adapters](G17-native-source-adapters.md) uses explicit deployment-provided execution targets in the first release. This follow-up decides capability-requirement matching, candidate disambiguation, and recorded selection reasons only when interchangeable executors or cross-deployment plan reuse produce measurable manual mapping cost. It depends on the settled executor protocol and first-release evaluation; it cannot silently substitute an executor in an admitted Attempt or weaken its authority, scopes, or acceptance criteria.

This follow-up owns any general semantic progress judge, learned early-stop predictor, dynamic interaction horizon or trial-budget scheduler, semantic SQL/Task equivalence, cross-Task cycle detection, and multi-Attempt outcome selection. Trigger it only when first-release replay evidence shows that deterministic failure keys leave material wasted compute or unacceptable false stops; accumulated data never enables a mechanism automatically.

It also owns activation of the already-reserved Attempt Group domain model: supported group strategies, atomic member admission, group budget and capacity reservation, verifier aggregation, winner/quorum selection, loser cancellation, unknown loser outcomes, recovery, UI, and adapter capability negotiation. First-release profiles reject group admission explicitly; enablement requires measured quality/latency benefit that justifies duplicate model or query cost.

It additionally owns any replacement of the first-release stable ready ordering with model arbitration, critical-path or duration prediction, automatic priority aging, preemption, weighted fair sharing, or cross-Run multi-tenant scheduling. Such policies require historical executor data or demonstrated starvation/latency problems and must preserve a deterministic fallback.

It also owns admission-throughput optimizations that batch multiple independent durable intents behind fewer Session flushes. The first-release protocol requires only that each model request, native execution, or external effect begins after a successful flush covers its own intent; batching must preserve that failure and replay behavior and requires measured persistence overhead before implementation.

### Activation-window preparation reuse

[Model tools and cross-preset composition](G16-todo-coexistence-and-preset-composition.md#confirmed-activation-response-boundary) defers not-yet-started ordinary read-only preparation from an old model response until a request assembled for the receiving role. Revisit whether to revalidate and execute those calls only when measured activation traces show material user-visible latency or repeated preparation cost. This decision depends on the settled role-transition and authorization protocol and first-release evaluation. It must distinguish preparation from Task-causal execution, recheck permission and relevance at actual dispatch, preserve model-visible and durable not-executed outcomes, and never transfer new Attempt authority to an old response. It does not permit automatic replay, retrospective evidence admission, or bypassing preset restrictions.

## Inputs from the G13 resolution

[G13 ExecutionAttempt and correlation protocol](G13-task-work-correlation.md) keeps the ordinary path deliberately singular: one Agent turn and one primary Binding per Attempt, one causal owner per native execution, and a new Attempt for every semantic retry. First-release admission preserves but rejects `AttemptGroupId`. This ticket owns any measured optimization that relaxes those rules through Attempt Groups, multi-Attempt batch execution, shared-execution deduplication, winner or quorum policy, loser cancellation, or cost-aware routing; each requires an evidence trigger and a deterministic single-Attempt fallback.

## Inputs from the G7 resolution

The first release admits immutable complete write-scope sets atomically and rejects runtime enlargement. This ticket owns runtime scope expansion, shared/read locking, predicate- or row-level scopes, lock preemption, contention-aware granularity, reservation batching, and specialized conflict indexes only when first-release evidence shows that conservative ancestor scopes or unbounded serialization cause material latency, starvation, or lost parallelism. Each extension must preserve replayable all-or-nothing admission, prevent partial-hold deadlock, and retain deterministic fallback to conservative ancestor or unbounded serialization.
