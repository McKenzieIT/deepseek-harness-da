# B-DA7 — phase-gate has no terminal state for infrastructure failures

**Type**: bug · **Status**: open · **Phase**: misc
**Severity**: medium（不影响正确性，但每次基础设施故障白烧 2 轮模型往返；且终止决策在 transcript 里不可见，误导诊断）
**Blocked by**: nothing
**Serves**: stop burning model rounds re-generating SQL that a missing binary can never fix, and make the terminal decision observable
**Related**: [B-DA1](B-DA1-preset-switch-tool-interrupt-race.md)（同为 data-agent 运行时行为缺陷，同样以 JSONL `turn/end` 判据收口）；发现于 [UM17](../phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md) 的恢复循环定性

> **Provenance and namespace correction (2026-09-15)**: first written as `UM18` under `tickets/phase-upstream-merge/`, which was wrong twice over — the finding is not upstream-merge work (the Attribution section below proves it predates the merge), and keeping it on that phase's frontier meant the merge specialty could never converge. Per the wayfinder rule, work past a phase's boundary comes off that phase's frontier and lives in the owning namespace; `B-DA*` is this repo's existing namespace for data-agent behaviour bugs, so it moved here. This is a **phase-boundary** re-homing, not a map-level out-of-scope ruling: the defect is still inside the data-agent map's destination, so the map records it in the upstream-merge section's 2026-09-15 audit entry (with a pointer here) rather than in `## Out of scope`. PR #130's body, which named UM18, was updated to this id.
>
> **Dedupe check before keeping it as a new ticket**: `pendingSwitch`/`honest_decline`/`failureKind`/`max_fallbacks` were grepped across all 200+ data-agent tickets. The only hits were [M3](M3-self-evolution-blockers.md), [P-DA2](P-DA2-relax-generation-gate.md), [M4](M4-update-table-config-persistence.md) and [GA-EVAL-RETRY-FEEDBACK](GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) — all **resolved**, and all about other concerns (self-evolution prerequisites, the GENERATION gate relaxation, `update_table_config` persistence, eval retry feedback). None owns "an infrastructure-class execution failure has no terminal branch", so this genuinely had no existing home.

## Question

When `query_data` fails with an infrastructure error such as `spawn maxc ENOENT`, the phase gate falls back to GENERATION and re-runs critique and execution. Regenerating SQL cannot install a missing binary. What is the terminal behavior for infrastructure-class failures, and how does the terminal decision become visible in the session transcript?

## What was observed (2026-09-15)

Recorded session `session-2c6151a1-fab4-4752-8990-1fc9513da488` (137 records, 1 turn, 19 steps, 137.8 s), from PR #130 head `1c6185d6f462fc59b8983986249428879912334e`, prompt `查询应用 <redacted> 昨天的 DAU，并简要说明查询过程。`:

- `query_data` ran 3 times, each ending in `Query failed (transport): spawn failed: spawn maxc ENOENT`.
- Between them: 2 complete `[fallback → generation]` → `critique_sql_tool` (confidence 1.00) → `evaluate_sql_quality` (100) → `[phase advance → execution]` cycles, plus one `[phase generation retry] gate failed: critique not run` inject.
- **Every retry was a real billed model round.** Steps 11-18 alone consumed **15,588 input + 5,241 output tokens** (whole run: 42,849 input / 9,416 output / 85,248 cacheRead), re-verifying SQL that was never the problem.
- The three transport failures carry `isError: false` — they are successful tool results whose payload is a failed `QueryOutcome`.

## The loop is bounded — that part is correct

`max_fallbacks: 2` at [`packages/data/phase-gate/src/domain.ts:130`](../../../../packages/data/phase-gate/src/domain.ts) (re-declared in the mounted preset at `packages/bundle/data-agent/presets/data-agent/agent.cordis.yml:72-76`) is enforced at `packages/data/phase-gate/src/phase-gate.ts:381-385`, and `fallback_count` is deliberately not reset by `advance()` (`phase-gate.ts:727-740`). The observed run terminated at exactly the predicted third failure via `honestDecline()` (`phase-gate.ts:753-761`). No runaway.

## The three real defects

1. **No terminal branch for infrastructure-class failures.** `phase-gate.ts:360` is the only `failureKind` branch in `executionDecision`, and it special-cases `not_found` only. `transport` therefore falls through to the generic recover path at `phase-gate.ts:381`. The classification chain is intact and honest — `maxc-sidecar.mjs:88` labels it `failureKind: 'transport'`, and `classifyMaxcError` (`packages/query/query-maxcompute/src/index.ts:179-187`) returns `'unknown'` for a spawn error so the coarse `transport` label survives (`src/index.ts:436`) — the gate simply has no way to express "SQL regeneration cannot fix this". Desired terminal behavior: a bounded stable incomplete/infrastructure result. Absence of `maxc` must not become success, and must not consume further model rounds.
2. **The terminal decision is invisible in the transcript.** `honestDecline()` writes only `ctx.logger.info` (`phase-gate.ts:759`) and emits no session record, so a transcript shows the retries but not the stop. That is why this incident initially read as unbounded. A session-visible decline record is the fix.
3. **The exhaustion branch is untested.** `grep` for `max_fallbacks` / `fallbacks exhausted` in `packages/data/phase-gate/tests/phase-gate.spec.ts` returns zero hits: every EXECUTION-failure test stops at `fallback_count === 1` (`:541` semantic, `:600` not_found). No test drives the ceiling, asserts the terminal `honestDecline` at `phase-gate.ts:385`, or uses `failureKind: 'transport'` on the EXECUTION path.

## Reproducer seam (already exists, deterministic)

`packages/data/phase-gate/tests/phase-gate.spec.ts:541-559` is the template: `makeAgent()` (`:28`) fakes `inject`/`cancel`/`session.snapshotEvents`, `g.state('s1')` exposes mutable state, and `onPostExecute(execView('query_data', …), resultOk({ state: 'failed', failureKind: 'transport' }), …)` followed by `onTurnStopping()` drives the decision directly. No sidecar spawn, no network, no LLM. Use TDD from this seam.

## Attribution — not merge-introduced

Every owning file is byte-identical across the fork's pre-merge tip `c50a428e95791239dc50d8c033ee05a898b030c7` and the PR #130 merge `d1ef7dc6d6f0e3b1b7ed27e12abd6658133398ff`: `domain.ts` (the budgets), `phase-gate.ts`'s `executionDecision`/`fallback`/`advance`/`honestDecline`, `classifyMaxcError`, the sidecar's `transport` label, and the query-tool render. The merge contributed one `oxlint-disable` comment in `phase-gate.ts` and a test-double rename in `phase-gate.spec.ts` (`session.events` → `session.snapshotEvents()`), both behaviorally inert. The preset moved from `apps/cli/config/agent-presets/` to `packages/bundle/data-agent/presets/` with 100% similarity and byte-identical budget values.

## Acceptance

- An infrastructure-class execution failure reaches a stable terminal result after a bounded attempt count, without further model rounds, and never renders as success.
- The terminal decline is observable in the session transcript, not only in logger output.
- Tests drive `fallback_count` to the ceiling and assert the terminal branch, including one `failureKind: 'transport'` case.
- The recorded transcript's caveat is noted: it lacks `turn/end` and ends on an empty `assistant/attempt` at step 19, so the process was hard-stopped after the decline. `turn/end` is otherwise unconditional (`packages/core/agent-loop/src/agent.ts:339`); do not read its absence as a missing-stop defect.
