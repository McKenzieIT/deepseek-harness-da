# @deepseek-ai/dsh-query

English | [中文](README.zh.md)

Abstract query-engine seam (`ctx.query`): Service Definition for NL-to-SQL execution over swappable engine providers (MaxCompute first).

## Overview

Defines the abstract `QueryEngine extends Service` contract with four abstract methods: `execute`, `attach`, `cancel`, `getProgress`, plus the `getConventions()` seam method and the 3-state `QueryOutcome` vocabulary (Completed / Pending / Failed). `getConventions()` returns the loaded `EngineConventions` for prompt dialect grounding (key_differences / functions / cast_map / sql_templates); the default throws `'QueryEngine.getConventions: not implemented; override in a concrete provider subclass'`, and concrete providers like `MaxComputeQueryEngine` override it to return their loaded convention set. `estimate_cost` is CostGuard-internal and does not appear on the seam's public surface. The per-engine conventions type surface (`EngineConventions`/`ConventionFunction`/`ConventionCast`/`ConventionTemplate` in `src/conventions.ts`) lives in this package so consumers import engine convention types from the abstract seam, not a concrete provider. This package is the Def half of the query-trio (Def + Provider + Consumer); the Provider is `query-maxcompute`, the Consumer `tool-query` is deferred.

## Model Experience

Indirectly, through the deferred tool-query Consumer: it exposes `ctx.query.execute` outcomes as the model-visible tool surface, and this abstract seam registers no prompt, tool, or session event of its own.

#### KV Cache effect

No direct effect; this seam owns no prefix, and query outcomes enter the conversation only as the consumer tool's result content.

## Known Limitations and Deferred Work

- **tool-query Consumer not yet implemented** — the model-facing tool that exposes `ctx.query.execute` with session gates (G1 sampling / G5 COUNT / budget / near-dup / halt / cache / required_predicates) is deferred. Combined with the engine-wrapper guard chain, these form the query-trio remaining production work.
- **Engine-wrapper guard chain** — CostGuard (`estimate_cost`) / TimeoutGuard (`signal`) / RetryGuard / OrphanReaper are A1-split concerns that belong in a concrete `ctx.query.execute` wrapper; not yet implemented in the Def (current Def is minimal abstract).
- **Guard placement decision pending** — whether session gates and the guard chain land in the Def's concrete `execute` or as independent guard plugins requires further grilling.
- **NL-to-SQL is out of scope** — C1 decision: tool-query accepts strict SQL; natural language to SQL translation belongs to the semantic layer (P6/P13).
- **health_check** — provider health checking is deferred (P4 B decision).
