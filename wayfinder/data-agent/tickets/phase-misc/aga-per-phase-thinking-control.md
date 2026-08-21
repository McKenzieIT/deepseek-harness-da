# aga per-phase thinking control — B (skip effort) vs B' (per-phase model selection)

> Surfaced by the dashscope-default-llm-plugin verification (aga rename) + the data-agent phase-gate `reasoningEffort` error (P2+P7b reconciliation). Option B (phase-gate skips `reasoningEffort` for no-effort models) LANDED (commit `a127875845`); this ticket grills whether B is sufficient or the data-agent needs B' (per-phase model selection) to preserve per-phase thinking control.

**Type**: grilling
**Phase**: misc
**Status**: Resolved (2026-08-21) — **B suffices**; B' (per-phase model selection) deferred

## Background

- **P2 (aga)**: native AGA protocol, NO per-request thinking knob — thinking is model-bound (qwen3.7-max always thinks); control thinking by MODEL SELECTION, not effort. The adapter exposes NO reasoning efforts; a caller setting `reasoningEffort` is rejected by the registry (`UNSUPPORTED_REASONING_EFFORT`, `packages/llm/llm/src/index.ts:744`).
- **P7b (phase-gate)**: rbi-faithful, sets per-phase `reasoningEffort` (high for UNDERSTANDING/GENERATION, medium default) via the `agent/request` waterfall (`packages/data/phase-gate/src/phase-gate.ts` `REASONING_EFFORT` + `onRequest`) — assumed an effort-capable LLM.
- **The conflict** (surfaced + verified 2026-08-21): the data-agent (aga + phase-gate) — phase-gate sets per-phase `reasoningEffort` for aga → registry rejects → `UNSUPPORTED_REASONING_EFFORT` ("provider aga model qwen3.7-max does not support reasoning effort"). The data-agent preset errors; the built-in preset (no phase-gate) doesn't. (Not the rename's fault — the rename is verified; this is the P2+P7b integration gap.)

## Option B (LANDED, commit `a127875845`)

phase-gate's `onRequest` queries the model's reasoning support (`ctx.llm.resolveModelInfo`); for no-effort models (aga, `info.reasoning === undefined`), it SKIPS setting `reasoningEffort` (returns base unchanged) — letting thinking be controlled by model selection (P2's design). For effort-capable models, it sets per-phase effort as before. Cached the support lookup (only on success; transient errors don't poison the cache).

- ✅ Resolves the error (aga in data-agent preset → no `UNSUPPORTED_REASONING_EFFORT`).
- ✅ Faithful to P2 (caller respects capability; preserves llm-dashscope's no-efforts design + test `adapter.spec.ts:408`).
- ⚠️ **Loses per-phase thinking control for aga**: qwen3.7-max always thinks (model-bound); the phase-gate's per-phase effort (high/medium) is a no-op (skipped). The data-agent can't dial thinking intensity per phase for aga.

## Option B' (the fuller design — NOT landed)

phase-gate does per-phase **MODEL SELECTION** instead of per-phase `reasoningEffort` for aga: pick a thinking model (e.g., qwen3.7-max) for phases that need deep reasoning (UNDERSTANDING/GENERATION) + a non-thinking model (e.g., a non-thinking qwen, if one exists in the AGA catalog) for phases that don't (EXECUTION/INTERPRETATION — save tokens/latency).

- ✅ Preserves per-phase thinking control (via model selection, matching P2's "control by model selection" intent).
- ⚠️ Bigger change: phase-gate selects models per phase — needs a thinking/non-thinking model mapping for aga; requires knowing which AGA models think vs not.
- ⚠️ rbi-faithfulness: rbi's per-phase effort → per-phase model selection is a re-expression (not a mirror); rbi's `reasoning_effort` per-phase intent maps to model-choice per-phase.

## Question

Does the data-agent NEED per-phase thinking control for aga (→ B', per-phase model selection), or is B (skip — qwen3.7-max always thinks across all phases) sufficient?

Sub-questions to grill:
1. Does the data-agent benefit from NOT-thinking in some phases (EXECUTION/INTERPRETATION)? Token/latency savings vs always-think quality. (rbi's per-phase effort implied yes — high for SQL-gen, lower for exec/deliver.)
2. Is there a non-thinking aga model in the AGA catalog? The catalog (`GET /api/v1/models`) lists 10 chat models (qwen-flash, qwen-plus, qwen-plus-latest, qwen3-max, qwen3.5-flash/plus, qwen3.6-flash/plus, qwen3.7-max/plus). Are any non-thinking (no `reasoning_content`)? If all think, B' can't dial down → B is the only option.
3. Is the phase-gate's per-phase effort (high/medium) even meaningful for aga (model-bound — no dial)? Or was it always a no-op for aga (B just makes the no-op non-erroring)?
4. Cost of B' (per-phase model selection logic + model mapping) vs benefit (per-phase thinking control). If marginal (qwen3.7-max always-think is fine for all phases), B suffices.

## Recommendation (to grill)

Lean **B suffices** unless the data-agent has a concrete need for per-phase thinking control (token/latency in EXECUTION/INTERPRETATION) AND a non-thinking aga model exists. B is minimal + landed + faithful; B' is a bigger change for a benefit that may be marginal (qwen3.7-max always-think is acceptable across phases; the per-phase effort was arguably always a no-op for aga). Grill the data-agent's actual per-phase thinking needs + the AGA catalog's thinking/non-thinking models before committing to B'.

## Blocked by / feeds

- **AGA catalog thinking vs non-thinking models** (does a non-thinking qwen exist?) — a research sub-question (probe the catalog's models for `reasoning_content`).
- **The data-agent's per-phase thinking needs** (does EXECUTION/INTERPRETATION benefit from non-thinking?) — a domain grilling (rbi's per-phase effort intent).

## Related

- `tickets/phase-misc/dashscope-default-llm-plugin.md` (resolved — the aga rename).
- P2 (aga, model-bound thinking, `packages/llm/llm-dashscope`).
- P7b (phase-gate, per-phase effort, `packages/data/phase-gate`).
- commit `cd2b741409` (Option B *introduced* — phase-gate skips `reasoningEffort` for no-effort models; `a127875845` "load_* review fix" also touched `phase-gate.ts`).

## Resolution

**Resolved 2026-08-21 — B suffices.** Option B (phase-gate `onRequest` skips `reasoningEffort` for no-effort/aga models via `modelExposesReasoningEffort` → `info.reasoning === undefined`) stays LANDED; `qwen3.7-max` always-thinks across all four phases. **B' (per-phase model selection) is NOT pursued — deferred** as a low-priority follow-up.

Grilled 4 sub-questions (facts self-verified against rbi source `/Users/mckenzie/workspace/reverse-bi`, live-probe note `research/p2-dashscope-wire.md`, adapter `packages/llm/llm-dashscope/src/{adapter,translate,serialize,index}.ts`, registry `packages/llm/llm/src/index.ts`):

1. **Need per-phase thinking control? → No sufficient need for B' now.** always-think across phases is acceptable; the waste is confined to the mechanical EXECUTION phase (1 of 4), and `qwen3.7-max` thinking there isn't *harmful* (just somewhat wasteful). Re-evaluate if EXECUTION/INTERPRETATION token/latency becomes a *measured* problem.

2. **Non-thinking aga model exists? → YES (B' was feasible).** Live-probe-confirmed (2026-08-19): `qwen-flash`/`qwen-plus` return `content: string` with NO `reasoning_content` (non-thinking); `qwen3.6-plus` returns `reasoning_content` + `reasoning_tokens` (thinking); `qwen3.7-max` is the chosen thinking default. → B' (route a mechanical phase to a non-thinking model) is *possible*.
   - **B'' (per-request `enable_thinking` toggle) is OFF the table**: the native AGA protocol has no `enable_thinking`/`thinking_budget` field (probe-confirmed; `serialize.ts` omits them); thinking is purely model-bound. On aga, **per-phase model selection is the only dial.**

3. **rbi per-phase thinking intent? → rbi had NONE → "preserve rbi's intent" is moot.** Verified in rbi source: `libs/rbi-llm/.../config.py:20` `model = "qwen-plus"` (non-thinking), set once; the DashScope provider holds ONE model; `pipeline.py` reads `provider.model` for ALL phases; **`reasoning_effort`/`enable_thinking` appear nowhere in rbi's `.py`**. So rbi runs all four phases on a **non-thinking** model — it didn't think in any phase. rbi's per-phase control is via *prompts* (`_PHASE_INSTRUCTIONS`), gates, budgets, tool whitelists — not thinking.
   - **Consequence**: the phase-gate's `REASONING_EFFORT` (high/medium) is a **harness-era addition (D7), not rbi-faithful**. And it was never *functional* on aga — pre-B it was a **hard error** (`packages/llm/llm/src/index.ts:744` *throws* `UNSUPPORTED_REASONING_EFFORT` when `reasoning === undefined` + a requested effort; NOT a silent no-op, so the "Option B" section's "no-op" wording above is imprecise); B's skip turns it into a true no-op. **B loses nothing rbi had** — only the data-agent's *own* D7, which was incoherent on aga anyway (`qwen3.7-max` always thinks regardless of a knob that doesn't exist for it).

4. **B' cost vs benefit → cost not justified now.** B' = per-phase model selection logic (phase-gate `onRequest` picks model per phase) + a thinking/non-thinking model map (config) + 2-model bundle/settings + tests — additive but non-trivial. The benefit (token/latency savings in mechanical phases) is **marginal + unmeasured** (EXECUTION/INTERPRETATION thinking cost hasn't surfaced as a problem). → Defer B'.

**B' deferred breadcrumb** (re-evaluate if EXECUTION/INTERPRETATION token/latency becomes a measured problem): B' = per-phase **model selection** — thinking model (`qwen3.7-max`) for UNDERSTANDING/GENERATION, non-thinking (`qwen-plus`/`qwen-flash`) for the mechanical phases. EXECUTION is the cleanest win ("deterministic, not ReAct" — tool-dispatch + 3-way branch off the outcome; thinking is pure overhead). INTERPRETATION is murkier — D7 wanted "medium" there, which binary aga can't express, so mapping it to non-thinking *would* lose delivery-synthesis quality. Additive change: phase-gate `onRequest` selects the model per phase (alongside the existing effort-skip), driven by a thinking/non-thinking model map. NOT built now.
