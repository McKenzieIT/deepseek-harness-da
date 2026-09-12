# Agent Note: Evaluation SQL execution through the query capability

Status: proposed

English | [中文](2026-09-07-evaluation-query-capability-boundary.zh.md)

## Problem

Execution-based evaluation must run candidate and reference SQL against an identified data snapshot, but SQL submission is not an evaluation concern. If evaluation owns warehouse clients, credentials, scope routing, pending-query attachment, cancellation, or provider failures, it creates a second execution stack beside the production query capability. If evaluation instead scores model-facing `query_data` rendering or transcript previews, presentation and truncation become part of the oracle and the score cannot be replayed from authoritative execution evidence.

The boundary is durable, while the evaluation interface, ground-truth lifecycle, and comparator defaults remain open decisions. Recording those unresolved details here would bypass the HITL decisions in [G1 — Execution grader seam](../../../../wayfinder/evaluation/tickets/G1-exec-grader-seam.md) and [G1b — Ground-truth lifecycle](../../../../wayfinder/evaluation/tickets/G1b-ground-truth-lifecycle.md), and the experiment in [R23 — Comparator-policy mutation baseline](../../../../wayfinder/evaluation/tickets/R23-comparator-policy-mutation-baseline.md).

## Proposal

Keep `@deepseek-ai/dsh-query` as the sole capability for SQL submission and backend lifecycle. Evaluation consumes `ctx.query.execute` through an injected adapter and independently executes the SQL that it scores. The query capability owns scope routing, credentials, provider requests and errors, pending-query attachment, cancellation, and progress. Evaluation owns conversion of `QueryOutcome` into evaluation evidence, snapshot and ground-truth provenance, result normalization, comparator policy, scoring, and persisted verdicts.

Evaluation depends on the query Service Definition rather than `MaxComputeQueryEngine` or another provider class. The scoring path consumes structured execution outcomes rather than the model-facing `query_data` rendering layer or a transcript preview. A provider-specific capability gap becomes a separate query/data-agent ticket only after G1 identifies a concrete missing operation or invariant; evaluation does not speculate a parallel provider API in advance.

### Deferred decisions

G1 decides the narrow adapter interface, `QueryOutcome` mapping, and the separation among execution verdicts, judge diagnosis, and infrastructure failures. G1b decides reference authorship and review, snapshot identity, artifact provenance, benchmark versioning, and treatment of legacy and delivery-only cases. R23 measures comparator profiles and exceptions before any default becomes authoritative. This proposal constrains ownership only.

The existing [eval adapter consolidation proposal](../../rejected/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md) addresses duplicated adapter implementations. This proposal neither supersedes that simplification nor chooses the adapter's package before G1 resolves its interface and ownership.

## Alternatives considered

**Build an evaluation-specific warehouse executor.** This would let the evaluator optimize directly for benchmark workflows, but it would duplicate credentials, scope routing, cancellation, provider error handling, and pending-query lifecycle. Production and evaluation could then disagree because they execute through different infrastructure.

**Depend directly on `MaxComputeQueryEngine`.** This is narrower than duplicating the client but couples evaluation to one provider implementation and bypasses the stable query Service Definition. It would make multi-provider evaluation and provider substitution require evaluation changes.

**Score `query_data` output or transcript previews.** This reuses the model-facing consumer without another adapter, but rendered output may be truncated, reformatted, or selected for presentation. A transcript also records what the agent saw, not an independently replayed authority for the SQL being scored.

**Move normalization and comparison into the query capability.** This would centralize result handling, but comparator policy, accepted artifacts, snapshot provenance, and verdict evidence are evaluation semantics. Moving them into query would make production execution depend on benchmark policy.

## Acceptance criteria

- G1 and T1 use an injected adapter over `ctx.query.execute`; evaluation packages do not implement provider submission, credentials, scope routing, pending-query attachment, cancellation, or progress.
- The execution-grader path has no direct dependency on `MaxComputeQueryEngine` and does not score `query_data` rendering or transcript previews.
- Persisted evaluation evidence distinguishes normalized execution results, execution or infrastructure failures, comparator policy, ground-truth provenance, and judge diagnosis sufficiently for replay.
- Any required query-capability extension is charted as a separate data-agent/query ticket with its Service Definition, provider, and consumer effects considered together.
- G1, G1b, and R23 remain the owners of the deferred decisions named above; this note does not resolve them.

## Risks

**The current `QueryOutcome` may be insufficient for replayable evidence.** G1 may expose a concrete missing field or lifecycle invariant. The response is to extend the query capability through a separate, complete capability-seam change rather than encoding provider knowledge in evaluation.

**Independent replay costs more than reusing transcript output.** Candidate and reference execution consume time and warehouse resources. Evaluation must apply explicit limits and persist enough evidence to avoid unnecessary repeats without treating cached presentation output as authority.

**Infrastructure failures can be mistaken for model failures.** The adapter must preserve the distinction, but G1 still owns the exact status model and retry semantics.
