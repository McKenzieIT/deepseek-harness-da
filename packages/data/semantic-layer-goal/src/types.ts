/**
 * Types for the autonomous goal-loop framework.
 *
 * Defines the management agent toolset interfaces, goal-round driver config,
 * no-progress detector config, evolution config, and eval-to-goal bridge types.
 *
 * @module @deepseek-ai/dsh-semantic-layer-goal/types
 */

import type { DeltaReport, RunResult, RunSummary } from './eval-runner-types.ts'

// ─── Management Agent Toolset ──────────────────────────────────────────────────

/**
 * Result of diagnosing an asset's health.
 * The management agent calls this to understand what is wrong with an asset
 * before deciding on corrective actions.
 */
export interface DiagnoseResult {
  /** The asset identifier that was diagnosed. */
  readonly assetId: string
  /** Overall health status. */
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  /** Human-readable summary of the diagnosis. */
  readonly summary: string
  /** Specific findings (empty array if healthy). */
  readonly findings: DiagnoseFinding[]
}

/** A single finding from a diagnosis. */
export interface DiagnoseFinding {
  /** Machine-routable finding code (e.g., 'missing_join_key', 'stale_description'). */
  readonly code: string
  /** Severity: how much this impacts query accuracy. */
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  /** Human-readable explanation. */
  readonly message: string
  /** Optional remediation hint. */
  readonly suggestion?: string
}

/**
 * Result of enriching an asset.
 * The management agent calls this to trigger semantic enrichment on an asset
 * (e.g., fill in missing descriptions, add join hints, update column types).
 */
export interface EnrichResult {
  /** The asset identifier that was enriched. */
  readonly assetId: string
  /** Whether enrichment was applied. */
  readonly applied: boolean
  /** What changed (empty if nothing applied). */
  readonly changes: EnrichChange[]
  /** If enrichment failed or was skipped, the reason. */
  readonly skippedReason?: string
}

/** A single change made during enrichment. */
export interface EnrichChange {
  /** The field or sub-asset that changed. */
  readonly path: string
  /** What was there before (null if new). */
  readonly before: string | null
  /** What is there now. */
  readonly after: string
}

/**
 * Result of validating an asset via targeted eval.
 * The management agent calls this to run a focused eval on a specific asset
 * and get back pass/fail evidence.
 */
export interface ValidateResult {
  /** The asset identifier that was validated. */
  readonly assetId: string
  /** The eval run result for this targeted validation. */
  readonly runResult: RunResult
  /** Quick summary: did the asset pass the targeted eval? */
  readonly passed: boolean
  /** Pass rate for the targeted cases. */
  readonly passRate: number
}

/**
 * Result of explaining a quality finding.
 * The management agent calls this to get a natural-language explanation
 * of why a particular quality issue matters and what to do about it.
 */
export interface ExplainResult {
  /** The finding that was explained. */
  readonly finding: DiagnoseFinding
  /** Natural-language explanation of the issue's impact. */
  readonly explanation: string
  /** Suggested remediation steps. */
  readonly remediationSteps: string[]
  /** Example queries that would be affected. */
  readonly affectedQueryExamples: string[]
}

/**
 * The management agent's tool interface.
 * Each method corresponds to one tool the management agent can invoke.
 * Implementations are provided when gate-③ activates; this is the contract.
 */
export interface ManagementAgentToolset {
  /**
   * Diagnose the health of a semantic-layer asset.
   * @param assetId - The asset to diagnose (table or event definition ID).
   */
  diagnose(assetId: string): Promise<DiagnoseResult>

  /**
   * Trigger enrichment on a semantic-layer asset.
   * @param assetId - The asset to enrich.
   */
  enrich(assetId: string): Promise<EnrichResult>

  /**
   * Run a targeted eval against a specific asset.
   * @param assetId - The asset to validate.
   */
  validate(assetId: string): Promise<ValidateResult>

  /**
   * Explain a quality finding in natural language.
   * @param finding - The finding to explain.
   */
  explain(finding: DiagnoseFinding): Promise<ExplainResult>
}

// ─── Goal Round Driver Config ──────────────────────────────────────────────────

/**
 * Configuration for the SemanticLayerGoalRoundDriver.
 * Controls how eval results feed back into the goal system.
 */
export interface GoalRoundDriverConfig {
  /** Maximum rounds before the driver gives up (default: 10). */
  readonly maxRounds: number
  /** Minimum pass_rate improvement to count as "progress" (default: 0.02 = 2%). */
  readonly minImprovementThreshold: number
  /** Number of cases to run per validation round (default: all). */
  readonly casesPerRound: number | 'all'
  /** Whether to persist intermediate results (default: true). */
  readonly persistIntermediateResults: boolean
}

/** Default GoalRoundDriverConfig values. */
export const DEFAULT_GOAL_ROUND_DRIVER_CONFIG: GoalRoundDriverConfig = {
  maxRounds: 10,
  minImprovementThreshold: 0.02,
  casesPerRound: 'all',
  persistIntermediateResults: true,
}

// ─── No-Progress Detector Config ───────────────────────────────────────────────

/**
 * Configuration for the NoProgressDetector.
 */
export interface NoProgressDetectorConfig {
  /**
   * Number of consecutive rounds with no improvement before blocking the goal.
   * Default: 3.
   */
  readonly threshold: number
  /**
   * The metric to track for progress detection.
   * Default: 'pass_rate'.
   */
  readonly metric: ProgressMetric
  /**
   * Minimum improvement in the tracked metric to count as progress.
   * Default: 0.0 (any improvement counts).
   */
  readonly minDelta: number
}

/** Metrics that the NoProgressDetector can track. */
export type ProgressMetric = 'pass_rate' | 'correct_count' | 'regression_count'

/** Default NoProgressDetectorConfig values. */
export const DEFAULT_NO_PROGRESS_CONFIG: NoProgressDetectorConfig = {
  threshold: 3,
  metric: 'pass_rate',
  minDelta: 0.0,
}

// ─── Round State ───────────────────────────────────────────────────────────────

/**
 * State of one goal-loop round. The driver transitions through these phases.
 */
export type RoundPhase =
  | 'idle'           // No active round
  | 'running_eval'   // Eval is executing
  | 'computing_delta' // Comparing before/after
  | 'deciding'       // Management agent is deciding next action
  | 'acting'         // Management agent is executing its chosen action
  | 'blocked'        // No-progress threshold hit
  | 'complete'       // Goal achieved (pass_rate target met)

/**
 * Snapshot of the current round state, for observability.
 */
export interface RoundState {
  /** Current phase of the round. */
  readonly phase: RoundPhase
  /** 1-based round number. */
  readonly round: number
  /** The eval result from this round (set after running_eval). */
  readonly evalResult?: RunSummary
  /** The delta from the previous round (set after computing_delta). */
  readonly delta?: DeltaReport
  /** The action chosen by the management agent (set after deciding). */
  readonly chosenAction?: ManagementAction
  /** Timestamp when this round started. */
  readonly startedAt: number
  /** Timestamp when this round ended (set when transitioning out). */
  readonly endedAt?: number
}

/**
 * An action the management agent chose to take.
 */
export interface ManagementAction {
  /** The tool that was invoked. */
  readonly tool: 'diagnose' | 'enrich' | 'validate' | 'explain'
  /** The target asset or finding. */
  readonly target: string
  /** Whether the action succeeded. */
  readonly success: boolean
  /** Human-readable summary of what happened. */
  readonly summary: string
}

// ─── Eval-to-Goal Bridge ───────────────────────────────────────────────────────

/**
 * The evidence payload fed into the goal system after each eval round.
 * This is what the goal service sees as "progress evidence".
 */
export interface EvalEvidence {
  /** The run that produced this evidence. */
  readonly runId: string
  /** Summary of this run. */
  readonly summary: RunSummary
  /** Delta from the previous run (undefined on first round). */
  readonly delta?: DeltaReport
  /** Round number within this goal loop. */
  readonly round: number
  /** Whether the no-progress detector considers this round as progress. */
  readonly isProgress: boolean
  /** Consecutive no-progress count at time of this evidence. */
  readonly noProgressCount: number
}

// ─── B→A Evolution Config ──────────────────────────────────────────────────────

/**
 * Route configuration for the B->A evolution.
 * Switches the landing page from workspace to dashboard when the goal system
 * is active and the semantic layer has reached sufficient quality.
 */
export interface EvolutionRouteConfig {
  /** Whether the evolution is enabled. */
  readonly enabled: boolean
  /** The pass_rate threshold at which the dashboard becomes the default landing. */
  readonly dashboardThreshold: number
  /** Minimum number of eval rounds completed before evolution can trigger. */
  readonly minRoundsCompleted: number
  /** The route to use when in "workspace" mode (phase B). */
  readonly workspaceRoute: string
  /** The route to use when in "dashboard" mode (phase A). */
  readonly dashboardRoute: string
}

/** Default evolution route config. */
export const DEFAULT_EVOLUTION_ROUTE_CONFIG: EvolutionRouteConfig = {
  enabled: false,
  dashboardThreshold: 0.85,
  minRoundsCompleted: 3,
  workspaceRoute: '/workspace',
  dashboardRoute: '/dashboard',
}

/**
 * Computed evolution state: which phase we are in and why.
 */
export interface EvolutionState {
  /** Current phase: 'B' (workspace-first) or 'A' (dashboard-first). */
  readonly phase: 'B' | 'A'
  /** Current pass_rate that informed the decision. */
  readonly currentPassRate: number
  /** Number of eval rounds completed. */
  readonly roundsCompleted: number
  /** Whether the threshold conditions are met (even if not enabled). */
  readonly thresholdMet: boolean
  /** The active landing route. */
  readonly landingRoute: string
}
