# Agent Note: Execution grader seam — one executor port, grader-assembled provenance

Status: proposed

## Problem

`packages/eval/` carries two parallel execution-grading stacks, and the one that draws the distinction the eval most needs is dead code.

`packages/eval/eval/` defines `CaseSqlExecutor = (sql) => Promise<ExecutionResult>` (`src/types.ts:141`), whose `ExecutionResult` carries a `failureClass` (`src/types.ts:48-59`) splitting *the SQL is wrong* (`syntax_error`, `guard_rejected`) from *the warehouse did not answer* (`infrastructure`, `timeout`, `patience`, `src/types.ts:28`). `mapQueryOutcome` maps a `pending` outcome to `patience` so an unresolved async query is refused rather than mis-scored (`src/classify_failure.ts:94-102`), and `src/types.ts:139` records the intended host wiring verbatim: `ctx.query.execute` → `mapQueryOutcome` → this. About 30 assertions in `tests/classify_failure.spec.ts` cover it.

A repo-wide grep finds `mapQueryOutcome` referenced only by its own module, its `src/index.ts:23` export, two doc comments, and its spec. `eval-runner` and `eval-cli` never call it. They use a flatter `QueryExecutor` → `QueryResult` with a boolean `success` and a string `error` (`packages/eval/eval-runner/src/types.ts:225-236`), normalized by two host forks that have already diverged (`packages/eval/eval-cli/src/context.ts:227-245`, `packages/eval/eval-runner-service/src/index.ts:189-213`; the former skips the column zip the latter performs).

Three consequences are load-bearing for every number the eval reports:

- **Infrastructure failures are scored as model failures.** `withInfraRetry` only catches thrown errors (`eval-runner/src/infra_retry.ts:80-84`), but `CtxQueryExecutor.execute` catches everything into `{success:false}` (`eval-cli/src/context.ts:236-238`), so `eval-runner/src/runner.ts:252-255` turns a dead backend into `executionMatch = false` → verdict `wrong`. The executor's infra-retry path is unreachable, and `classifyInfraFailure` string-matches error text (`infra_retry.ts:29-58`) although the provider already returns a typed `failureKind`.
- **Provenance is discarded at the file boundary.** All 39 cases in `packages/eval/eval/cases/rbi-10000251-exec/` carry `expected.sql`, `meta.anchor_ds`, `meta.tier`, and `meta.provenance`; `EvalCaseSchema` declares none of them and zod strips unknown keys (`eval/src/eval_case.ts:39-44`, `:54-58`), so a `loadCase` on such a file returns `expected` keys `result_value,match_mode,answer,delivery_match` and no `meta`. The reference SQL and snapshot anchor a replayable grade needs are present on disk and unreachable from the eval path.
- **Scoring detail is thrown away.** The core comparator returns an `AssertionResult` with a `detail` string; the runner's private wrapper collapses it to a boolean (`eval-runner/src/runner.ts:368-369`), and evidence rows are truncated to five (`:257`), so a failed grade cannot be explained or replayed.

The split is accidental, not designed. P11b built the seam and deferred CLI/persistence to P11c (`wayfinder/data-agent/tickets/phase-4/P11b-eval-harness-hardening.md:41`, `:50`); five days later W3 built a second batch runner that did not consume it, and P11c wired to W3's. No ticket or note states a reason for the coexistence, and the duplication is visible as `runner.ts` (178 dead lines vs 423 live), `persistence.ts` (196 vs 68), and `health-gate.ts` vs `health_gate.ts` (116 vs 102) — the filename convention itself diverged.

## Proposal

Lock six architecture-invariant properties of the execution grader seam, and defer package placement to the Benchmark/Harness/Environment split.

1. Model error, warehouse failure, and judge opinion are three independently recorded facts; none may overwrite another.
2. Execution is the primary verdict. The LLM judge reports separately and never overrides an execution mismatch.
3. A reference-SQL execution failure is a benchmark infrastructure failure, not a model failure, and never scores the candidate zero.
4. The injected port hands over a capability, not a verdict: `{ execute(sql, signal?), attach?(instanceId) }` returning the provider's raw `QueryOutcome`. Evaluation does not depend on `MaxComputeQueryEngine` and does not grade through the model-facing `query_data` rendering layer. `attach` stays optional so that treating a non-terminal `pending` as environment-blocked remains a policy choice rather than a structural dead end.
5. `ExecutionResult` carries only what the executor observes — rows, columns, row count, truncation signal, the SQL actually executed, the provider `failureKind`, elapsed time. Snapshot identity, comparator policy id and version, and result digests are assembled by the grader from run config plus case, as a separate evidence record. Snapshot and policy are properties of a case bound to an environment, not of one SQL execution; putting them in the port would force every host to supply them per call.
6. Truncation and timing are observed by evaluation, not taken from the provider's claim. The real provider hardcodes `truncated: false` and `durationMs: 0` (`packages/query/query-maxcompute/dev/maxc-sidecar.mjs:101`, `:103`) and passes no `--max-rows` (`:141`). The adapter measures its own wall clock. The truncation signal `rowCount !== rows.length` — where `rowCount` comes from maxc's self-reported `row_count` (`:100`) — is an untested hypothesis and must be validated against a known oversized result set before it is relied on; if the two never diverge, evaluation has no truncation signal and the provider needs a defect ticket.

### Added by the independent redo (2026-09-08)

A second grilling session re-derived this seam without reading the six properties above, then reconciled. It keeps them, moves one boundary, and adds five properties.

**Moved.** Normalization from `QueryOutcome` to a comparable artifact belongs to evaluation as a pure function, not to the host. Property 4 originally had each host call `mapQueryOutcome` before handing results over; letting hosts map is what forked the adapters in the first place, so the port now yields the raw outcome and `normalizeOutcome` is evaluation's.

7. An attempt's execution outcome is a five-member closed union: `pass`, `fail`, `environment-blocked`, `case-defect`, `not-measured`. `environment-blocked` covers connectivity, credentials, throttling, timeout and a non-terminal `pending`; `case-defect` covers an unknown or misspelled `match_mode`, missing or self-inconsistent expected values, and reference SQL that will not execute. The two stay apart because their remedies differ — rerun versus fix the corpus — and their trends read in opposite directions. Published precedent supports separating them: the distilled test-suite evaluator asserts rather than scoring zero when gold will not execute, and GradeSQL discards execution-error candidates instead of labelling them incorrect. `environment-blocked` itself has no published precedent, because those benchmarks execute against local SQLite; it is this repository's own choice.
8. `not-measured` is an explicit member, not a missing value. A judge score never fills the execution dimension, and cases carrying only a delivery expectation record `not-measured` rather than inheriting a default `true`.
9. Every run records its execution mode and comparator policy version. Results missing either refuse to render in comparison output, on the same principle as refusing to render a comparison without `n_d` and a p-value.
10. Grading splits into `normalizeOutcome(outcome)` and `gradeExecution(artifact, expected, policy)`, both pure, with the artifact between them as the persisted record. The split is load-bearing: the comparator-policy mutation baseline has to re-grade stored artifacts across dozens of policies offline, and it requires raw and normalized digests, which exist only when normalization is its own persisted step. Artifact persistence takes a configured row cap plus digests of the full raw and normalized results, so replayability does not become unbounded blobs.
11. The execution corpus is rebuilt rather than patched. Measured against the published standard — gold is human-written reference SQL, and gold executes alongside the candidate — the 143 execution cases are not benchmark cases: none carries reference SQL, their expected values' provenance is unrecoverable, and 86 of them assert only a row count. Models may not author or adjudicate gold. Scope and sequencing belong to the ground-truth lifecycle decision, not here.

**Why the recorded mode matters.** Only four batch runs in `eval-results/` record whether the warehouse was connected. Among those, the same 39 cases under the same model and same `pass_k` read 61.5% judge-only against 5.1% with real execution. The other 35 batch runs — every 168-case run among them — carry no config block at all, so no full-corpus run has ever demonstrably executed SQL. Together with the contaminated 39-case baseline noted below, both historical baselines are unusable and T1 must re-establish one rather than compare against them.

## What we give up

Wiring the runner to the core seam changes behaviour twice over, so it cannot land as a pure refactor. `mapQueryOutcome`'s `zipRow` keys rows by column name (`eval/src/classify_failure.ts:115-124`) while the runner's comparator keys them positionally as `col<i>` precisely because aliases vary across models and dialects (`eval-runner/src/runner.ts:360-367`); adopting the former can flip any case whose model chose a different alias. And because the sidecar's wait window defaults to 60s while event-view queries measure 68s (`maxc-sidecar.mjs:134-140`), promoted-to-pending queries become `patience` refusals, moving event cases out of the scored denominator rather than into it. Both require a recorded re-baseline.

## Alternatives considered

**Extend the runner's `QueryResult` in place with a `failureClass`.** The smallest diff, and it keeps the additive-only posture. It lost because two normalizations and two failure vocabularies persist, so the drift that already produced a wrong-shaped `rows` in one fork can recur, and none of the replay evidence R1 requires becomes reachable.

**Port the classifier into `eval-runner` and let the core module die with the rest of the dead stack.** Consistent with a strict reading of the existing note that proposes deleting the unused eval-core runtime stack, which names `dsh-eval-runner` the eval-runtime home. It lost because it rewrites roughly 30 assertions' worth of already-tested logic for no behavioural gain, and abandons the zero-seam-dep discipline that lets the core be tested without a Cordis context.

**Design the grader from scratch against the paper requirements.** Attractive because the comparator's five `match_mode` enums and the case schema are both the wrong shape for a versionable per-case policy. It lost only for the failure classifier, which is the one piece already aligned with all four benchmarks and already tested; the comparator and case schema are replaced under every option anyway, so a full rewrite buys nothing there and costs the comparability of the existing baseline.

**Merge `dsh-eval` and `dsh-eval-runner` into one package.** Tempting because the live import surface between them is four symbols. It lost because the dependency graph is already clean and acyclic, consumers outside `packages/eval/` discriminate between the layers, and the Benchmark/Harness/Environment split owns package boundaries — merging now would have to be undone there.

## Acceptance criteria

- One executor port, `(sql) => Promise<ExecutionResult>`; `QueryResult` and both host forks retired.
- The three facts are distinguishable in the persisted run artifact, and infrastructure failures do not enter the `wrong` denominator.
- A failed grade records why it failed: the comparator's `detail` survives, and evidence is sufficient to replay — the SQL actually executed, snapshot id, policy version, raw and normalized digests.
- The truncation signal is measured, not assumed.
- A regression set covers duplicate rows, NULL versus 0, float boundaries, string-encoded numbers, column permutation, extra columns, presence and absence of `ORDER BY`, multiple accepted results, timeout, reference-SQL failure, and single-snapshot false positives.
- A re-baseline is recorded for the two behaviour changes named above.

## Risks

Behaviour: both changes under "What we give up" move recorded pass rates, and the 12.8% real-execution baseline is measured on the same 39 cases whose event expectations are already known stale, so the comparison point is itself compromised and must be re-derived rather than trusted. Scope: package placement and case-schema ownership are deliberately excluded here; deciding them implicitly during implementation would pre-empt the Benchmark/Harness/Environment split. Sequencing: making the reference SQL reachable is a prerequisite, not a follow-up — the loader discards it today.
