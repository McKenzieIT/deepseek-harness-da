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

## Alternatives considered

**Keep the dead stack as a parallel pass^k implementation.** It encodes "must pass every time" semantics the live path now also reports, so it could cross-check `passKVerdict`. It lost because the two disagree on the metric, the dead copy has zero callers, and its `OUTCOME_RANK`/`VERDICT_SEVERITY` orderings are themselves uncalled and mutually inconsistent — a contradictory second implementation is a footgun, not a cross-check.

**Keep only the types, defer the function deletions.** `AttemptResult`/`RunnerVerdict` are still imported, so preserve them and leave the runtime functions for a later sweep. It lost as a scope reduction (the proposal already keeps the types), not as a sequencing escape: the dead runtime functions are the duplication this note removes, and the `pass_k` semantics decision has already shipped, so there is no reason to keep the second runtime copy.

## Acceptance criteria

- `verdict_mapper.ts` deleted; `runMultiTurnCase`/`passKVerdict`/`runBatch`/`computeDelta` removed (types kept if still imported).
- One `pass_k` semantics, named honestly (flag/metric renamed OR `bestOfKVerdict` changed + re-baselined).
- `OUTCOME_RANK`/`VERDICT_SEVERITY` removed or reconciled to one canonical ordering.
- `pnpm run lint && pnpm run typecheck && pnpm run test` green; an eval run's recorded pass_rate matches the chosen, honestly-named metric.

## Risks

Behavior: changing `pass_k` to pass^k LOWERS the recorded pass_rate (a case with one passing attempt in k=3 would flip pass→fail) — re-run the K11 eval + re-record in `experiment-audit-log.md` (the whole point of the metric is anti-flakiness; the current best-of-k was inflating it). Public API: `dsh-eval`'s exported `runBatch`/`passKVerdict` may be imported by out-of-tree eval consumers — grep the monorepo first; if only types are used, narrow the exports.

## 2026-09-04 更新：`pass_k` 语义那一项**已被解决**（本 note 的其余部分仍有效）

本 note 当时写道「the live eval path ... `bestOfKVerdict`」、「Pick **one** canonical
`pass_k` semantics ... either rename the CLI flag/metric to `best-of-k`/`pass@k` ...
or change `bestOfKVerdict` to pass^k and re-baseline the recorded pass_rate」。

**第二条路已经走完**：
- `bestOfKVerdict` → `passKVerdict`（`packages/eval/eval-runner/src/runner.ts:378`，
  `every(attempts)` 全中才算过），随 GA-AUDIT1 / `cfbb710b50` 落地。
- 已 re-baseline：当前基线 `rebaseline-passk-168-clean` = **61.9%** pass^k
  （commit `56c74aebae`），`eval-cli/README.md` 已声明 "pass^k semantics is LIVE"
  并按新语义重设 Quality Targets。
- `RunResult.config` 现持久化 `pass_k` + `verdict_semantics`，`compare.ts` 已加
  协议守卫（跨 k 比较 exit 2），`scripts/run-eval.sh` 的 `--pass-k 1` 偏离已移除
  （commit `236f876f2a`）。

所以验收项「One `pass_k` semantics, named honestly」**已满足** —— 指标名与实现
现在一致（都是 pass^k），且 CLI 默认 `--pass-k 3` 与 SPEC §6.5 / D9 Q2 对齐。

**仍然有效的部分**：删除 `verdict_mapper.ts`、移除 `eval/eval/src/` 里未被调用的
`runMultiTurnCase`/`runBatch`/`computeDelta` 运行时函数（`passKVerdict` 现已是活语义，
但 `eval/eval` 里那份仍是与 `eval-runner` 并存的第二实现——**并存本身仍是本 note 要
消除的重复**）、以及 `OUTCOME_RANK`/`VERDICT_SEVERITY` 这对互相矛盾且无调用者的排序。
