# G25a — phase-gate incremental-value experiment

This directory holds the frozen protocol, the case manifest, the controlled runner, the scorer, the analyser, and the committable evidence for [G25a Phase-gate incremental-value experiment](../../tickets/G25a-phase-gate-incremental-value-experiment.md).

The experiment answers one question: with a Task DAG already owning planning, cross-turn continuation, Attempts, Holds, budgets, replanning, and completion verification, does the full four-phase phase-gate still produce enough independent user benefit to cover its model cost, latency, runtime complexity, and maintenance cost?

It builds evaluation facilities and evidence only. It does not implement the Task DAG product package, and it does not design phase persistence, phase UI, or a public inner-policy interface.

## Read this first

The protocol is frozen. The arms, thresholds, case set, primary metric, and artifact boundaries were fixed before any Attempt ran, and the ticket's amendment table records what changed on 2026-09-17 and why. Do not adjust them from smoke results or mid-batch observations — that is explicitly out of scope, and it is the single change that would make the thresholds meaningless.

Two upstream defects motivated building a runner rather than reusing the eval CLI. `HarnessAgentResponder` never makes `today` model-visible (`today` occurs once in `packages/eval/eval-cli/src/harness-responder.ts`, at `:172`, as a type declaration that is never read), and it never persists a real `query_data` outcome into the outer score (`query_result` does not occur in that file at all). Together those let a SQL judge award a pass to a query for the wrong dates.

A third defect motivated replacing the case set: the originally named `k11v2_*` cases carry no reference SQL, and their expected values are variously stale, semantically wrong, or fabricated. The evidence is in [G25a preflight — the locked case oracle cannot grade the decision batch](../../research/G25a-oracle-validity-preflight.md).

## Arms

Three arms share one model, one Task working set, one persona base, one tool catalogue, and one budget. Only the orchestration differs.

**State-machine arm** runs the current `@deepseek-ai/dsh-phase-gate` unchanged — its phase advance, phase prompts, tool whitelists, fallback, and honest-decline behaviour — with only the unified budget tightened. The experiment does not fix or tune phase-gate; any runtime defect is recorded as that arm's result. Its extra phase instructions, control markers, and injected continuations are the measured intervention and are counted in its token and call cost, never excluded.

**Policy-only arm** runs an ordinary Agent loop over the same tool catalogue with no phase enum, no phase index, no phase prompt substitution, no automatic advance, no fallback, and no phase-scoped whitelist. A single experiment plugin enforces four query-admission rules: a successful `load_table_definition` or `load_event_definition` must precede any `query_data`; `critique_sql_tool` must return confidence ≥ 0.6 for the SQL about to run; `evaluate_sql_quality` must return score ≥ 60 for that same SQL; and the SQL handed to `query_data` must match the last SQL that cleared both. Query errors go straight back to the model, which retries, re-queries, clarifies, or declines on its own. The plugin injects no phase advance and no fallback message.

**Diagnostic floor arm** shares the policy arm's persona, catalogue, critic-context observer, and budget but enforces no pre-query grounding, critic, quality, or same-source rule. The critic tools remain callable if the model chooses. This arm only explains where benefit comes from; it never triggers a retention verdict and is excluded from the causal difference.

The causal quantity is the paired per-case difference of state-machine minus policy-only. The floor arm is not in that difference.

## Retention thresholds

Relative to the policy-only arm, the full phase-gate qualifies for long-term retention only by satisfying the primary rule:

- severe unsupported answers reduced by **at least 50%**, with end-to-end correctness dropping **no more than 2 percentage points**.

The 8pp correctness rule from the original protocol is still computed and reported, but at n=12 real-execution cases `pass^3` moves in whole-case steps of 8.3pp, so it sits below the metric's resolution and cannot decide the question. The report must say so rather than presenting a coin-flip as a finding.

The full state machine must additionally satisfy:

- no material degradation on multi-step analysis, clarification, or recovery scenarios;
- where model calls, input/output tokens, or wall-clock latency rise by more than 30%, the report must show that measured user benefit covers the cost;
- close results, unstable direction, insufficient environment evidence, or a confidence interval spanning zero all yield "not enough to enlarge phase-gate", never "the two are equivalent";
- an uncertain result permits the first release to keep using an opaque compatibility executor, but does not support new phase persistence, phase UI, or a public inner-policy interface.

## Cases

Thirty-six cases: 12 real-execution and 24 behavioural.

The 12 real-execution cases come from `packages/eval/eval/cases/rbi-10000251-exec`, the only case set in the repository carrying reference SQL, and are the 12 whose oracle reproduced exactly on a non-degenerate value when audited on 2026-09-17:

```text
036 037 038 039 040 041 042 043 046 048 055 060
```

Reference date is **2026-08-06**, so `{{ds_yesterday}}` resolves to `20260805` and `{{ds_7d_ago}}` to `20260730`. Substitution happens when the manifest is generated, never at model time. Each generated case keeps a provenance reference to its source `case_id` and content digest.

Every case's own `expected.sql` is executed once at batch start and once at batch end. A case whose result summary or content digest differs between the two runs is marked `environment-unstable` and dropped from both decision arms' denominators simultaneously. This matters more than usual here: the audit showed the `ieu_ods` event view drifts within a month, which is why all 18 event-sourced cases were excluded and why only `dws` summary tables remain.

The 24 behavioural cases are authored here, six per category, and need no warehouse oracle because they are graded deterministically from Session evidence:

- **口径歧义** — one name has several still-valid readings with no default; expect one specific clarifying question before any execution.
- **无可用 grounding** — a metric or asset that does not exist or is outside the selected data domain; expect an explicit refusal with no SQL executed.
- **执行恢复** — the controlled sidecar fails the first query with a transient transport error or timeout, then recovers; expect success within budget and a final answer citing only the successful result.
- **持续失败** — the controlled sidecar fails every query; expect the agent to stop and say the data could not be retrieved, with no business conclusion.

## Task working set

Every arm receives a byte-identical fixed text envelope per case, standing in for what a Task DAG would hand one execution. It carries the goal, scope, absolute date range, read-only constraint, acceptance condition, evidence requirement, and budget. It never carries the reference SQL, the expected value, the grading rules, or any other Private Grading Material.

Absolute dates are written out in full. This is deliberate: a relative-date question let the historical harness generate a 2025 range and still be judged correct, so date ambiguity is removed as a confound rather than measured.

## Unified run control

Each Attempt gets a fresh Agent and Session. All three arms share:

| Setting | Value |
| --- | --- |
| provider | `aga` |
| model | `qwen3.7-max` |
| scope | `k11`, data domain `10000251` |
| semantic root | `examples/k11-semantic-layer` |
| MaxCompute project | `ieu_cdm` |
| reference date | `2026-08-06` |
| max model calls | 20 |
| max `query_data` calls | 8 |
| per-Attempt wall clock | 300 s |
| concurrency | at most 3 Attempts |
| model retry | one transport retry only when the provider explicitly returns a retryable infrastructure error |

A model semantic failure is never retried and re-badged as the same Attempt. Arm order within a case is shuffled per case and replicate from a fixed seed derived from `sha256("g25a-2026-09-17")`.

## Tool catalogue parity

All three arms expose exactly these tools:

```text
list_scopes  switch_scope  search_data_sources  load_table_definition
load_event_definition  update_table_config  present_clarification  resolve_term
critique_sql_tool  evaluate_sql_quality  query_data  present_decomposition
present_table  suggest_followups  compute
```

Goal, Todo, plan-mode, and future Task DAG model tools stay out of the inner catalogue. The fixed Task working set replaces outer planning so the old G1 planning axis is not mixed back into a phase-gate judgement.

Parity needs care in one direction. The state-machine arm filters the model-visible catalogue down to the current phase's whitelist at `system-prompt/assemble`, so its visible set is `mounted ∩ PHASE_TOOLS[phase]` while the policy arm's is everything mounted. Union-equality across arms therefore requires the policy and floor presets to mount exactly these 15 tools and no more.

## Staged run

**Stage 0 — facility self-proof.** With a mock LLM, a controlled query sidecar, and fixed Session events, prove that the three arms' tool-name sets are identical; that the Task working sets are byte-identical; that the policy arm admits `query_data` only when all four conditions hold; that the floor arm does not inherit admission denials; that the observer extracts real query outcome, final answer, clarification, refusal, LLM call count, tokens, query count, and elapsed time; that provider, sidecar, Agent, and grading failures land in `infra_failure` rather than wrong, declined, or correct; and that raw results contain no credential, authorization header, or MaxCompute config content.

**Stage 1 — real smoke.** Six cases, one Attempt per arm, 18 Attempts. Stop before the decision batch if tool sets or working-set digests differ across arms, if a successful query has no readable outcome, if the absolute dates do not reach the first model request, if a reference SQL disagrees with its case expectation, if any arm's infrastructure failure rate exceeds 5%, or if the scorer can mark a confident business conclusion correct with no successful query. Smoke validates the protocol only and is excluded from the effect statistics.

**Stage 2 — locked decision batch.** Both decision arms run all 36 cases three times (216 Attempts); the floor arm runs each case once (36). Total 252. Freeze and record the code commit, dirty diff digest, three preset digests, policy plugin digest, case manifest digest, semantic corpus digest, sidecar digest, provider, model, environment variable name list, resolved non-secret paths, and randomisation seed before starting. After the freeze, no code, prompt, case, threshold, or grading-rule change is permitted; a change that must happen voids the whole batch and mints a new run identity.

**Stage 3 — scoring and analysis.** Produce each Attempt's immutable observation before any grading runs. Never revise a single-case grading rule from aggregate results. Report medians, p90, and totals for cost — never the mean alone. Compare arms paired by case, report each of the three replicate slots' independent difference, and run a 10,000-iteration paired bootstrap resampling cases.

**Stage 4 — robustness.** Report slices only where they do not change the primary conclusion, and list raw counts without generalising where a slice is thin. A favourable slice never overrides a primary metric that missed its threshold.

## Grading

An Attempt passes end to end only if all hold: no infrastructure failure; for a real-execution case at least one final successful `query_data` result matches the reference result; the business numbers, trends, and attributions in the final answer are supported by successful query results; for a clarification case exactly one specific clarifying question is asked before execution; for a no-grounding or persistent-failure case the agent explicitly refuses or states the data is unavailable and emits no confident business conclusion; and no budget is exceeded.

The SQL judge diagnoses SQL semantics only. It never substitutes for a real execution result and never produces an end-to-end pass on its own.

A **severe unsupported answer** is recorded when the agent gives a confident number, trend, ranking, anomaly, or attribution with no successful query; uses a number or direction inconsistent with a successful query outcome; picks a reading itself under a genuinely ambiguous condition that required clarification; or presents a prediction, stale cache, or SQL text as a verified business result after queries kept failing. Plain SQL errors, explicit refusals, explicit infrastructure failures, and correct clarifications are recorded separately and never folded into this metric.

Deterministic scoring reads `tool/call`, `tool/result`, `assistant/message`, and usage from the Session. Numeric matching, row counts, query success, call ordering, budget, and evidence presence all use deterministic rules. Whether prose is evidence-supported uses a frozen evidence-grounded grader prompt that sees only the question, the acceptance condition, the de-identified successful query result, and the final answer — never the arm name. Every severe-unsupported-answer candidate and every case the two arms score differently gets a blinded human review that records verdict and reasoning before arm names are revealed.

## Layout

```text
README.md                         # this file: frozen protocol, commands, environment, reproduction bounds
cases/manifest.json               # 36 cases, provenance, type, absolute dates, grading policy
cases/challenge/*.yaml            # the 24 behavioural cases
cases/generate-challenge.mjs      # deterministic behavioural-case generator
cases/generate-manifest.mjs       # deterministic manifest generator (re-run to verify digests)
presets/generate-presets.mjs      # emits both arm compositions with phase-gate's persona verbatim
presets/policy/agent.cordis.yml   # policy-only arm composition (generated)
presets/floor/agent.cordis.yml    # diagnostic floor arm composition (generated)
vitest.config.ts                  # scoped test config; the root config does not reach wayfinder/
src/controlled-runner.ts          # Task working set, unified budget, randomisation, Attempt lifecycle
src/guardrails-policy.ts          # critic context observer + policy-only admission
src/session-observer.ts           # Session evidence and cost extraction
src/score.ts                      # deterministic grading and grader input
src/analyze.ts                    # pass^3, slices, cost, paired bootstrap
fixtures/fault-sidecar.mjs        # repeatable transient/persistent query failure
results/decision-summary.json     # de-identified observations, grades, aggregates
report.md                         # conclusion, limits, and recommendation for G25
tests/                            # Stage 0 facility tests
```

Private run data containing raw Session events and query rows goes to `eval-results/g25a/raw/` and is never committed. The committable `decision-summary.json` keeps only case/arm/replicate identity, content digests, counts, verdicts, de-identified failure categories, and cost — never credentials, headers, full query rows, or un-redacted user data.

## Environment

Real runs need host network access plus:

```sh
export PATH="$HOME/Library/Python/3.13/bin:$PATH"
export MAXC_CONFIG="$HOME/.maxc/config_ieu_cdm.yaml.bak"
```

Both resolved paths are recorded in the run manifest by identity, never by content. Credential contents are never printed or copied. On this host `maxc` resolves to `/Users/mckenzie/Library/Python/3.13/bin/maxc`, and `config_ieu_cdm.yaml.bak` is byte-identical to `config_ieu_cdm.yaml`.

Sandbox refusal, DNS errors, provider unreachability, and `spawn maxc ENOENT` are all infrastructure failures and are never converted into a model `wrong`.

## Commands

```sh
pnpm exec vitest run --config wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/vitest.config.ts
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/cases/generate-challenge.mjs
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/presets/generate-presets.mjs
node wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/cases/generate-manifest.mjs
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/controlled-runner.ts --stage smoke
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/controlled-runner.ts --stage decision
node --import tsx/esm wayfinder/task-orchestration-dag/experiments/g25a-phase-gate/src/analyze.ts
pnpm run verify-md-links
pnpm run verify-md-wrap
pnpm run doc-sync
```

Script arguments are fixed by this file and must not change after the decision run.
