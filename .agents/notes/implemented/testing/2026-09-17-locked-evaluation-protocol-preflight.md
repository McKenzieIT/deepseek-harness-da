# Agent Note: Locked evaluation protocols fail before external Attempts

Status: implemented

English | [中文](2026-09-17-locked-evaluation-protocol-preflight.zh.md)

## Problem

A controlled evaluation can spend model calls and mutate external systems before discovering that its frozen Case Manifest cannot satisfy a later stage's selection or pairing rules. Treating that contradiction as an ordinary failed Attempt contaminates denominators and encourages an operator to substitute convenient cases after seeing the available corpus.

## Decision

An Evaluation Controller validates every stage's case-selection requirements, arm counts, replicate counts, Task material identity, and tool-catalogue identity before it starts an external Attempt. A mismatch is a protocol error: the controller stops before network, provider, sidecar, or warehouse access and requires an explicit protocol amendment. Infrastructure failures remain separate immutable Attempt outcomes and never become `wrong`, `declined`, or `correct` grades.

The [phase-gate incremental-value experiment](../../../../wayfinder/task-orchestration-dag/tickets/G25a-phase-gate-incremental-value-experiment.md) applies this rule. Its amended real-execution slice contains ten L2 cases and two L3 cases. Stage 1 therefore uses the explicitly approved 3×L2 + 2×L3 + one persistent-failure mix; the controlled runner rejects any manifest that cannot supply those named cases before consuming a smoke or decision Attempt.

Raw Session events and query rows remain in the ignored Evidence Cut. Committable observations retain identities, digests, counts, categorical outcomes, grades, and cost only. Session extraction, deterministic grading, paired analysis, and fault injection are pure or controlled facilities tested before a real run.

## Alternatives considered

**Silently substitute the nearest available complexity mix.** Rejected because changing the smoke population without an approved amendment breaks the frozen protocol and makes the later decision conditional on an unrecorded choice.

**Run the decision batch and document the smoke gap afterward.** Rejected because Stage 1 is the admission check for the expensive batch; bypassing it spends evidence budget before the evaluation machinery has established that it can measure the declared comparison.

**Count provider, sidecar, or warehouse failures as model failures.** Rejected because those outcomes measure environment availability, not the evaluated orchestration policy, and would bias whichever arm encountered the outage.

## Consequences

Protocol preflight can require a human amendment even when the implementation is otherwise ready. That pause buys a reproducible Comparison Plan, preserves decision Attempts, and prevents infrastructure availability or operator substitutions from entering the causal estimate.
