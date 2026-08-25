# @deepseek-ai/dsh-eval

English | [中文](README.zh.md)

The data-agent eval harness: a da-fresh TypeScript mirror of `reverse-bi`'s `rbi-eval` orchestration **design** (not its Python code) — `MultiTurnSession` (fixed-script multi-turn state machine) + pass_k (`run_multi_turn_case`, must pass every attempt) + da (ii) scoring (**DELIVERY** final-answer comparison + **EXECUTION** result-set comparison via the 5 `match_mode`, no sqlglot) over **injected** collaborators.

A **pure library**: it registers nothing on a Cordis context and takes its collaborators — `Responder` (wraps `DeepSeekHarness.run()`), `CaseSqlExecutor` (wraps `ctx.query.execute`), `JudgeProvider` (wraps `llm-dashscope`/`ctx.llm`) — **injected** (D9: the evaluator never constructs the agent under test; the host owns the runtime lifecycle, including close/respawn on a wall-clock timeout). Zero seam peerDependencies: the library imports neither `dsh-sdk-client`, `dsh-query`, `dsh-llm`, nor `cordis`; it defines minimal structural "view" interfaces (`RunResultView`, `QueryOutcomeView`) that the real runtime shapes satisfy.

## API

- **`runMultiTurnCase(case_, { runId, responder, passK?, executeSql?, provider?, deliveryOpts?, timeoutMs?, onTimeout? })`** — drive a case `pass_k` times + apply pass_k (the verdict is the first non-passing attempt's, not the last — anti-flakiness).
- **`driveSession(case_, { runId, responder, attempt?, … })`** — one scripted conversation; never raises for agent failures (an `AuthenticationAbort` propagates — the whole run is over).
- **`submitTurn(session, replyText, { generatedSql, executeSql, provider, deliveryOpts })`** — execute the reply's SQL + hand the turn to the session; on an environmental failure (infrastructure/timeout/patience) the session is NOT advanced (the turn is unjudged, not scored).
- **`scoreDa(case_, { generatedSql, executionResult, finalResponse, provider, deliveryOpts? })`** — the da (ii) score (DELIVERY + EXECUTION, no sqlglot).
- **`MultiTurnSession`** — the state machine (`nextInput()` / `submitResponse()`).
- **`buildAgentResponder(harness)` / `extractReply(runResult)` / `validateRunResult(runResult)`** — the `DeepSeekHarness` → `Responder` adapter (H1 mitigation: asserts ≥1 `assistant/message` per run interval; multi-message intervals from four-stage agents are valid).
- **`classifyExecutionFailure(error)` / `mapQueryOutcome(outcome)`** — environmental failure classification (mirror rbi `l1.classify_execution_failure`) + the `QueryOutcome` → `ExecutionResult` mapping (pending → `patience` refuse).
- **`judgeWithProvider(provider, prompt, opts?)` / `classifyError(err)`** — the DELIVERY LLM-judge with retry/backoff (SPEC §5.5) + `AuthenticationAbort`.
- **`checkResultMatch(expected, actualRows, matchMode)`** — the 5 EXECUTION match modes (1:1 rbi mirror).
- **`turnMatchesExpectation(actual, expected)`** (derailment, rbi `≥0.35`) / **`deliveryFuzzyMatch(actual, expected, opts?)`** (DELIVERY; short expected → token-containment — hardens the `gameX` vs `gameA` false-positive).
- **`EvalCaseSchema` / `loadCase(path)` / `loadCases(paths)`** — da-fresh case schema (zod) + YAML/JSON loader.

## Determinism

`@deepseek-ai/dsh-llm-replay` (a runtime `cordis.yml` plugin, `DSH_SNAPSHOT_FILE` env) freezes the **agent** LLM — the system under test — so the agent's responses are bit-reproducible. The **judge** is a separate eval-side LLM call (`JudgeProvider`, wired to `llm-dashscope`/`ctx.llm`) and is NOT covered by the agent's replay. Per P11b decision 1, the judge **accepts variance** (temp 0 + `JUDGE_MAX_RETRIES=2` + exponential backoff); a fully bit-reproducible judge (a separate judge snapshot) is deferred. `pass_k=3` is the anti-flakiness mechanism; in regression mode (agent replayed) judge variance may conflate judge/agent flakiness — a recorded known trade-off.

## Host wiring (the seams this library does not own)

The host wires the real collaborators and injects them:

- **Agent** — `new DeepSeekHarness({ launch: { command, args, env: { DSH_SNAPSHOT_FILE: '…', …scrubbedParentEnv() } }, … })`; `responder = buildAgentResponder({ run: (msg, sid) => harness.run(msg, { sessionId: sid }) })`. The runtime `cordis.yml` loads `dsh-llm-replay`. `harness.close()` / `await using` reaps the child; `onTimeout` does close+respawn.
- **Execution** — `executeSql = async (sql) => mapQueryOutcome(await ctx.query.execute({ sql, scopeId }))` (the host may `attach`+poll to resolve `pending` first; `mapQueryOutcome` is robust to an unresolved pending → `patience` refuse).
- **Judge** — `provider = async (prompt) => { const { stream } = await ctx.llm.stream({ provider: 'dashscope', model, messages: [judgeSystemPrompt, …] }); …parse JSON → { score, rationale } }` (the host owns the judge prompt + JSON parsing + `llm-dashscope` route; `judgeWithProvider` adds the retry/backoff + `classifyError` + `AuthenticationAbort`).

## Model Experience

None, as the package is a test harness that injects its responder, executor, and judge collaborators and neither assembles nor sends a model request, prompt, tool, or result.

#### KV Cache effect

No direct effect; the agent runtime and the injected judge LLM own any model-visible request.

## Batch Runner + Persistence (W3 — P11c)

The evidence engine (shipped with W3) adds batch execution, persistence, and delta analysis on top of the core:

- **`runBatch(cases, { runId, responder, executeSql?, provider?, passK?, maxInfraRetries?, onCaseComplete? })`** — drives the full case set sequentially. Each case runs `passK` times. Infra failures (all attempts errored, non-timeout) are retried up to `maxInfraRetries` (default 2) — these do NOT count toward pass_k (they are infrastructure faults, not model performance).
- **`classifyCaseOutcome(result)`** — maps a `MultiTurnCaseResult` to one of `correct` | `declined` | `wrong` | `unjudged` (aligns with `EvalResultRecord` in evidence-query).
- **`persistBatchResult(result, dir)`** — writes a `BatchResult` as JSONL (one line per case). Filename encodes `{timestamp}_{runId}.jsonl`.
- **`loadRunRecords(path)` / `listRunFiles(dir)`** — read persisted results back.
- **`computeDelta(runA, runB)`** — identifies per-case outcome flips between two runs (improved / regressed / unchanged / new / removed).
- **`passAtK(records)`** — fraction of cases where ALL k attempts passed.
- **`runHealthCheck({ responder?, executeSql?, timeoutMs? })`** — pre-run gate that fast-fails on connectivity or credential issues before burning eval budget (G1 Q9). A failed health check aborts the run and does not produce results.

## Host wiring — complete integration pattern

```typescript
import { runBatch, runHealthCheck, persistBatchResult, buildAgentResponder, mapQueryOutcome } from '@deepseek-ai/dsh-eval'

// 1. Health gate
const health = await runHealthCheck({ responder, executeSql })
if (!health.healthy) throw new Error(`Pre-run check failed: ${health.error}`)

// 2. Run batch
const result = await runBatch(cases, {
  runId: `run-${Date.now()}`,
  responder: buildAgentResponder({ run: (msg, sid) => harness.run(msg, { sessionId: sid }) }),
  executeSql: async (sql) => mapQueryOutcome(await ctx.query.execute({ sql, scopeId })),
  provider: judgeProvider,
  passK: 3,
  onCaseComplete: (r, i, total) => console.log(`[${i+1}/${total}] ${r.caseId}: ${r.outcome}`),
})

// 3. Persist
const path = persistBatchResult(result, './eval-results')

// 4. Delta (optional)
import { loadRunRecords, computeDelta } from '@deepseek-ai/dsh-eval'
const prev = loadRunRecords(previousRunPath)
const curr = loadRunRecords(path)
const delta = computeDelta(prev, curr)
console.log(`${delta.summary.improved} improved, ${delta.summary.regressed} regressed`)
```

## Host wiring (the seams this library does not own)

## Known Limitations and Deferred Work

- **Dropped SQL-hygiene assertions** — rbi L1's sqlglot-bound `field_coverage`/`limit_reasonable`/`partition_compliant` are dropped (G2 trade-off): an agent whose result set is right but SQL is "dirty" (SELECT *, missing LIMIT, missing partition predicate) PASSES da (ii).
- **Judge variance** — the judge is not bit-reproducible (decision 1); a separate judge snapshot for fully deterministic regression is deferred.
- **Live e2e deferred** — the library is unit-tested with stub collaborators; a live e2e (real runtime + real `dsh-llm-replay` snapshot + real `ctx.query.execute` + real `llm-dashscope` judge) is deferred (with-key, self-skip).
