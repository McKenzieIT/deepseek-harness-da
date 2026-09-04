# Agent Note: Remove the dead on-demand-eval + eval-delta + reachability UI surfaces from useEvidenceQuery

Status: proposed

## Problem

`packages/client/ui-semantic-layer/src/client/hooks/useEvidenceQuery.ts` carries fetch methods + a trigger callback no component populates, and a component that renders permanently-empty state. (1) `fetchReachabilityDelta` (`:127`) + `state.reachabilityDelta`: defined and returned (`:168`) but ZERO component callers; the `ProposedRelation`/`ReachabilityDeltaResult`/`ReachablePair` types (`types.ts:44-58`) are carried solely for this dead client path (the host-side `EvidenceQueryService.reachabilityDelta` is a separate feature and stays). (2) `fetchAssetHealth` (`:116`) + `state.assetHealth`: ZERO component callers; `state.assetHealth` is never rendered (the live-verify script calls `client.assetHealth()` on the bridge-built client directly, not via the hook, so the bridge method stays). (3) `fetchEvalDelta` (`:138`) + `state.evalDelta`: ZERO component callers, yet `state.evalDelta` IS rendered by `EvalDeltaView` in both layouts (`EvidenceSidebar.tsx:127,137` and `DashboardView.tsx:50`); since `fetchEvalDelta` is never invoked, `state.evalDelta` is permanently `null` and `EvalDeltaView` always renders the `evidence.evalDelta.empty` placeholder, never real data. (4) `triggerEvalRun?` (`:30`, optional on `EvidenceQueryClient`) is never implemented — `buildEvidenceQueryClient` does not set it; `triggerEval` (`:149-158`) early-returns `null` via `if (!client?.triggerEvalRun) return null`; `OnDemandEvalTrigger` (mounted at `EvidenceSidebar.tsx:126,134`) calls `triggerEval`, gets `null`, so the button toggles its `running` spinner but triggers nothing and the `lastRun` span never renders. The real `trigger_eval` TOOL is a separate surface (`TriggerEvalRow` presenter + `EvalRunnerService`), unrelated to this UI button. Only `fetchCoverage` is called (in the mount `useEffect`); `fetchGapAnalysis`/`fetchEvalResults` are the live lazy methods.

## Proposal

Remove `fetchReachabilityDelta` + `state.reachabilityDelta` + the 3 reachability types from the client (hook + bridge + types); remove `fetchAssetHealth` + `state.assetHealth` from the hook (bridge method stays — the script uses it); remove `fetchEvalDelta` + `state.evalDelta` + `EvalDeltaView.tsx` (or, if the delta view is intended, wire `fetchEvalDelta` in a `useEffect` — currently a dead UI surface); remove `triggerEvalRun?` from `EvidenceQueryClient`, the `triggerEval` callback + its state plumbing, the `OnDemandEvalTrigger` component, and its two mount sites. ~190 lines + `EvalDeltaView.tsx` + `OnDemandEvalTrigger.tsx` + types.

## What we give up

If `EvalDeltaView` is intended (dead-by-incomplete-wiring, not dead-by-omission), the correct fix is wiring `fetchEvalDelta` in a `useEffect`, not removal — confirm intent with the eval-delta feature owner before deleting. If on-demand-eval is intended, the correct fix is implementing `triggerEvalRun`, not removing the button.

## Alternatives considered

**Wire the surfaces instead of removing them.** `EvalDeltaView` and `OnDemandEvalTrigger` may be intended features dead-by-incomplete-wiring: wire `fetchEvalDelta` in a `useEffect` and implement `triggerEvalRun`. It lost as a real fork — the proposal's "What we give up" already requires confirming intent with the eval-delta feature owner before deleting, so wire-vs-remove is decided per surface by that owner; removal is the default because `fetchEvalDelta`/`triggerEvalRun` are never invoked and the surfaces render permanently-empty state today, and the real `trigger_eval` TOOL is a separate, live surface.

**Keep the bridge methods (`fetchAssetHealth`, `fetchReachabilityDelta`) on the client even if the hook drops them.** The live-verify script calls `client.assetHealth()` on the bridge-built client directly. It lost because the proposal already keeps the bridge `assetHealth` method (only the hook's `fetchAssetHealth`/`state.assetHealth` go) — the script's direct bridge call survives — so this is folded into the proposal rather than a separate path.

## Acceptance criteria

- `grep -rn "fetchReachabilityDelta|fetchAssetHealth|fetchEvalDelta|EvalDeltaView|triggerEvalRun|OnDemandEvalTrigger" packages/client/*/src/` returns zero after removal.
- ui-semantic-layer `pnpm test` + `pnpm build` green.
- The live-verify script still passes (update its client stub to drop the non-optional `reachabilityDelta` member, or make the interface member optional).
- Both layouts render without the `EvalDeltaView` placeholder span (or, if wired, `EvalDeltaView` shows real data).

## Risks

The reachability-types removal touches the bridge interface (visible to the live-verify stub); update the stub in the same change. If `EvalDeltaView` or on-demand-eval is a near-term feature, wire rather than remove — confirm with the feature owner first.
