# Agent Note: Manual Task DAG focus before aggregation

Status: proposed

English | [中文](2026-09-22-task-dag-manual-focus.zh.md)

## Problem

A data-agent user needs to explain a blocked result without losing sight of unrelated failures. Structural compression adds group identities and mixed-state summaries before their reading benefit is established.

## Proposal

Use manual dependency focus as the first simplification slice. The accepted, unimplemented [DAG view simplification specification](../../../../wayfinder/task-orchestration-dag/tickets/G11-dag-view-simplification-strategies.md#answer) owns behavior and verification; the Task DAG journal remains authoritative. No existing active Agent Note owns this presentation decision.

The marginal implementation is a pure local selector plus boundary disclosures and out-of-focus attention. It reuses current values, Task details, and the existing renderer rather than adding model calls, persistence, or scheduling. This serves ad-hoc analytics without requiring a well-grouped plan and preserves the independent core and replaceable renderer direction.

## Alternatives considered

**Group-first folding** benefits stable engineering pipelines but adds cross-group relation and mixed-assurance rules before evidence of repeated group inspection.

**One-hop focus with expansion** limits initial density but requires extra navigation and expansion state to discover distant causes and effects.

**Pinning unrelated failures into the graph** makes them directly visible but weakens the meaning and stability of a user-selected dependency scope. An external attention summary retains explicit navigation.

## Acceptance criteria

The G11 specification defines exact membership, omissions, attention, identity continuity, and failure fixtures. Implementers must supply the specified pure, browser, and keyless current-view evidence; this planning change claims no runtime or scale result.

## Risks

A central Task can still expose most of the graph. Structural summaries and extended filters remain named follow-ups in G11; measured renderer scaling remains separate. The first release gives up automatic compression, not truthful dependency or failure information.
