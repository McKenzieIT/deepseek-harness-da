# @deepseek-ai/dsh-semantic-layer-goal

Autonomous goal-loop framework for the semantic-layer data agent.

## Status: Gate-③ (Framework Only)

This package provides the **interfaces, orchestration skeleton, and config types** for the autonomous self-calibration loop. Actual management agent preset and tool implementations are TBD — they activate when gate-③ opens.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              SemanticLayerGoalPlugin                 │
│  (Cordis plugin — wires eval events → goal system)  │
└───────────────┬─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│              GoalRoundDriver                         │
│  State machine: idle → run_eval → compute_delta     │
│  → decide → act → idle (or blocked/complete)        │
└───────────────┬─────────────────────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌─────────────────────┐
│ NoProgress    │ │ ManagementAgent      │
│ Detector      │ │ Toolset (interface)  │
│ (pure logic)  │ │ - diagnose(assetId)  │
└───────────────┘ │ - enrich(assetId)    │
                  │ - validate(assetId)  │
                  │ - explain(finding)   │
                  └─────────────────────┘
```

## Components

### SemanticLayerGoalPlugin (`src/plugin.ts`)
Cordis plugin that registers the goal-loop on a context. Listens for eval completion events and feeds them through the driver.

### GoalRoundDriver (`src/goal-round-driver.ts`)
Orchestrates the round loop:
1. Run eval batch
2. Compute before/after delta
3. Feed evidence to goal system
4. Ask management agent to decide next action
5. Execute action
6. Repeat or terminate

### NoProgressDetector (`src/no-progress-detector.ts`)
Pure state machine that tracks consecutive rounds without improvement:
- Configurable threshold N (default: 3)
- Configurable metric (pass_rate, correct_count, regression_count)
- Configurable minDelta (minimum improvement to count as progress)

### ManagementAgentToolset (`src/types.ts`)
Interface definitions for the management agent's tools:
- `diagnose(assetId)` — check asset health
- `enrich(assetId)` — trigger enrichment
- `validate(assetId)` — run targeted eval
- `explain(finding)` — explain a quality issue

### B→A Evolution (`src/evolution.ts`)
Route config that switches the landing page from workspace to dashboard when quality threshold is met.

## Testing

```bash
pnpm vitest packages/data/semantic-layer-goal/tests/
```
