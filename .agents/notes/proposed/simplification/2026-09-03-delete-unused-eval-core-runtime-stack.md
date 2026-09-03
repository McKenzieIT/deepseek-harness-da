# Agent Note: Delete the unused eval-core runtime stack (verdict_mapper + runBatch/runMultiTurnCase/computeDelta)

Status: proposed

## Problem

A whole eval-core runtime stack in `packages/eval/eval/` is dead at runtime — only its **types** are referenced:

- `packages/eval/eval-runner/src/verdict_mapper.ts` — `mapVerdict`/`mapAttempts` exported, **zero callers** (grep-confirmed).
- `packages/eval/eval/src/multi_turn.ts` (`runMultiTurnCase`, `passKVerdict`) + `packages/eval/eval/src/session.ts`/`runner.ts` (`runBatch`, `computeDelta`) — the live eval path (`eval-cli` → `dsh-eval-runner runBatch` → `bestOfKVerdict`) bypasses this stack entirely; only the `AttemptResult`/`RunnerVerdict` types are imported.

The dead stack also encodes the **pass^k** ("must pass every time") semantics that contradict the live `bestOfKVerdict` (best-of-k) the CLI actually runs — so it is not just unused, it is a misleading parallel implementation of the metric the repo calls `pass_k`. `OUTCOME_RANK`/`VERDICT_SEVERITY` (persistence.ts:165 / delta.ts) — the delta orderings this stack would use — are themselves uncalled and disagree with each other.

## Proposal

Delete `verdict_mapper.ts`. Remove the unused `runMultiTurnCase`/`passKVerdict`/`runBatch`/`computeDelta` runtime functions from `eval/eval/src/` (keep only the `AttemptResult`/`RunnerVerdict`/`QueryOutcome` type definitions + the `pass_k` naming decision — see below). Pick **one** canonical `pass_k` semantics (the live `bestOfKVerdict` reports best-of-k; the docstrings call pass^k "anti-flakiness" — reconcile: either rename the CLI flag/metric to `best-of-k`/`pass@k` and stop calling it anti-flakiness, or change `bestOfKVerdict` to pass^k and re-baseline the recorded pass_rate). Delete the inverted `OUTCOME_RANK`/`VERDICT_SEVERITY` pair (uncalled).

## What we give up

A second, "purer" eval engine that someone might have intended to wire in. It is not wired, its semantics contradict the live one, and its delta orderings are dead and inconsistent — keeping it is a standing footgun for whoever next touches eval.

## Acceptance criteria

- `verdict_mapper.ts` deleted; `runMultiTurnCase`/`passKVerdict`/`runBatch`/`computeDelta` removed (types kept if still imported).
- One `pass_k` semantics, named honestly (flag/metric renamed OR `bestOfKVerdict` changed + re-baselined).
- `OUTCOME_RANK`/`VERDICT_SEVERITY` removed or reconciled to one canonical ordering.
- `pnpm run lint && pnpm run typecheck && pnpm run test` green; an eval run's recorded pass_rate matches the chosen, honestly-named metric.

## Risks

Behavior: changing `pass_k` to pass^k LOWERS the recorded pass_rate (a case with one passing attempt in k=3 would flip pass→fail) — re-run the K11 eval + re-record in `experiment-audit-log.md` (the whole point of the metric is anti-flakiness; the current best-of-k was inflating it). Public API: `dsh-eval`'s exported `runBatch`/`passKVerdict` may be imported by out-of-tree eval consumers — grep the monorepo first; if only types are used, narrow the exports.
