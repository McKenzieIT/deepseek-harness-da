# Agent Note: Remove the dead nl2sql-engine eval/ runner subpackage

Status: proposed

## Problem

`packages/data/nl2sql-engine/src/eval/` (8 files: `runner.ts` `runEval`/`EvalResult`/`EvalDetail`, `cases.ts` `EVAL_CASES`/`FIXTURE_DATA_SOURCES`, `scorer.ts` `scoreMatch`, `join-cases.ts`, `comparison-runner.ts` `runComparisonEval`/`ComparisonResult`, `metric-cases.ts`, `live-comparison-runner.ts`, `k11-join-cases.ts`) is a TS port of `prototypes/p13-nl2sql-engine/eval/*.mjs` superseded by `eval-runner-service`'s YAML runner. The production eval harness imports ONLY `Nl2sqlEngine`/`Bm25Linker`/types from nl2sql-engine (`eval-runner-service/src/index.ts:45,54`; `eval-cli/src/context.ts:18,28`; `eval-cli/src/p15-probe.ts:9`) and loads cases from a YAML `caseDir`, not from `EVAL_CASES`. A grep (excluding nl2sql-engine) for the runner symbols (`runEval`, `runComparisonEval`, `scoreMatch`, `ComparisonResult`, `EvalDetail`, `JOIN_EVAL_CASES`, `METRIC_EVAL_CASES`, `buildJoinFixtureGraph`) finds ZERO production or cross-package consumers — only nl2sql-engine's own tests. The sole cross-package consumer is `FIXTURE_DATA_SOURCES` (`cases.ts`), imported by `tool-retrieve/tests/retrieve.spec.ts:14` and `tool-search-data-sources/tests/search-data-sources.spec.ts:13` as test-fixture data. The subpackage is re-exported at `nl2sql-engine/src/index.ts:46-51`. This is distinct from the eval-core dead-stack note ([[delete-unused-eval-core-runtime-stack]]): that note owns `verdict_mapper` + `runMultiTurnCase`/`passKVerdict`/`runBatch`/`computeDelta` in `packages/eval/eval` + `eval-runner`; this note owns the `packages/data/nl2sql-engine/src/eval/` port — different package, different symbols.

## Proposal

Remove the dead runner machinery (`runner.ts`, `scorer.ts`, `comparison-runner.ts`, `metric-cases.ts`, `live-comparison-runner.ts`, `k11-join-cases.ts`, `join-cases.ts`) + their consuming tests + the `index.ts:46-51` re-exports. Relocate `FIXTURE_DATA_SOURCES` (the one cross-package-consumed symbol) into a shared test-support home (e.g. `dsh-test-support`, or the consuming specs' own fixtures) so `tool-retrieve`/`tool-search-data-sources` tests still build. The prototype `.mjs` in `wayfinder/prototypes/` is frozen reference material, unaffected.

## What we give up

A second eval engine someone might have intended to wire. It is not wired, and `eval-runner-service`'s YAML runner is the live path — keeping it is a standing footgun for whoever next touches eval.

## Alternatives considered

**Keep the subpackage as a TS reference for the prototype `.mjs`.** It is a TS port of `prototypes/p13-nl2sql-engine/eval/*.mjs`, so it could serve as the runnable reference. It lost because the production eval harness imports only `Nl2sqlEngine`/`Bm25Linker`/types from nl2sql-engine and loads cases from a YAML `caseDir`, not from `EVAL_CASES` — the subpackage has zero production or cross-package consumers (only its own tests plus one relocated fixture), and the prototype `.mjs` in `wayfinder/prototypes/` is the frozen reference, unaffected.

**Merge with the eval-core dead-stack note.** Both remove dead eval machinery. It lost because they own different packages and symbols — this note owns `packages/data/nl2sql-engine/src/eval/`; the other owns `packages/eval/eval` + `eval-runner` (`verdict_mapper`, `runMultiTurnCase`, etc.) — and merging them conflates two independent removal scopes with different owners and acceptance greps.

## Acceptance criteria

- `grep -rn "from.*nl2sql-engine.*eval|EVAL_CASES|runEval|runComparisonEval|scoreMatch" packages/eval/ scripts/ examples/` returns empty after removal (the relocated `FIXTURE_DATA_SOURCES` import is updated).
- `eval-runner-service` + `eval-cli` boot and run a k11 eval unchanged (they never imported these symbols).
- nl2sql-engine `pnpm test` green after dropping the consuming specs (fixture relocated).

## Risks

If a researcher re-runs a frozen comparison experiment, point them at the prototype `.mjs` or `eval-runner-service` YAML rather than rehydrating. Confirm the experiment-audit-log does not cite these symbols (it uses `eval-runner-service` YAML + `compare.ts`). Do not merge with the eval-core dead-stack note — different package, different owner.
