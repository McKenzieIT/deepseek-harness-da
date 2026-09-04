# dsh-eval-cli

Standalone eval CLI for the dsh-data-agent NL2SQL pipeline. Drives eval cases against the real engine, persists results as JSON, and reports to stdout.

## Standard Eval Mode: SQL Semantic Judge

**SQL semantic judge is the standard evaluation mode** (enabled by default since CL-10). It uses an LLM to evaluate whether the generated SQL is semantically correct — checking table selection, field selection, filter conditions, aggregation logic, and overall semantics.

The older `--no-sql-judge` mode auto-passes any case that returns SQL, hiding real semantic errors (e.g., selecting the wrong table, missing JOINs, incorrect filters). It showed 100% on original cases while sql-judge revealed the true quality was 70%.

### Quality Baseline

A pass rate is only comparable to another one measured under the **same protocol**. Always read the protocol column with the number.

| Protocol | Model | Run ID | Date | Rate |
|---|---|---|---|---|
| **pass@3 pass^k, judge-only (CURRENT)** | **qwen3.7-max** | `rebaseline-passk-168-clean` | 2026-09-04 | **104/168 = 61.9%** |
| pass@3 pass^k, **real-exec** (RBI 10000251, 39 EXEC cases — **different case set**) | qwen3.7-max | `rebaseline-real-exec-rbi-10000251` | 2026-09-04 | **5/39 = 12.8%** real-exec; within-run judge 放过率 **35.9pp (14/39)** ⚠ dual-score ceiling withdrawn (engine self-correction; standalone judge-only `rebaseline-judge-only-rbi-10000251` pending) |
| pass@3 pass^k, judge-only (hybrid merge, superseded by clean) | qwen3.7-max | `rebaseline-passk-168-merged` | 2026-09-03 | 88/168 = 52.4% |
| pass@3 best-of-k, judge-only | qwen3.7-max | `exp4-arm-a` | 2026-09-02 | 148/168 = 88.1% |
| pass@1, exec+judge | qwen3.7-max | `1510b3e0` (CL-16+17) | 2026-08-31 | 129/168 = 76.8% |
| pass@3 best-of-k, judge-only | qwen-plus *(rejected)* | `exp2-arm-a` | 2026-09-02 | 121/168 = 72.0% |

> **2026-09-03: pass^k semantics is LIVE** (`runner.ts` `passKVerdict` landed). ~~The definitive pass^k baseline is **52.4%**~~ — **superseded 2026-09-04 by `rebaseline-passk-168-clean` = 61.9%; see the next note.** (`rebaseline-passk-168-merged`, 88/168) — vs best-of-k 88.1% = −35.7pp (pass^k is strictly lower by design; the two are NOT directly subtractable). The best-of-k / pass@1 rows below it are historical. The 52.4% run was contaminated by AGA empty-response bursts under machine load (63/168 cases) and corrected via a clean conc=4 rerun of those 63 + merge — see `wayfinder/data-agent/research/experiment-audit-log.md` (2026-09-03 definitive entry).

> **2026-09-04 (GA-EVAL-CLEAN-RERUN): the CURRENT pass^k baseline is now the single uniform-clean artifact `rebaseline-passk-168-clean` = 61.9% (104/168, conc=3, --today 20260903 pinned, 0 AGA-burst contamination).** Replaces the 52.4% hybrid merge (105 genuine + 63 clean rerun) with one clean single-artifact run. +9.5pp vs 52.4% is within the n=168 two-sample MDE (~10.5pp, not significant) — likely model non-determinism (pass^k noise) + conc=3 cleaner AGA than the prior conc=4-under-load merge. Item-4 `config` field is LIVE on the artifact (verdict_semantics='pass^k', today, with_query, concurrency). **Executor real-exec (`--with-query`) is NOT a viable baseline on k11-v2**: k11-v2 expected result_values are judge-only semantic targets (not real-exec-derived; no `expected.sql`; k11v2_001's 1.5M unachievable by any reasonable SQL — SUM on the covered table = 13.6B). A real-exec baseline needs a real-exec-derived case set (the RBI eval `eval_10000251_*` has one). The `--with-query` boot bug (credentials-seam regression) was fixed (context.ts). See `experiment-audit-log.md` (2026-09-04 entry).

> **2026-09-04 (GA-EVAL-REAL-EXEC): the real-exec baseline IS NOW established on a real-exec-derived case set** — `rebaseline-real-exec-rbi-10000251` = **12.8% (5/39)** real-exec (RBI scope 10000251, 39 EXEC scalar_exact cases, conc=3, `--today 20260806` pinned, `--with-query` + `maxc-sidecar-k11.mjs`, 0 AGA-burst, 0 infra). The judge ceiling (dual-score, execution-blind) = **48.7% (19/39)**; **the gap = 35.9pp (14/39) judge false-pass** — cases the judge semantically passed but whose real-executed value was wrong (73.7% of the judge's passes are false). **real-exec ≤ judge-only** as expected; the gap quantifies the judge leniency the ticket set out to measure. Caveat: this is a **DIFFERENT case set** from k11-v2 (39 RBI EXEC vs 168 k11-v2 mixed) — the 12.8% is NOT comparable to the k11-v2 61.9% judge-only, only to the same-case-set 48.7% dual-score ceiling. The lower absolute number reflects real-exec being strictly harder (value must match, not just semantics) + a 34% non-SQL tool-call emission rate (model emits RBI tool-call format `load_event_definition` for event-based questions — fails both real-exec + judge, EXCLUDED from the gap). **⚠ CORRECTION (2026-09-04, post-resolution review)**: the dual-score methodology is INVALID. The Nl2sqlEngine self-corrects SQL via execution feedback — `context.ts:348` wires `this.odps = withQuery ? CtxOdpsAdapter : StandInOdps` INTO the engine's gen loop (`engine.ts` `run()` retries on critic_fail/RECOVERABLE execution errors). So `--with-query` **changes SQL generation** (real-exec self-corrects on real ODPS errors; judge-only uses `StandInOdps` always-`done` → no execution-error self-correction). The 48.7% is the judge on the real-exec run's **self-corrected** SQL, NOT a standalone judge-only ceiling (first-attempt SQL) — "no separate judge-only run needed" is WITHDRAWN. Proof: 11 of 117 attempts in the real-exec artifact have null `generated_sql` (6 cases — engine exhausted `MAX_FEEDBACK_RETRIES`), impossible with `--with-query` off. **What STANDS**: real-exec 12.8% (5/39, on the engine's final self-corrected SQL — valid); **within-run judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)** — judge passed the engine's final SQL but the executed value was wrong (same final SQL within the run; per-SQL judge leniency, valid, does NOT need a standalone run). A standalone judge-only baseline `rebaseline-judge-only-rbi-10000251` (`--with-query` off) is being run for the true ceiling; the cross-run gap has a self-correction confound (different SQL). See `experiment-audit-log.md` (2026-09-04 correction). Reproduce: `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml node --import tsx/esm packages/eval/eval-cli/src/bin.ts --cases packages/eval/eval/cases/rbi-10000251-exec --output packages/eval/eval-cli/eval-results/ --pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today 20260806 --scope-id 10000251 --with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs --run-id rebaseline-real-exec-rbi-10000251`. See `experiment-audit-log.md` (2026-09-04 GA-EVAL-REAL-EXEC entry).

**`76.8% → 88.1%` is a protocol + code delta, not a model delta.** Both rows are qwen3.7-max — it has been the de-facto model for every recorded run since 2026-08-30 (it used to be a silent CLI default, removed by CL-8). The model comparison is `exp4-arm-a` vs `exp2-arm-a` at constant code, protocol and date: **+16.1%**, with zero regressions across all 8 intents, 4 complexity levels and 4 categories.

Per-category, for the current pass^k baseline (`rebaseline-passk-168-clean`, 2026-09-04; prior merge in parens):

| Category | Cases | Pass | Rate | (prior merge) |
|---|---|---|---|---|
| Original | 80 | 54 | 67.5% | (48/60.0%) |
| Alias | 40 | 20 | 50.0% | (16/40.0%) |
| Voice EXEC | 30 | 19 | 63.3% | (14/46.7%) |
| Voice DELIVERY | 18 | 11 | 61.1% | (10/55.6%) |
| **Total** | **168** | **104** | **61.9%** | (88/52.4%) |

> Historical best-of-k per-category (`exp4-arm-a`): Original 86.3% / Alias 87.5% / Voice EXEC 93.3% / Voice DELIVERY 88.9% = 88.1%. pass^k is strictly lower per-category (all-3-must-pass vs any-of-3). The +16.1pp vs qwen-plus model comparison still holds (semantics change affects both arms equally).

Earlier baselines: `10320fe2` (CL-11~14) — 124/168 = 73.8% @ pass@1.

Full analysis, including per-intent/per-complexity breakdowns and the latency tradeoff (+48.9% mean per case): `wayfinder/data-agent/research/model1-baseline-analysis.md`.

> **Caveat — `judge-only` rows.** Those runs had no SQL executor attached (`query_result` was null for every attempt), so for EXEC cases `execution_match` came from the SQL judge's *semantic* assessment rather than from real query results. Treat judge-only numbers as an **upper bound**: the judge can pass SQL that is semantically plausible but would return wrong numbers. The judge's pass-through rate is currently unmeasured.
>
> The 25 DELIVERY cases carry no `sql_judge` verdict **by design** — they have `result_value: null` and `match_mode: null`, so `runner.ts:242` skips the execution block entirely and `executionMatch` keeps its initializer `true` (`runner.ts:241`); those cases are scored solely by `delivery_match`. (An earlier revision of this note claimed those 75 attempts were "counted as passed" by a lax verdict rule — that was wrong, and the `executionMatch = false` hardening for unverifiable executions affects **zero** attempts in these runs, since sql-judge is enabled by default.)
>
> **Why `--with-query` is not a drop-in on k11-v2.** The `expected.result_value`s were never derived from executing SQL — no case carries an `expected.sql`, and P11e explicitly *preserved* the expected values inherited from the pre-P11e case set while rewriting only the question wording, so their provenance is unrecoverable. 34 of the 57 `scalar_exact` targets are hand-picked round numbers (`1500000`, `2800`, `120000`, `5200`, `35000`, `0.15`), and `k11v2_001`'s 1.5M is ~4 orders of magnitude off the covered table's actual SUM (13.6B). Under a real executor those 57 cases fail regardless of SQL correctness. The 86 `row_count_range` cases are structural assertions (`[1,3]`, `[5,7]`, `[25,30]`) and would largely survive. Note the side effect for paired A/B experiments: uniformly-failing cases contribute **zero discordant pairs**, so enabling the executor here trades statistical power for verification rigour. See `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md`.

### Quality Targets

| Metric | Current (pass@3 pass^k) | Short-term | Mid-term | Long-term |
|---|---|---|---|---|
| Overall | **61.9%** (`rebaseline-passk-168-clean`) | 60%+ | 70%+ | 85%+ |
| Original | 67.5% (`rebaseline-passk-168-clean`) | 65%+ | 75%+ | 88%+ |

> Target values are **PROPOSED under pass^k semantics** (2026-09-03), pending PM sign-off. Rationale: pass^k is ~21–36pp lower than best-of-k by design (all-3-must-pass vs any-of-3), so targets are set ambitious relative to the 52.4% pass^k current — mirroring the old best-of-k targets' ambition (75/80/90 → 60/70/85 pass^k). Long-term 85%+ approaches the best-of-k 88.1% under the stricter semantics (= genuinely high consistency). The old best-of-k-era targets (Overall 75/80/90, Original 78/85/90) are superseded.

> **pass^k is now LIVE** (`runner.ts` `passKVerdict` landed 2026-09-03). The current baseline is **61.9%** pass^k (`rebaseline-passk-168-clean`, 2026-09-04; the earlier 52.4% hybrid merge is superseded) (vs best-of-k 88.1% = −35.7pp, by design). Targets above have been **re-set under pass^k semantics (proposed, pending PM sign-off)** — GA-EVAL-REBASELINE item 3. Replay estimate was ~47.6%; the live definitive 52.4% is within the n=168 MDE (≈5.4–10.1pp). See `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md`.

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
node --import tsx/esm packages/eval/eval-cli/src/bin.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 3 --concurrency 3 --skip-health-gate
```

> **Operational note — concurrency under load (learned 2026-09-03)**: `--concurrency 4` under machine load (concurrent IDE / `pnpm dsh web` / other heavy node procs) can trigger **AGA empty-response bursts** — the AGA endpoint returns empty streams, failing pass^k for affected cases. A 168-case conc=4 run lost 63/168 cases this way (raw 33.9% vs the corrected 52.4%). **Prefer `--concurrency 2` or `3` for full runs**, or ensure the machine is unloaded (pause `pnpm dsh web`). `--concurrency 1` is cleanest but infeasible (~16h for 168 cases). See `wayfinder/data-agent/research/experiment-audit-log.md` (2026-09-03 entry).

To reproduce the current pass^k baseline exactly: `--run-id rebaseline-passk-168-clean --today 20260903` (conc=3; --today pinned to match the prior protocol — see audit-log 2026-09-04).

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
| `--with-query` | *(off)* | Mount query-maxcompute for real SQL execution (requires `--sidecar maxc-sidecar-k11.mjs` + `MAXC_CONFIG`; see Environment) |
| `--responder <mode>` | `engine` | `engine` (NL2SQL pipeline) or `harness` (full agent) |
| `--variant <A\|B\|C\|D>` | — | G1b experiment variant (required with `--responder harness`) |

Run `--help` for the full flag list (`--sidecar`, `--scope-id`, `--no-query-expansion`).

### Environment

| Variable | Required | Description |
|---|---|---|
| `DASHSCOPE_API_KEY` | yes | Must live in `~/.dsh/.credentials.yaml` (file mode 0600), **not** `process.env` — `llm-dashscope` resolves it per-request via `ctx.credentials` (intranet-security-first). The CLI pre-flights the file and exits if the key is absent. |
| `EVAL_LLM_PROVIDER` | yes | Responder + SQL judge provider. No silent vendor fallback — fail-loud when unset. Overridden by `--provider`. |
| `EVAL_LLM_MODEL` | yes | Responder + SQL judge model. No silent vendor fallback — fail-loud when unset. Overridden by `--model`. |
| `MAXC_CONFIG` | with `--with-query` | Path to the maxc config yaml (e.g. `~/.maxc/config_ieu_cdm.yaml` — K11 lives in the `ieu_cdm` project). **Required**: the default `~/.maxc/config.yaml` is overseas (hdyl_data_sg_dev). Also pass `--sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs` (the default `standin-sidecar.mjs` is a mock; `maxc-sidecar-k11.mjs` -> real `maxc` CLI). Requires the `maxc` CLI on PATH. |
| `EXP2_ARM` | no | Prompt-language experiment arm (`B` = full-English structural prompt, `E` = English judge). Leave unset for the standard Chinese prompt. |

## Recording Results

Result JSON records `run_id`, `timestamp`, `summary`, per-case verdicts, and — since 2026-09-03 (GA-EVAL-REBASELINE item 4) — a **`config` field** (`provider`/`model`/`pass_k`/`concurrency`/`sql_judge`/`verdict_semantics`/`responder`/`scope_id`/`today`/`query_expansion`/`with_query`/`skip_health_gate`) so a run's protocol+semantics are detectable from the artifact itself. **Token usage is NOT yet recorded** (follow-up — needs an LLM-stream interceptor; see GA-EVAL-REBASELINE). Recording in the audit log is still mandatory — `config` captures the protocol, but the audit log captures the narrative + contamination/correction history. (The `config` field was added by GA-EVAL-REBASELINE item 4.)

After each eval run, record the results in `wayfinder/data-agent/research/experiment-audit-log.md` using this template:

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
