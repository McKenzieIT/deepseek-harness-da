/**
 * Autonomous goal-loop framework for the semantic-layer data agent.
 *
 * Wires eval results into the goal system, orchestrates eval-driven
 * self-calibration rounds, and detects no-progress stalls.
 *
 * Gate-③: This package provides the FRAMEWORK (interfaces + orchestration
 * skeleton + config types). Actual management agent preset and tool
 * implementations are provided when gate-③ activates.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal
 */

// ─── Eval Runner Types (local mirror) ──────────────────────────────────────────
export type {
  CaseFlip,
  CaseVerdict,
  DeltaReport,
  DeltaSummary,
  RunnerVerdict,
  RunResult,
  RunSummary,
} from './eval-runner-types.ts'

// ─── Types ─────────────────────────────────────────────────────────────────────
export type {
  DiagnoseFinding,
  DiagnoseResult,
  EnrichChange,
  EnrichResult,
  EvalEvidence,
  EvolutionRouteConfig,
  EvolutionState,
  ExplainResult,
  GoalRoundDriverConfig,
  ManagementAction,
  ManagementAgentToolset,
  NoProgressDetectorConfig,
  ProgressMetric,
  RoundPhase,
  RoundState,
  ValidateResult,
} from './types.ts'
export {
  DEFAULT_EVOLUTION_ROUTE_CONFIG,
  DEFAULT_GOAL_ROUND_DRIVER_CONFIG,
  DEFAULT_NO_PROGRESS_CONFIG,
} from './types.ts'

// ─── NoProgressDetector ────────────────────────────────────────────────────────
export type { NoProgressState } from './no-progress-detector.ts'
export {
  INITIAL_NO_PROGRESS_STATE,
  blockReason,
  detectProgress,
  resetDetector,
  shouldBlock,
} from './no-progress-detector.ts'

// ─── GoalRoundDriver ───────────────────────────────────────────────────────────
export type {
  DecisionMaker,
  DeltaComputer,
  DriverInternalState,
  EvalExecutor,
  GoalFeedbackSink,
} from './goal-round-driver.ts'
export {
  GoalRoundDriver,
  createInitialDriverState,
} from './goal-round-driver.ts'

// ─── Evolution ─────────────────────────────────────────────────────────────────
export {
  computeEvolutionState,
  shouldEvolve,
} from './evolution.ts'

// ─── Plugin ────────────────────────────────────────────────────────────────────
export type { SemanticLayerGoalConfig } from './plugin.ts'
export {
  DEFAULT_PLUGIN_CONFIG,
  apply,
  createPlaceholderToolset,
  inject,
  name,
  optional,
} from './plugin.ts'
