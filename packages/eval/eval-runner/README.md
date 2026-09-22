---
description: "Eval evidence engine with strict pass^k, grading preflight, typed infrastructure retry, replayable execution artifacts, compatible run policy, persistence, delta comparison, and a health gate"
kind: "package-reference"
---

# @deepseek-ai/dsh-eval-runner

English | [中文](README.zh.md)

## Summary

TODO: fill in Summary — placeholder seeded from package.json description.

Eval evidence engine with strict pass^k, grading preflight, typed infrastructure retry, replayable execution artifacts, compatible run policy, persistence, delta comparison, and a health gate

## Table of Contents

- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


Eval evidence engine with strict pass^k, grading preflight, typed infrastructure retry, replayable execution artifacts, compatible run policy, persistence, delta comparison, and a health gate

Before the candidate Agent runs, each structurally valid case is checked for usable grading content. A resolvable reference SQL is executed when an executor is available: environment failures become `infra_failure`, invalid reference SQL or disagreement with the declared expected result becomes `case_defect`, and neither enters the model-error denominator. Every returned `CaseVerdict` carries preflight evidence and the case source path, schema version, scope, expected fields, metadata, and resolved reference SQL needed for offline rescoring. Infrastructure retry applies only to SQL execution after one model response has been sampled, so one `pass_k` attempt never silently becomes multiple model samples.

No runtime invariant companion is published because `@deepseek-ai/dsh-eval-runner` owns no independently observable relationship that can diverge from its runtime state.

## Dev Note

None.


## Model Experience

None, as this model-agnostic eval runner delegates all model calls to the injected responder and judge.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- `pass_k` verdict semantics only — there is no best-of-k fallback here.
- The health-gate is pre-flight only; there is no mid-run re-check.
- Infra-retry is bounded by the recorded run option `max_infra_retries`; thrown infrastructure errors and typed retryable outcomes use the same bound.
- A persisted artifact whose row cap omitted data needed by a comparator returns `not-measured` during offline regrading; a provider that did not materialize its full result returns `environment-blocked`.
