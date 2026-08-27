# F7: Suppress post-EXECUTION model text before INTERPRETATION

**Type**: task (AFK)
**Phase**: misc
**Status**: open
**Blocked by**: none
**Blocks**: UX polish (cosmetic, not functional)

## Problem

After `query_data` completes in EXECUTION and before the model receives `[phase advance → interpretation]`, the model emits user-visible text summarizing the execution result:

> "## INTERPRETATION 查询成功执行，返回 K11 过去一个月不同服务器的 DAU 趋势数据..."

This leaks internal phase machinery to the user. INTERPRETATION tools (`present_decomposition`, `present_table`, `suggest_followups`) should be the ONLY user-visible output after execution.

## Root Cause

The original fix used `return { kind: 'reject' }` in `onPreStep` to skip the post-tool response step entirely. But `reject` ends the turn, and the injected advance message (target `next-step`) gets canceled — the session stalls.

Current fix: removed the reject, letting the step proceed. But now the model has a free-response step between EXECUTION completion and INTERPRETATION phase advance.

## Approaches

### A: Move advance to `turn-stopping` (recommended)
The `agent/turn-stopping` hook fires AFTER the assistant message is emitted but BEFORE the turn decision. If `execution_auto_advance` is set:
1. Suppress the assistant text block (or don't — it's already emitted at this point)
2. Actually the text is already emitted by the time turn-stopping runs, so this doesn't help

### B: Inject advance message in post-execute instead of pre-step
After `query_data` completes in `tools/post-execute`, immediately inject the phase advance message into `next-step`. The next step then has the advance message as its claimed input, so the model sees it IMMEDIATELY (no free-response gap). This avoids the pre-step timing issue entirely.

The problem with the old approach was: advance was called in `onPreStep` with a `reject` that canceled the message. If we move the inject to `onPostExecute` (which runs before the next pre-step), the message will be claimed by the NEXT step and the model's first response in that step will be the INTERPRETATION tools.

### C: Response filter
Add a `model/response-filter` that strips text blocks when `execution_auto_advance` is set. Heavy-handed.

## Recommendation

**Approach B**: In `onPostExecute`, when `query_data` completes with `state === 'completed'`, call `this.advance(agent, s)` immediately AND set a flag that causes the turn-stopping decision to emit `continue` (not the default). This way the model's next step is the INTERPRETATION phase with no gap.

Actually simpler: just inject the advance message in `onPostExecute` and remove the `execution_auto_advance` flag + onPreStep special case entirely. The advance message arrives as the next step's input (since `agent.inject` targets `next-step`, and `onPostExecute` runs BEFORE the current step ends and the next pre-step fires).
