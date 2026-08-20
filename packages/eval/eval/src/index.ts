/**
 * `@deepseek-ai/dsh-eval` — the data-agent eval harness: a da-fresh mirror of
 * `reverse-bi`'s `rbi-eval` orchestration design (not code). A **pure
 * library**: registers nothing on a Cordis context + takes its collaborators
 * (responder / `CaseSqlExecutor` / `JudgeProvider`) **injected** (D9 — the
 * evaluator never constructs the agent under test; the host wires the real
 * `dsh-sdk-client` / `dsh-query` / `dsh-llm-dashscope` seams).
 *
 * Composition: `MultiTurnSession` (state machine) + `driveSession` /
 * `runMultiTurnCase` (pass_k) + `scoreDa` (da (ii): DELIVERY 3-layer +
 * EXECUTION 5 `match_mode`, no sqlglot) + `judge` (injected LLM-judge with
 * retry/backoff + `classifyError` + `AuthenticationAbort`) + `adapter`
 * (`extractReply` / `validateRunResult` H1 / `buildAgentResponder`).
 *
 * @module @deepseek-ai/dsh-eval
 */

export type * from './types.ts'
export { checkResultMatch, MATCH_MODES } from './match_modes.ts'
export type { MatchMode } from './match_modes.ts'
export { charNgrams, turnMatchesExpectation, deliveryFuzzyMatch } from './text_sim.ts'
export type { DeliveryFuzzyOpts } from './text_sim.ts'
export { classifyExecutionFailure, mapQueryOutcome, ENVIRONMENTAL_FAILURE_CLASSES, PATIENCE_ABANDONED_MARKER } from './classify_failure.ts'
export { judgeWithProvider, classifyError, AuthenticationAbort, JUDGE_MAX_RETRIES, BACKOFF_MS, JUDGE_PASS_THRESHOLD } from './judge.ts'
export type { ErrorClass, JudgeOpts } from './judge.ts'
export { EvalCaseSchema, isMultiTurn } from './eval_case.ts'
export type { EvalCase, CaseExpected, DeliveryMatch } from './eval_case.ts'
export { loadCase, loadCases } from './case_loader.ts'
export { routeDelivery, scoreDelivery, parseNumber } from './delivery.ts'
export type { DeliveryResult, DeliveryOpts } from './delivery.ts'
export { scoreDa, aggregateVerdict } from './scoring.ts'
export type { ScoreDaContext } from './scoring.ts'
export { MultiTurnSession, MAX_TURNS_PER_ATTEMPT } from './session.ts'
export type { SubmitResponseOpts } from './session.ts'
export { submitTurn, driveSession, runMultiTurnCase, passKVerdict, sessionId, DEFAULT_PASS_K } from './multi_turn.ts'
export type { DriveOptions, SubmitTurnOpts, RunMultiTurnCaseOptions } from './multi_turn.ts'
export { extractReply, validateRunResult, buildAgentResponder, ProtocolError } from './adapter.ts'
export type { HarnessLike } from './adapter.ts'
