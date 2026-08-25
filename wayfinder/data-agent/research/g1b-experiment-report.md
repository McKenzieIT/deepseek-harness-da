# G1b Experiment Report — Pipeline vs goal/todo

**Status**: Partial — infrastructure validated, model probe complete, full runs require async batch execution.
**Date**: 2026-08-25
**Ticket**: `wayfinder/data-agent/tickets/phase-misc/G1b-experiment-execution.md`

## Executive Summary

G1b's goal is to answer "which orchestration variant (A/B/C/D) to ship + whether per-model routing is needed." This report documents:

1. **C_prior blocker resolved** — `goal`/`todo` added to `UNIVERSAL_TOOLS` (commit `3e62e2f197`)
2. **Model probe complete** — all 10 DashScope models classified
3. **Eval pipeline validated** — end-to-end (LLM → SQL → MaxCompute → judge) works
4. **Critical gap identified** — the eval CLI tests the NL2SQL engine (a fixed pipeline), NOT the full agent loop with presets A/B/C/D
5. **Full run timing** — ~60-75s/case with ODPS, making the full matrix (~5h) an async batch job

## 1. Model Probe Results

**Gateway**: `https://pre-aga-ai-gateway.alibaba-inc.com` (internal AGA)
**API Key**: `~/.dsh/.credentials.yaml` → `DASHSCOPE_API_KEY` (valid, confirmed reachable)

### Available Models (10)

| Model | Thinking | reasoning_tokens (7×8 probe) | Tier |
|-------|----------|------------------------------|------|
| qwen-flash | No | N/A | Weak non-thinking |
| qwen-plus | No | N/A | Mid non-thinking |
| qwen-plus-latest | No | N/A | Mid non-thinking (alias) |
| qwen3-max | No | N/A | Strong non-thinking |
| qwen3.5-flash | Yes | 137 | Weak thinking |
| qwen3.5-plus | Yes | 166 | Mid-low thinking |
| qwen3.6-flash | Yes | 126 | Mid thinking |
| qwen3.6-plus | Yes | 181 | Mid-high thinking |
| qwen3.7-max | Yes | 107 | Strong thinking |
| qwen3.7-plus | Yes | 119 | Strong-mid thinking |

**Key finding**: `qwen3.7-max` is reachable and confirmed as the strongest thinking model. All thinking models (3.5+) return `reasoning_content` in streaming mode; non-streaming mode returns empty strings (AGA gateway quirk — streaming works correctly).

### Config C (Capability Axis — Stage 1, ship-relevant)

Thinking ladder (same thinking behavior, ascending capability):
1. **qwen3.5-flash** — weak thinking
2. **qwen3.6-plus** — mid thinking
3. **qwen3.7-max** — strong thinking

### Config T (Thinking Axis — Stage 2, conditional)

Paired at same capability tier:
- Plus tier: `qwen-plus` (non-thinking) vs `qwen3.6-plus` (thinking)
- Max tier: `qwen3-max` (non-thinking) vs `qwen3.7-max` (thinking)

## 2. Case Set Selection

**Source**: 162 K11 eval cases (`packages/eval/eval/cases/k11/`)
**Method**: Stratified proportional sampling (complexity × mode), seed=42
**Result**: 30 cases selected

| Stratum | Population | Sample |
|---------|-----------|--------|
| L1 × linear | 27 | 5 |
| L2 × linear | 66 | 12 |
| L3 × iterative | 20 | 4 |
| L3 × linear | 22 | 4 |
| L4 × iterative | 26 | 5 |

**Selected case IDs**: k11_001, k11_005, k11_013, k11_018, k11_021, k11_031, k11_035, k11_042, k11_049, k11_056, k11_067, k11_068, k11_071, k11_074, k11_077, k11_083, k11_088, k11_095, k11_101, k11_107, k11_108, k11_109, k11_111, k11_118, k11_119, k11_139, k11_149, k11_153, k11_156, k11_158

## 3. Infrastructure Validation

### Pipeline works end-to-end:
- ✅ LLM generation (DashScope AGA gateway)
- ✅ BM25 retrieval (K11 semantic layer corpus)
- ✅ SQL critique + self-correction loop
- ✅ Real ODPS execution (maxc-sidecar → `ieu_cdm` project)
- ✅ LLM-based judge for delivery match
- ✅ Eval runner batching + persistence

### Timing per case (with ODPS, single run):
- Simple cases (L1, qwen-flash): ~13s
- Complex cases (L3-L4, thinking models): ~60-75s (self-correction retries + longer SQL)
- Single case k11_001 + qwen3.7-max + ODPS: 11.6s

### Full experiment estimate:
- 30 cases × pass_k=3 × 3 Config C models = 270 runs
- At ~40s average = **~3 hours**
- Including Stage 2 (Config T, conditional): +180 runs → **~5 hours total**

## 4. Critical Gap: Orchestration Variant Comparison

### What the eval CLI tests
The eval CLI (`packages/eval/eval-cli/`) drives `Nl2sqlEngine.run()` directly — a **fixed programmatic pipeline**: BM25 → prompt → LLM → SQL → critic self-correction → execute. This is equivalent to testing the raw NL2SQL capability without any orchestration layer.

### What G1b needs
The experiment compares **orchestration variants**:
- **A** = phase-gate enforced (UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION, hard gates)
- **B** = free ReAct + goal/todo (model decides flow, planning tools for self-organization)
- **C** = hybrid (phase-gate + goal/todo in U+I phases)
- **D** = bare ReAct (model decides freely, no structure)

These variants operate via the **full harness agent loop** with different presets (`apps/cli/config/agent-presets/data-agent/{agent,b-free-react-planning,c-hybrid,d-bare-react}.cordis.yml`). The model gets tools (search, load, query, present) and the orchestration layer governs which are available and when.

### Mapping between engine and variants
- `Nl2sqlEngine` ≈ **variant D baseline** (bare pipeline, deterministic flow, engine's built-in self-correction approximates D + critic)
- It does NOT test whether phase-gate structure (A), planning tools (B), or hybrid (C) improve outcomes
- The engine's BM25 → generate → execute flow bypasses the agent's decision-making about WHEN to search, WHAT to load, WHETHER to iterate

### What's needed
A **HarnessAgentResponder** that:
1. Boots a full Cordis context with a specific preset (A/B/C/D)
2. Creates an agent session (`agents.create()` per `packages/bundle/headless`)
3. Sends the eval question as a user message
4. Waits for agent quiescence (may be multi-turn)
5. Extracts final answer + generated SQL + declined status from session events
6. Implements the `AgentResponder` interface for the eval-runner

This is a **multi-session engineering effort** (estimated 1-2 sessions). The headless bundle (`packages/bundle/headless`) provides the pattern but needs adaptation for:
- Preset loading (boot with a specific data-agent variant YAML)
- Multi-turn extraction (the agent may take multiple turns)
- Timeout + budget guards (max 60 LLM calls / max 20 turns per G1 protocol)
- Declined detection (variant B/D use prose honest-decline, not `【未完成】`)

## 5. What Can Be Answered Now

### Model comparison (partial G1b goal)
Running the eval CLI across Config C models answers "which model produces the best NL2SQL results" — relevant for the model selection component of the ship decision. This is the **NL2SQL engine baseline** that all variants share.

### What's deferred
- Orchestration comparison (A vs B vs C vs D) → requires HarnessAgentResponder
- Per-model routing signal → requires variant × model cross-data
- Level-2 refinements (C per-phase, B plan-mode, A model-mix) → requires Level-1 data

## 6. Recommendations

1. **Immediate**: Run the model comparison as an async batch job (script provided below)
2. **Next session**: Build the `HarnessAgentResponder` to enable variant comparison
3. **Then**: Execute the full G1b matrix with the harness-backed runner

## 7. Async Batch Runner

To run the Config C model comparison (engine baseline):

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')

# Create the 30-case subset
mkdir -p eval-results/g1b-30cases
for id in k11_001 k11_005 k11_013 k11_018 k11_021 k11_031 k11_035 k11_042 k11_049 k11_056 k11_067 k11_068 k11_071 k11_074 k11_077 k11_083 k11_088 k11_095 k11_101 k11_107 k11_108 k11_109 k11_111 k11_118 k11_119 k11_139 k11_149 k11_153 k11_156 k11_158; do
  cp packages/eval/eval/cases/k11/${id}.yaml eval-results/g1b-30cases/
done

# Run Config C models (sequential, ~3h total)
for model in qwen3.5-flash qwen3.6-plus qwen3.7-max; do
  echo "=== Running $model ==="
  node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
    --cases eval-results/g1b-30cases \
    --pass-k 3 \
    --model "$model" \
    --skip-health-gate \
    --with-query \
    --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs \
    --run-id "g1b-configC-${model}" \
    --output eval-results/g1b/
done
```

## Appendix: Changes Made This Session

1. `packages/data/phase-gate/src/types.ts` — added `'goal'`, `'todo'` to `UNIVERSAL_TOOLS` (C_prior resolved)
2. `packages/eval/eval-cli/src/context.ts` — changed `credMode: 'push'` → `'sidecar-self'` for maxc-backed sidecar
3. `packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs` — wrapper with baked-in ieu_cdm config
4. `packages/data/nl2sql-engine/src/prompt.ts` — removed duplicate `buildEvalPrompt` (cleanup)
