# @deepseek-ai/dsh-eval-runner

English | [中文](README.zh.md)

Eval evidence engine: batch runner with strict pass^k, case/reference-SQL preflight, typed infrastructure retry, replayable execution artifacts, compatibility-checked run configuration, result persistence, before/after delta comparison, and a health gate for the data-agent evaluation harness.

Before the candidate Agent runs, each structurally valid case is checked for usable grading content. A resolvable reference SQL is executed when an executor is available: environment failures become `infra_failure`, invalid reference SQL or disagreement with the declared expected result becomes `case_defect`, and neither enters the model-error denominator. Every returned `CaseVerdict` carries the preflight evidence and the source path, schema version, scope, expected fields, metadata, and resolved reference SQL needed for offline rescoring. Infrastructure retry applies only to SQL execution after one model response has been sampled, so one `pass_k` attempt never silently becomes multiple model samples.

## Model Experience

None, as this model-agnostic eval runner delegates all model calls to the injected responder and judge.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- `pass_k` verdict semantics only — there is no best-of-k fallback here.
- The health-gate is pre-flight only; there is no mid-run re-check.
- Infra-retry is bounded by the run option `max_infra_retries`; both thrown infrastructure errors and typed retryable outcomes use the same bound.
- A persisted artifact whose row cap omitted data needed by a comparator returns `not-measured` during offline regrading; a Provider that did not materialize its full result returns `environment-blocked`.
