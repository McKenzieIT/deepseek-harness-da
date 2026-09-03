# dsh-eval-cli

Standalone eval CLI for the dsh-data-agent NL2SQL pipeline. Drives eval cases against the real engine, persists results as JSON, and reports to stdout.

## Standard Eval Mode: SQL Semantic Judge

**SQL semantic judge is the standard evaluation mode** (enabled by default since CL-10). It uses an LLM to evaluate whether the generated SQL is semantically correct — checking table selection, field selection, filter conditions, aggregation logic, and overall semantics.

The older `--no-sql-judge` mode auto-passes any case that returns SQL, hiding real semantic errors (e.g., selecting the wrong table, missing JOINs, incorrect filters). It showed 100% on original cases while sql-judge revealed the true quality was 70%.

### Quality Baseline

A pass rate is only comparable to another one measured under the **same protocol**. Always read the protocol column with the number.

| Protocol | Model | Run ID | Date | Rate |
|---|---|---|---|---|
| pass@1, exec+judge | qwen3.7-max | `1510b3e0` (CL-16+17) | 2026-08-31 | 129/168 = 76.8% |
| pass@3 best-of-k, judge-only | **qwen3.7-max** | `exp4-arm-a` | 2026-09-02 | **148/168 = 88.1%** |
| pass@3 best-of-k, judge-only | qwen-plus *(rejected)* | `exp2-arm-a` | 2026-09-02 | 121/168 = 72.0% |

**`76.8% → 88.1%` is a protocol + code delta, not a model delta.** Both rows are qwen3.7-max — it has been the de-facto model for every recorded run since 2026-08-30 (it used to be a silent CLI default, removed by CL-8). The model comparison is `exp4-arm-a` vs `exp2-arm-a` at constant code, protocol and date: **+16.1%**, with zero regressions across all 8 intents, 4 complexity levels and 4 categories.

Per-category, for the current baseline (`exp4-arm-a`):

| Category | Cases | Pass | Rate | vs qwen-plus |
|---|---|---|---|---|
| Original | 80 | 69 | 86.3% | +10.0pp |
| Alias | 40 | 35 | 87.5% | +20.0pp |
| Voice EXEC | 30 | 28 | 93.3% | +30.0pp |
| Voice DELIVERY | 18 | 16 | 88.9% | +11.1pp |
| **Total** | **168** | **148** | **88.1%** | **+16.1pp** |

Earlier baselines: `10320fe2` (CL-11~14) — 124/168 = 73.8% @ pass@1.

Full analysis, including per-intent/per-complexity breakdowns and the latency tradeoff (+48.9% mean per case): `wayfinder/data-agent/research/model1-baseline-analysis.md`.

> **Caveat — `judge-only` rows.** Those runs had no SQL executor attached (`query_result` was null for every attempt), so `execution_match` came from the SQL judge alone. 75 of 504 attempts had no judge verdict either and were counted as passed by the then-current `bestOfKVerdict`. Treat judge-only numbers as an upper bound.

### Quality Targets

| Metric | Current | Short-term | Mid-term | Long-term |
|---|---|---|---|---|
| Overall | 88.1% (`exp4-arm-a`, pass@3 best-of-k) | 75%+ | 80%+ | 90%+ |
| Original | 80.0% (`1510b3e0`, pass@1) | 78%+ | 85%+ | 90%+ |

> The target values were set under **best-of-k** verdict semantics. A pending change to `runner.ts` switches the runner to **pass^k** (all k attempts must pass) and stops auto-passing unverifiable executions; replaying the same attempt data under those semantics puts `exp4-arm-a` at ~47.6%. Targets must be re-set once that lands — see `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md`.

### Category Definitions

- **Original**: 80 core K11 business questions (metric lookup, aggregation, filtering)
- **Alias**: 40 cases using business terminology aliases (tests retrieval enrichment quality)
- **Voice EXEC**: 30 voice-style questions expecting SQL execution results (scalar_exact / row_count_range)
- **Voice DELIVERY**: 18 cases where the correct response is a clarification or refusal (llm_judge scored)

## Usage

### Run eval (standard, sql-judge enabled)

The responder LLM has **no default** — provider and model must be given explicitly (CL-8 removed the silent `aga`/`qwen3.7-max` fallback so that experiment results can never be misattributed to an unrecorded model). The CLI fails loud with `eval-cli: no responder provider/model configured` when either is missing.

**`qwen3.7-max` is the recommended model** (GA-MODEL1): +16.1% over `qwen-plus` at constant protocol, no regression on any intent/complexity/category slice. The tradeoff is ~+49% latency per case.

```bash
# The API key is read from ~/.dsh/.credentials.yaml (the credential seam),
# NOT from process.env — see Environment below.
EVAL_LLM_PROVIDER=aga EVAL_LLM_MODEL=qwen3.7-max \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 3 --concurrency 3 --skip-health-gate
```

To reproduce the current baseline row exactly, add `--run-id exp4-arm-a`.

### Compare two runs

```bash
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B>
```

Outputs category-level pass rate deltas and case-level flips (gained/lost). Run IDs can be prefixes (e.g., `9788424c` matches `9788424c-a167-4a19-9c72-e27ae7455f58`).

### CLI Options

| Flag | Default | Description |
|---|---|---|
| `--cases <dir>` | *(required)* | Case directory |
| `--provider <name>` | *(required)* | LLM provider for responder + SQL judge (env: `EVAL_LLM_PROVIDER`, no default) |
| `--model <name>` | *(required)* | LLM model for responder + SQL judge (env: `EVAL_LLM_MODEL`, no default) |
| `--schema <dir>` | `examples/k11-semantic-layer/` | Semantic layer definitions |
| `--output <dir>` | `eval-results/` | Output directory for result JSON |
| `--pass-k <n>` | 3 | Pass@K attempts per case |
| `--case <id>` | — | Run a single case |
| `--concurrency <n>` | 1 | Parallel case execution |
| `--run-id <id>` | *(auto UUID)* | Explicit run ID |
| `--today <YYYYMMDD>` | *(system date)* | Reference date for time-param extraction |
| `--no-sql-judge` | *(off)* | Disable SQL semantic judge (not recommended) |
| `--skip-health-gate` | *(off)* | Skip health gate pre-flight |
| `--with-query` | *(off)* | Mount query-maxcompute for real SQL execution |
| `--responder <mode>` | `engine` | `engine` (NL2SQL pipeline) or `harness` (full agent) |
| `--variant <A\|B\|C\|D>` | — | G1b experiment variant (required with `--responder harness`) |

Run `--help` for the full flag list (`--sidecar`, `--scope-id`, `--no-query-expansion`).

### Environment

| Variable | Required | Description |
|---|---|---|
| `DASHSCOPE_API_KEY` | yes | Must live in `~/.dsh/.credentials.yaml` (file mode 0600), **not** `process.env` — `llm-dashscope` resolves it per-request via `ctx.credentials` (intranet-security-first). The CLI pre-flights the file and exits if the key is absent. |
| `EVAL_LLM_PROVIDER` | yes | Responder + SQL judge provider. No silent vendor fallback — fail-loud when unset. Overridden by `--provider`. |
| `EVAL_LLM_MODEL` | yes | Responder + SQL judge model. No silent vendor fallback — fail-loud when unset. Overridden by `--model`. |
| `ODPS_ACCESS_ID` / `ODPS_ACCESS_KEY` / `ODPS_PROJECT` / `ODPS_ENDPOINT` | with `--with-query` | MaxCompute connection settings |
| `EXP2_ARM` | no | Prompt-language experiment arm (`B` = full-English structural prompt, `E` = English judge). Leave unset for the standard Chinese prompt. |

## Recording Results

Result JSON records `run_id`, `timestamp`, `summary` and per-case verdicts — it does **not** record the model, `pass_k`, concurrency, judge settings or verdict semantics. Those live only in the audit log, so a run whose log entry is missing cannot be attributed afterwards. Recording is therefore mandatory, not optional. (Fixing this asymmetry is tracked by `GA-EVAL-REBASELINE`.)

After each eval run, record the results in `wayfinder/semantic-layer/research/experiment-audit-log.md` using this template:

```markdown
## YYYY-MM-DD: <ticket/change description>

### Setup

- **基线**: Run `<baseline_run_id>`
- **Cases**: <count> K11 cases
- **Model**: <provider>/<model>, <responder mode>, pass_k=<n>, concurrency=<n>, sql-judge enabled
- **变更**: <what changed>

### Data (verbatim)

<paste compare.ts output or manual category table>

### Verdict

<numbered analysis of results>

### Ticket Pointer

Resolves: [<ticket>](link)
```
