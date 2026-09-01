# GA-EXP2 — Prompt Language Experiment: Methodology & Execution Plan

**Status**: Ready for execution  
**Source**: [GA-EXP2 ticket](../../tickets/phase-misc/GA-EXP2-prompt-language-experiment.md)  
**Date**: 2026-09-01

---

## 1. Hypotheses

**H1**: English structural prompts produce SQL at parity with Chinese structural prompts (pass_rate gap < 3%), because the output is language-neutral SQL code.

**H2**: Mixed-language context (English instructions + Chinese dynamic content) is not inferior to fully Chinese context — the model handles cross-language grounding well.

**H3**: The LLM-as-judge prompt language introduces systematic scoring bias on the same SQL (per arxiv 2607.14480).

## 2. Prompt Language Inventory (Current State)

### 2.1 File-by-file audit

| File | Component | Language | Char count | Notes |
|------|-----------|----------|------------|-------|
| `nl2sql-engine/src/prompt.ts` | `TOOL_CATALOG` | **Chinese** | ~430 | Tool descriptions, all Chinese |
| `nl2sql-engine/src/prompt.ts` | `buildPrompt` body | **Chinese** | ~1800 | §3 SOP, §5 decline, §6 rules, section headers |
| `nl2sql-engine/src/prompt.ts` | `buildEvalPrompt` body | **Chinese** | ~600 | Simplified eval prompt, rules, headers |
| `nl2sql-engine/src/prompt.ts` | `granularityTag` | **Chinese** | ~20 | `[日粒度]`, `[快照]` tags |
| `nl2sql-engine/src/conventions.ts` | `renderConventionsPrompt` | **Chinese** | ~80 | Section headers: `方言速查`, `可用函数`, `字段逻辑类型 → CAST 映射`, `典型查询模板`, `（无 conventions）` |
| `phase-gate/src/phase-gate.ts` | `BASE_PERSONA` | **English** | ~1200 | Full English persona + 3 rules |
| `phase-gate/src/phase-gate.ts` | `PHASE_INSTRUCTIONS` | **English** | ~4000 | All 4 phases in English (with a few Chinese markers: `【route:proceed】`, `【发现】`, `【注意】`) |
| `phase-gate/src/phase-gate.ts` | `buildSqlConventions` | **English** | ~350 | SQL conventions injection, English |
| `tool-search-data-sources/src/expand-query.ts` | `EXPANSION_SYSTEM_PROMPT` | **Chinese** | ~450 | Query expansion instructions + examples |
| `eval-runner/src/sql_semantic_judge.ts` | `buildJudgePrompt` | **Chinese** | ~500 | Judge rubric + 5 dimensions |

### 2.2 Summary: current language distribution

| Layer | Chinese | English | Mixed |
|-------|---------|---------|-------|
| Persona + phase instructions (phase-gate) | — | ✓ | route/delivery markers in Chinese |
| SQL generation prompt (prompt.ts) | ✓ | — | — |
| Query expansion (expand-query.ts) | ✓ | — | — |
| Conventions rendering (conventions.ts) | ✓ (headers) | — | Data is language-neutral |
| SQL judge (sql_semantic_judge.ts) | ✓ | — | — |
| **Dynamic content** (candidates, event defs, user questions) | ✓ | — | From semantic layer YAML |

**Current state is mixed**: phase-gate orchestration is English; everything else is Chinese.

## 3. Experiment Design

### 3.1 Variants (5 + 1 optional)

Following the ticket's design, with one addition from the user's "全中文" arm:

| Variant | Structural prompts | Dynamic content | Judge | Purpose |
|---------|-------------------|-----------------|-------|---------|
| **A (baseline)** | Mixed (as-is) | Chinese | Chinese | Control group |
| **B (full-EN)** | All English | Chinese | Chinese | Test English instructions + Chinese dynamic content |
| **C (full-EN + respond-in)** | All English + "Respond in user's language" | Chinese | Chinese | Test if respond-in directive changes SQL quality or text language |
| **D (all-EN)** | All English | English (translated descriptions) | Chinese | Pure English upper bound (non-production) |
| **E (baseline + EN-judge)** | Mixed (same as A) | Chinese | **English** | Isolate judge language bias (H3) |
| **F (full-ZH)** _(optional)_ | All Chinese (phase-gate → Chinese) | Chinese | Chinese | Test fully Chinese vs mixed baseline |

**Recommendation**: Run A/B/C/E first (4 variants). Add D only if B≈A (gap < 2%). Add F only if there's interest in the Chinese-ward direction.

### 3.2 What changes per variant

| Component | A | B | C | D | E | F |
|-----------|---|---|---|---|---|---|
| prompt.ts TOOL_CATALOG | ZH | **EN** | **EN** | **EN** | ZH | ZH |
| prompt.ts buildPrompt/buildEvalPrompt | ZH | **EN** | **EN** | **EN** | ZH | ZH |
| prompt.ts granularityTag | ZH | **EN** | **EN** | **EN** | ZH | ZH |
| conventions.ts headers | ZH | **EN** | **EN** | **EN** | ZH | ZH |
| phase-gate BASE_PERSONA | EN | EN | EN | EN | EN | **ZH** |
| phase-gate PHASE_INSTRUCTIONS | EN | EN | EN | EN | EN | **ZH** |
| phase-gate buildSqlConventions | EN | EN | EN | EN | EN | **ZH** |
| expand-query EXPANSION_SYSTEM_PROMPT | ZH | **EN** | **EN** | **EN** | ZH | ZH |
| Candidate descriptions (YAML) | ZH | ZH | ZH | **EN** | ZH | ZH |
| User questions | ZH | ZH | ZH | ZH | ZH | ZH |
| sql_semantic_judge prompt | ZH | ZH | ZH | ZH | **EN** | ZH |
| Extra instruction | — | — | **+"Respond in user's language"** | — | — | — |

### 3.3 Controlled variables

- **Model**: Fixed (record exact model ID + temperature per run)
- **Eval case set**: K11-v2 full 168 cases
- **pass@k**: Consistent with current eval config
- **Conventions data**: Same MaxCompute conventions YAML
- **BM25 retrieval**: Same candidates (deterministic given same query expansion)
- **Query expansion**: Same expansion model/temperature (note: expansion prompt language changes in B/C/D — this is an intended part of the treatment, not a confound)

### 3.4 Dependent variables (metrics)

**Primary**:
- `pass_rate`: execution_match pass rate across 168 cases

**Secondary (per-dimension breakdown)**:
- By `query_intent` (8 categories):

  | Intent | Count | % |
  |--------|-------|---|
  | metric_lookup | 59 | 35.1% |
  | comparison | 27 | 16.1% |
  | open_ended | 26 | 15.5% |
  | trend | 20 | 11.9% |
  | ranking | 15 | 8.9% |
  | distribution | 10 | 6.0% |
  | filter | 8 | 4.8% |
  | proportion | 3 | 1.8% |

- By `sql_complexity` (4 levels):

  | Complexity | Count | % |
  |------------|-------|---|
  | L1 | 44 | 26.2% |
  | L2 | 69 | 41.1% |
  | L3 | 44 | 26.2% |
  | L4 | 11 | 6.5% |

- `decline_rate`: honest decline frequency (language may affect refusal behavior)
- `sql_judge_score`: mean score across 5 judge dimensions

**Judge consistency (H3)**:
- Variant A vs E per-case score delta distribution
- Cohen's κ / Spearman ρ between Chinese and English judge scores

## 4. Existing Arm Variant Files

### 4.1 Produced artifacts

| Path | Maps to | Coverage |
|------|---------|----------|
| `arm-a-baseline/README.md` | Variant A | Reference only — no code changes |
| `arm-b-chinese/prompt-variant.ts` | Variant F (full-ZH) | `BASE_PERSONA_ZH`, `PHASE_INSTRUCTIONS_ZH`, `SQL_CONVENTIONS_ZH_TEMPLATE` |
| `arm-c-english/prompt-variant.ts` | Variant B (full-EN) | `TOOL_CATALOG_EN`, `buildPromptEN`, `buildEvalPromptEN`, `CONVENTIONS_HEADERS_EN`, `granularityTagEN`, `EXPANSION_SYSTEM_PROMPT_EN`, `buildJudgePromptEN` |

### 4.2 Remaining work to produce all variants

| Variant | What's needed | Status |
|---------|---------------|--------|
| A (baseline) | Nothing — use current code | ✅ Ready |
| B (full-EN) | `arm-c-english/prompt-variant.ts` covers prompt.ts + expand-query + judge translations | ✅ Ready (wire into eval-cli `--variant B`) |
| C (full-EN + respond-in) | Same as B + append "Respond in the user's language" to persona | 🔧 Trivial delta from B |
| D (all-EN) | B + translated semantic layer YAML descriptions | ⏳ Deferred (run after A/B/C/E) |
| E (baseline + EN-judge) | `arm-c-english/prompt-variant.ts:buildJudgePromptEN` — wire judge-only swap | ✅ Ready (wire into eval-cli) |
| F (full-ZH) | `arm-b-chinese/prompt-variant.ts` covers phase-gate translations | ✅ Ready (wire into eval-cli) |

### 4.3 Integration path

The eval-cli already supports `--variant A|B|C|D`. The wiring needs to:

1. Import the variant prompt functions from the arm files
2. In the eval context boot (`eval-cli/src/context.ts`), swap prompt builders based on `--variant`:
   - Variant A: no-op (current code)
   - Variant B: replace `buildPrompt`/`buildEvalPrompt` with `buildPromptEN`/`buildEvalPromptEN`; replace `EXPANSION_SYSTEM_PROMPT` with `EXPANSION_SYSTEM_PROMPT_EN`; swap `renderConventionsPrompt` headers
   - Variant C: same as B + append respond-in instruction to `BASE_PERSONA`
   - Variant E: replace `buildJudgePrompt` with `buildJudgePromptEN`

Alternatively, use an `EXP2_ARM` environment variable for a lower-touch integration that doesn't require modifying eval-cli's argument parser.

## 5. Evaluation Protocol

### 5.1 Execution commands

```bash
# Variant A — baseline
dsh-eval --cases packages/eval/eval/cases/k11-v2/ \
  --provider $EVAL_LLM_PROVIDER --model $EVAL_LLM_MODEL \
  --output eval-results/exp2-arm-a/ \
  --run-id exp2-arm-a \
  --responder engine

# Variant B — full English prompts
dsh-eval --cases packages/eval/eval/cases/k11-v2/ \
  --provider $EVAL_LLM_PROVIDER --model $EVAL_LLM_MODEL \
  --output eval-results/exp2-arm-b/ \
  --run-id exp2-arm-b \
  --responder engine \
  --variant B

# Variant C — full English + respond-in
dsh-eval --cases packages/eval/eval/cases/k11-v2/ \
  --provider $EVAL_LLM_PROVIDER --model $EVAL_LLM_MODEL \
  --output eval-results/exp2-arm-c/ \
  --run-id exp2-arm-c \
  --responder engine \
  --variant C

# Variant E — baseline + English judge
dsh-eval --cases packages/eval/eval/cases/k11-v2/ \
  --provider $EVAL_LLM_PROVIDER --model $EVAL_LLM_MODEL \
  --output eval-results/exp2-arm-e/ \
  --run-id exp2-arm-e \
  --responder engine \
  --variant E
```

### 5.2 Per-run outputs to capture

For each variant run:
- `per-case-results.jsonl` — case_id, pass/fail, generated_sql, judge_scores (5 dimensions), decline flag
- `summary.json` — overall pass_rate, per-intent pass_rate, per-complexity pass_rate, decline_rate, mean judge score

### 5.3 Analysis plan

1. **Overall comparison**: pass_rate table (A vs B vs C vs E), with 95% CI via bootstrap
2. **Per-intent heatmap**: which intents are most affected by language? (expect open_ended and comparison to be most sensitive)
3. **Per-complexity breakdown**: does language effect scale with complexity?
4. **Diff-case deep dive**: cases where B passes but A fails (or vice versa) — manually inspect SQL for language-driven errors (e.g., misunderstood Chinese terms, lost nuance in translation)
5. **Judge bias (H3)**: plot per-case A-score vs E-score; compute Cohen's κ; test whether judge language systematically inflates/deflates scores
6. **Statistical significance**: McNemar's test (paired binary classification), α = 0.05

## 6. Decision Matrix (Post-Experiment)

| Result | Decision |
|--------|----------|
| B ≈ A (gap < 2%, not significant) | **Switch to English** — wins code maintainability + phase-gate consistency, no perf cost |
| B > A (gap ≥ 3%, significant) | **Switch to English** — performance + maintainability win |
| B < A (gap ≥ 3%, significant) | **Keep Chinese** — performance trumps maintainability |
| B < A (gap 2-3%, concentrated on specific intents) | **Mixed strategy** — English for most, Chinese for sensitive intents |
| E ≠ A (judge scores diverge significantly) | **Judge prompt language must be controlled independently** — standardize on one language |
| C > B (respond-in helps) | Add respond-in instruction to production persona |
| C ≈ B (respond-in irrelevant) | Skip respond-in (unnecessary complexity) |

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Translation quality introduces noise | High | Semantic translation (done), domain terms preserved verbatim, human review before run |
| Query expansion language change confounds results | Medium | Expansion prompt is part of the treatment (intentional); if needed, add a B' variant with Chinese expansion + English prompt to isolate |
| Small sample size for rare intents (proportion: n=3) | Medium | Report but don't draw conclusions from n<10 cells |
| Model version drift between runs | Low | Record exact model ID; run all variants in same session |
| BM25 candidate order varies | Low | BM25 is deterministic given same query; expansion prompt change (B/C) may alter expanded query → different candidates. Capture candidate lists per run for post-hoc analysis |

## 8. Success Criteria

The experiment succeeds (produces an actionable decision) when:
1. All 4 primary variants (A/B/C/E) complete on 168 cases
2. Per-case results are captured for diff analysis
3. The decision matrix yields a clear cell (one of the defined outcomes)

The experiment is **inconclusive** if pass_rate variance within repeated runs of the same variant exceeds the cross-variant delta. Mitigate by running each variant 2× if budget allows.

## 9. Timeline Estimate

| Step | Hours |
|------|-------|
| Review & finalize translations in arm variant files | 1h |
| Wire variant switching into eval-cli (or env-var approach) | 1-2h |
| Run 4 variants × 168 cases (sequential, depends on model latency) | ~4-6h |
| Analysis + diff-case review + report | 2-3h |
| **Total** | **~8-12h** |

## 10. File Inventory

```
wayfinder/data-agent/research/exp2-arms/
├── exp2-methodology.md          ← this document
├── arm-a-baseline/
│   └── README.md                ← reference to current production files
├── arm-b-chinese/
│   └── prompt-variant.ts        ← phase-gate ZH translations (for optional Variant F)
└── arm-c-english/
    └── prompt-variant.ts        ← prompt.ts + expand-query + judge EN translations (Variants B/C/E)
```
