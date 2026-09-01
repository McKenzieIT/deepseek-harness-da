# G8 — Z enhancement: global progress wavefront visualization

**Type**: task
**Status**: open
**Blocked by**: [G4 animation and edge design](G4-animation-and-edge-design.md)
**Blocks**: —

## Question

Upgrade state change display from Option Y (node + edge animation) to Option Z (global progress wavefront).

Z extends Y's `classifyEdge` from 2 states (`completed | default`) to 3+ states:
- `completed-path`: static green line (execution has passed through)
- `active-inflow`: animated flowing line toward running node (execution is arriving)
- `pending`: gray, no animation (not yet reached)

### Estimated scope
- ~120-200 lines incremental over Y
- Core: extend `classifyEdge(sourceState, targetState)` mapping table
- Register custom G6 v5 edge type with `lineDash` flowing animation (~30-50 lines)
- Animation lifecycle management (start/stop/cleanup)

### Best deployment timing
- After multi-agent parallel execution is available — Z's highest value is showing multiple parallel progress wavefronts
- Consider pairing with pause/resume feature — Z naturally shows where execution paused

### Y→Z upgrade cost
~1-2 days. Y's architecture (state-based edge styling via G6 state mechanism) is designed for this extension. No breaking changes.

### Industry context
No production tool implements Z-level progress wavefront as of 2026 (Airflow, LangGraph Studio, Microsoft tools all at Y level). Z is a differentiation opportunity.

## Upstream sync risk

**None** — entirely within our plugin packages.
