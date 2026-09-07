# @deepseek-ai/dsh-eval-runner

Eval evidence engine: batch runner with pass_k, result persistence, before/after delta comparison, health-gate, and infra-retry for the da eval harness

## Known Limitations and Deferred Work

- `pass_k` verdict semantics only — there is no best-of-k fallback here.
- The health-gate is pre-flight only; there is no mid-run re-check.
- Infra-retry is bounded by `MAX_FEEDBACK_RETRIES`.
