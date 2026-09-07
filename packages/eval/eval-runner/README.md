# @deepseek-ai/dsh-eval-runner

English | [中文](README.zh.md)

Eval evidence engine: batch runner with pass_k, result persistence, before/after delta comparison, health-gate, and infra-retry for the da eval harness

## Model Experience

None, as this model-agnostic eval runner delegates all model calls to the injected responder and judge.

#### KV Cache effect

The package registers nothing model-facing, so no KV-cache prefix is extended or invalidated.

## Known Limitations and Deferred Work

- `pass_k` verdict semantics only — there is no best-of-k fallback here.
- The health-gate is pre-flight only; there is no mid-run re-check.
- Infra-retry is bounded by `MAX_FEEDBACK_RETRIES`.
