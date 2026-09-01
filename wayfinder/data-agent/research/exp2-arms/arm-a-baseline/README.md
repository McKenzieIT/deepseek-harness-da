# Arm A — Baseline (Current Mixed-Language Prompts)

Arm A is the **control group**. It uses the existing production prompts with no modifications.

## Source files (reference — do NOT copy/modify)

| Component | Path | Language |
|-----------|------|----------|
| NL2SQL Engine prompt | `packages/data/nl2sql-engine/src/prompt.ts` | Chinese (structural + dynamic) |
| NL2SQL conventions | `packages/data/nl2sql-engine/src/conventions.ts` | Chinese section headers |
| Phase-gate persona | `packages/data/phase-gate/src/phase-gate.ts` | English (BASE_PERSONA + PHASE_INSTRUCTIONS) |
| Query expansion | `packages/data/tool-search-data-sources/src/expand-query.ts` | Chinese |
| SQL semantic judge | `packages/eval/eval-runner/src/sql_semantic_judge.ts` | Chinese |

## How to run

```bash
# Standard eval — no changes needed
dsh-eval --cases packages/eval/eval/cases/k11-v2/ \
  --provider $EVAL_LLM_PROVIDER --model $EVAL_LLM_MODEL \
  --output eval-results/exp2-arm-a/ \
  --run-id exp2-arm-a
```

No code changes. The eval-cli runs against the current `buildEvalPrompt` in prompt.ts.
