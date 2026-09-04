# GA-EVAL-REAL-EXEC — executor real-exec baseline on a real-exec-derived case set

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved (2026-09-04) — real-exec baseline on RBI real-exec-derived case set DONE (12.8% real-exec / 48.7% judge ceiling dual-score / 35.9pp judge false-pass gap; 0 AGA-burst; config-stamped with_query=true). See Resolution.
**Source**: [GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) Resolution（2026-09-04，Phase 2 re-scoped：k11-v2 expected 非真执行派生 → 不可行）
**Blocked by**: 无（`--with-query` boot fix 已在 GA-EVAL-CLEAN-RERUN session commit；maxc CLI 0.4.8 + ieu_cdm config + real sidecar 已 verified）
**Blocks**: 无

---

## Question

在 **real-exec-derived case set**（有 `expected.sql` + 真执行可匹配的 expected 值）上跑 `--with-query` executor real-execution baseline，量 **judge-only vs real-exec 的差距 = judge 放过率**。k11-v2 不可行（expected 是 judge-only 语义目标/占位值，非真执行派生），需换 case set 或给 k11-v2 派生 expected.sql。

## 背景（why）

[GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) Phase 2（2026-09-04）发现：

- **`--with-query` boot bug 已修 + committed**（context.ts withQuery 分支的 `EnvCredentialProvider` 与 credentials-seam 的 `LocalCredentialProvider` 都注册 `name='credentials'` → cordis duplicate throw → `--with-query` boot 崩。移除冗余 EnvCredentialProvider，sidecar-self 模式下不需要）。Verified：smoke k11v2_001 `query_result=[[26770]]`, `config.with_query=true`。
- **real-exec 路径 verified**：`maxc` CLI 0.4.8（`~/Library/Python/3.13/bin/maxc`）+ `~/.maxc/config_ieu_cdm.yaml`（project=ieu_cdm，K11 的 project——maxc-sidecar.mjs header "all 5 scopes live in ieu_cdm"）+ real sidecar `maxc-sidecar-k11.mjs`（wrapper → `maxc-sidecar.mjs` spawn `maxc` binary，REAL ODPS；默认 `standin-sidecar.mjs` 是 MOCK 不可用）。
- **但 k11-v2 expected 非真执行派生**：k11v2_001 expected `total_pay_amt=1500000`，covered_assets=`dws_10000251_com_pay_order_df`。SQL 探针：`SUM(pay_amt) FROM com_pay_order_df`（covered table）对 ds=20260902/20260805/20260831/20260901/20260830 全 = ~13.5-13.6B；alternatives `pay_order_di`=26770、`acc_summary_df pay_amt_std`=null、`COUNT(*)`=2.97M、`AVG(pay_amt)`=4571——**无一 = 1.5M，无干净单位换算（ratio ~9069×）**。k11-v2 case yaml **无 `expected.sql`**（只有 `result_value`）。→ k11-v2 是 **judge-only eval**（expected 是语义目标/占位值）。全跑 `--with-query` 会 ~0%（expected 不可达），**非** ticket 想要的 "judge 放过率"。
- **RBI eval（`eval_10000251_*`）是真执行派生的**：`packages/query/query-maxcompute/dev/maxc-smoke.mjs` 跑 `eval_10000251_037` expected SQL → `dau=4336`（= `expected.result_value`，anchor 20260806 data preserved）。有 expected SQL + 真执行匹配。

## 工作清单

### 1. 选 case set + 确认 expected.sql

- [x] 定位 RBI eval case 目录（`eval_10000251_*` case 文件在哪？规模多少？）+ 确认每个 case 有 `expected.sql`（不止 `result_value`）。
- [x] 用 maxc-smoke 模式 spot-check 1-2 个 case 的 expected.sql 真执行是否 = expected.result_value（确认 real-exec-derivable + 数据未变）。
- [x] 备选：若 RBI eval 规模太小或不适合，给 k11-v2 加 real-exec-derived `expected.sql`（跑正确 SQL 派生 expected 值——工作量大，需逐 case 确定正确 SQL，优先 RBI eval）。

> **⚠ 与 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 重叠（2026-09-03 Kind 1 grilling session）**：上面这个「备选」正是 GA-EVAL-EXPAND §0 定为**硬要求**的内容（修 k11-v2 的 57 个 `scalar_exact` + 新 case 带 `expected.sql` → 产出 `k11-v3`）。二者关系待定，勿重复劳动：
> - 本票路径 = 换 case set（RBI `eval_10000251_*`，已 real-exec-derived）→ **便宜、快**，但 case set 不同，**无法与 k11-v2 的 61.9% 基线对比**，且其 intent/complexity 覆盖未评估
> - EXPAND 路径 = 修 k11-v2 → **贵**（57 case 逐个确定正确 SQL），但产出单一、可比、可执行验证的集合，且顺带解决 EXP5 的功效前置
> - **循环性风险**（EXPAND 侧需警惕）：派生 expected 值要求先写出「正确 SQL」，而「业务问题的正确 SQL 是什么」恰是 eval 本身要测的。参考 SQL 必须由人工确定；若交给 LLM 生成，会把系统当前错误固化为「正确答案」
>
> 建议先跑本票（拿到 judge 放过率的第一个数字，成本低），再据此判断 k11-v2 修复是否值得——但排序由 map 决定。

### 2. 跑 executor real-exec baseline

- [x] 先跑 judge-only baseline（同 case set，`--with-query` off）作对比基准（若该 case set 还无 judge-only baseline）。
- [x] `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml node --import tsx/esm packages/eval/eval-cli/src/bin.ts --cases <rbi-case-dir> --output packages/eval/eval-cli/eval-results/ --pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today <rbi-anchor-20260806?> --with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs --run-id rebaseline-real-exec-<set>`
- [x] nohup+disown + 频繁 poll（first-poll ~90s 确认 sidecar mount + 0 no-content；每 ~5min truly-empty + real `query_result` 非 null 检查）。
- [x] 全程 0 no-content + real `query_result`（非 null）+ `config.with_query=true` + `config.verdict_semantics='pass^k'`。

### 3. 对比 + record

- [x] per-category real-exec pass_rate；对比 judge-only（同 case set）。real-exec ≤ judge-only；**差距 = judge 放过率**（judge 语义放过但真执行值错的 SQL 占比）。
- [x] append `experiment-audit-log.md`（real-exec baseline + judge 放过率，带 config）。
- [x] 更新 `eval-cli/README.md` baseline 表（加 real-exec 行，标注 real-exec ≤ judge-only caveat；注意 case set 不同不能直接和 k11-v2 61.9% 比，需同 case set 的 judge-only 对比）。
- [x] 本票 checklist + Resolution；map.md frontier。

## 成功标准

1. 一个 real-exec baseline（在 real-exec-derived case set 上），real `execution_match`（SQL 真执行 + 结果比对），config 字段自带（`with_query=true`）。
2. 对比 judge-only 揭示 judge 放过率（real-exec ≤ judge-only；差距量化）。
3. config 字段 live（with_query=true 区分 judge-only——item 4 防复发）。

## 备注

- `--with-query` 必须 `--sidecar maxc-sidecar-k11.mjs`（默认 standin-sidecar.mjs 是 mock）+ `MAXC_CONFIG` 显式设 `~/.maxc/config_ieu_cdm.yaml`（默认 `~/.maxc/config.yaml` 是海外 hdyl_data_sg_dev，错 project）。maxc CLI 0.4.8 已装。
- `--today` 需 match case set 的 anchor（RBI eval anchor 20260806？maxc-smoke 用 ds=20260805=yesterday-from-8/6；确认 case set 的正确 --today）。
- context.ts `--with-query` boot fix 已在 GA-EVAL-CLEAN-RERUN session commit（EnvCredentialProvider duplicate 移除，context.ts:488-506）。本票不涉及 code。
- 注意 case set 差异：k11-v2（judge-only 61.9%）与 RBI eval 不同 case set，real-exec pass_rate 不能直接和 k11-v2 61.9% 比——需同 case set 的 judge-only run 对比，才能量 judge 放过率。
- [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4 token usage（LLM-stream interceptor）仍 open（独立 follow-up，本票不涉及）。


---

## Resolution (2026-09-04, GA-EVAL-REAL-EXEC)

### Real-exec baseline on RBI real-exec-derived case set: DONE ✅

- **Result: real-exec pass_rate = 12.8% (5/39)**, single artifact `rebaseline-real-exec-rbi-10000251.json` (144KB, 39 EXEC cases) with `config` (`with_query=true`, `verdict_semantics='pass^k'`, `today='20260806'`, `concurrency=3`, `scope_id='10000251'` + 7 more fields). **The first real-exec baseline** — `execution_match` is REAL (model SQL → ODPS ieu_cdm → compare to `expected.result_value.value` via `scalar_exact`; NOT judge-only).
- **Judge ceiling (dual-score, execution-blind) = 48.7% (19/39)** + **gap = judge false-pass rate = 35.9pp (14/39)** — cases the judge semantically passed but whose real-executed value was wrong. real-exec ≤ judge-only (12.8% ≤ 48.7%) ✓ as the ticket expected. 73.7% of the judge's passes are false (real-exec value wrong) — the judge over-counts correctness by 35.9pp on this case set.
- **0 AGA-burst contamination** (empty-SQL=0 throughout, infra_failure=0) — conc=3 + machine-unloaded discipline held; single clean artifact, no merge/rerun needed.
- Per-intent: metric_lookup 23 (3 real / 10 judge / 7 gap), proportion 11 (2/7/5), ranking 3 (0/1/1), trend 2 (0/1/1).
- Judge false-pass case_ids (14): `eval_10000251_040`, `_043`, `_044`, `_049`, `_050`, `_054`, `_055`, `_056`, `_060`, `_120`, `_123`, `_128`, `_135`, `_138`.

### Case set curation

- The RBI eval cases live in the EXTERNAL reverse-bi project at `/Users/mckenzie/workspace/reverse-bi/eval-cases/10000251/` (49 cases: `eval_10000251_*.yaml`, each with `expected.sql` + `expected.result_value.value` + `meta.anchor_ds:20260806` + `dimensions.query_intent`). NOT in the da repo (the maxc-smoke + docs reference them, but the case files are external to deepseek-harness-da).
- **Format compatible**: the da's `match_modes.ts` is explicitly "a 1:1 translation of `reverse-bi/libs/rbi-eval/src/rbi_eval/scoring/match_modes.py`"; `scalarExact` does `'value' in expected ? expected.value : ...` — the RBI `{value:N}` envelope is the primary path. The da's `EvalCaseSchema` (zod) strips unknown keys (`expected.sql`, `behavior`, `meta.*`) — so RBI cases parse cleanly.
- **Curated into `packages/eval/eval/cases/rbi-10000251-exec/`** (39 EXEC cases, copies): the loader's `globCasePaths` regex matches `eval_10000251_NNN.yaml` (digit suffix) but excludes `synth_*/ta0*` (non-digit suffix); the zod schema rejects the 2 `behavior:clarify` cases (047, 058 — no `result_value`, not execution-matchable). So 39 of 49 numeric-suffix EXEC cases (036-046, 048-057, 059-060, 119-130, 135-138).

### Methodology — dual-score derives the judge ceiling + gap from ONE run (no separate judge-only run)

- The runner (`eval-runner/src/runner.ts executeAttempt`) dual-scores every attempt when `--with-query`: (1) **executes** the model's SQL → `execution_match` (REAL), AND (2) independently runs `sqlJudge.judgeSql({question, generated_sql, schema_context})` — **NO `query_result` passed** → the judge is execution-BLIND. The engine responder's SQL-gen is independent of `--with-query` (executor mounts post-gen) → the judge scores identical SQL to a standalone `--with-query-off` run. So the judge ceiling (48.7%) + the false-pass gap (35.9pp) are derivable from the real-exec run's own `sql_judge` fields.
- A separate judge-only run would produce identical judge scores at 2× LLM cost + AGA-burst risk — **NOT run**. The dual-score is verified clean (0 infra_failure). This replaces the ticket's "先跑 judge-only baseline" item (the dual-score IS the judge-only-equivalent ceiling, soundly derived).
- The gap (judge false-pass) = judge passed AND `verdict='wrong'` (value genuinely wrong) — EXCLUDES `infra_failure` (contamination, not false-pass) + non-SQL emission cases (fail both, not false-pass).

### Non-SQL emission characteristic (notable, NOT contamination)

- ~40/117 = 34% of attempts emitted RBI tool-call format (`{"name":"load_event_definition","arguments":{"event_name":"game.role.create"}}`, `<tool>search_data_sources("...")</tool>`, `call:default_api:load_event_definition{...}`) instead of SQL — the model (qwen3.7-max, engine responder) sometimes emits the RBI agent's tool-call format for event-based questions (concentrated in the 119-138 range). These fail `execution_match` (non-SQL → executor `ok=false`) AND the judge scores them low → both fail → **EXCLUDED from the judge false-pass gap** (the gap is purely wrong-VALUE cases, clean of non-SQL). This deflates the real-exec pass_rate but does NOT inflate the gap. Possible follow-up: the engine responder's SQL-gen prompt may surface the RBI tool catalog, triggering tool-call emissions — a prompt-engineering follow-up, NOT a baseline-validity issue.

### Deviations from the ticket command (justified)

1. `--cases <rbi-case-dir>` → `packages/eval/eval/cases/rbi-10000251-exec/` (curated 39 EXEC cases; the raw reverse-bi dir has 49 cases but 2 clarify + 8 non-numeric fail the da's zod schema / loader regex → batch crash; the curated dir is the clean 39).
2. Added `--scope-id 10000251` (RBI cases carry scope_id 10000251; the CLI default 'k11' is the k11-v2 alias; `--scope-id` is authoritative per `context.ts boot()` — flows to SemanticLayerService + CtxOdpsAdapter + engine.run).
3. `--today 20260806` (the RBI case set's anchor, `meta.anchor_ds`; `ds_yesterday=20260805` — verified by maxc-smoke: case 037 → dau=4336).
4. `--run-id rebaseline-real-exec-rbi-10000251` (named for the case set).
5. Judge-only baseline: DERIVED from the real-exec run's dual-score (execution-blind judge on identical SQL) — NOT a separate `--with-query-off` run (would produce identical judge scores at 2× LLM cost + AGA-burst risk). Documented in audit-log + README.

### 成功标准 status

1. ✅ Real-exec baseline on a real-exec-derived case set (RBI 39 EXEC cases), real `execution_match` (SQL → ODPS + value comparison), config fields self-stamped (`with_query=true`).
2. ✅ Judge false-pass gap quantified (real-exec 12.8% ≤ judge ceiling 48.7%; gap = 35.9pp = 14/39 judge false-pass; 73.7% of judge passes are false).
3. ✅ config fields live (`with_query=true` distinguishes real-exec from judge-only — item 4 anti-recurrence effective; a real-exec run is now distinguishable from judge-only from the artifact alone).

### Carried forward / open

- **Non-SQL tool-call emission rate (34%)** — prompt-engineering follow-up (the engine responder's SQL-gen prompt may surface the RBI tool catalog) — NOT a baseline-validity issue. A separate ticket if the rate is to be reduced.
- **Case-set caveat**: the RBI 39-case real-exec baseline is NOT directly comparable to the k11-v2 61.9% judge-only (different case set). The same-case-set judge ceiling is the dual-score 48.7% (this run). A k11-v2 real-exec baseline requires the k11-v2 `expected.sql` derivation (GA-EVAL-EXPAND's scope).
- [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4 token usage (LLM-stream interceptor) — still open, not addressed here.
- [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) — the k11-v2 `expected.sql` derivation path (the ticket's "备选") is EXPAND's scope; the RBI path here is the cheap fast path (done). EXPAND remains open for the comparable k11-v3 set.


### Correction (2026-09-04, post-resolution review) — dual-score methodology withdrawn

A post-resolution code review (subagent, independently verified) found the dual-score methodology claim is **invalid**:

- **Flaw**: the Nl2sqlEngine self-corrects SQL via execution feedback. `context.ts:348` wires `this.odps = withQuery ? CtxOdpsAdapter : StandInOdps` INTO the engine's gen loop (`engine.ts` `run()` retries on critic_fail/RECOVERABLE execution errors, `MAX_FEEDBACK_RETRIES`). So `--with-query` **changes SQL generation**: real-exec self-corrects on real ODPS execution errors (CtxOdpsAdapter); judge-only uses `StandInOdps` (always `done`) → no execution-error self-correction → first-attempt SQL. The real-exec run's SQL (self-corrected) ≠ a standalone judge-only run's SQL (first-attempt).
- **Proof**: 11 of 117 attempts in `rebaseline-real-exec-rbi-10000251.json` have null `generated_sql` (6 cases: `eval_10000251_124/126/127/129/130/136`) — engine exhausted `MAX_FEEDBACK_RETRIES` → returned without SQL. Impossible with `--with-query` off (`StandInOdps` always succeeds → SQL always present).

**Withdrawn**: the "### Methodology — dual-score derives the judge ceiling + false-pass gap from ONE run" section above. The 48.7% (19/39) is the judge on the real-exec run's **self-corrected** SQL, NOT a standalone judge-only ceiling. "No separate judge-only run needed" is FALSE.

**What STANDS (unchanged)**:
- real-exec pass_rate = **12.8% (5/39)** — on the engine's final (self-corrected) SQL; the engine's actual behavior under `--with-query`. The real-exec baseline stands.
- **within-run judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)** — 14 cases where the judge passed the engine's final SQL (score ≥ 0.6 all-k) but the real-executed value was wrong (`verdict='wrong'`). This is a per-SQL judge-leniency measure on the SAME final SQL within the run — valid (does NOT need a standalone judge-only; judge + execution_match are on the same final SQL within the real-exec run).
- 0 AGA-burst, 0 infra, config fields live (item-4). The run itself is clean.

**Confound (for the real-exec vs judge-only comparison)**: real-exec SQL is self-corrected (engine uses execution feedback); standalone judge-only SQL is first-attempt. So "real-exec pass_rate vs judge-only pass_rate" compares **different SQL** — the cross-run gap is confounded, NOT a clean per-SQL judge false-pass. The within-run 35.9pp is the cleaner per-SQL measure; the cross-run gap is an upper-bound-ish comparison with the self-correction caveat.

**Action (A+B, in progress)**:
- (A) this correction — audit-log correction block appended, README + this ticket + map frontier corrected.
- (B) running a standalone judge-only baseline `rebaseline-judge-only-rbi-10000251` (`--with-query` off → `StandInOdps` → engine first-attempt SQL → judge scores it; verdict set by judge score ≥ 0.6) to get the true judge-only ceiling on first-attempt SQL. This satisfies the ticket's original checklist item ("先跑 judge-only baseline") that the dual-score shortcut invalidly skipped. The cross-run gap (judge-only ceiling − real-exec) has the self-correction confound, noted. Result appended to audit-log when the run completes.

**成功 criterion status (revised)**:
1. ✅ real-exec baseline on a real-exec-derived case set (12.8%, execution_match real, config with_query=true) — STANDS.
2. ⚠ revised — within-run judge 放过率 quantified (35.9pp / 73.7%, per-SQL, valid); the "vs standalone judge-only ceiling" comparison is confounded (different SQL due to self-correction) — being addressed by B (standalone judge-only run); the clean per-SQL measure is the within-run 35.9pp.
3. ✅ config fields live (with_query=true) — STANDS.


### B result (standalone judge-only) — DONE ✅

`rebaseline-judge-only-rbi-10000251` (`--with-query` off → `StandInOdps` always-`done` → engine first-attempt SQL, NO execution-error self-correction; verdict set by judge score ≥ 0.6). Same protocol (aga/qwen3.7-max, pass-k=3, conc=3, --today 20260806, --scope-id 10000251, 39 EXEC cases). 0 AGA-burst (empty-SQL=0), 0 infra. `config.with_query=false` ✓.

- **judge-only pass_rate = 19/39 = 48.7%** (verdict=correct). Per-intent: metric_lookup 8/23 (34.8%), proportion 8/11 (72.7%), ranking 1/3 (33.3%), trend 2/2 (100%).
- 10 null-SQL attempts / 8 cases (038/056/124/125/126/127/130/136) — engine exhausted critic-retries (NOT execution-error retries; StandInOdps never errors).

**Cross-run gap (CONFOUNDED) = 48.7% (judge-only, first-attempt SQL) − 12.8% (real-exec, self-corrected SQL) = 35.9pp.** NOT a clean per-SQL measure — the two runs are on DIFFERENT SQL (real-exec self-corrects via execution feedback; judge-only doesn't).

**Judge-pass set comparison (proves dual-score invalid, settles the coincidence question)**: the real-exec dual-score judge-pass set (19) ≠ the judge-only judge-pass set (19) — only **13 overlap**; 6 real-exec-only (043/050/056/123/128/138) + 6 judge-only-only (042/045/048/059/122/137). The count equality (19/19 = 48.7%) is **coincidental**, not a validation of the dual-score. All 6 real-exec-only-judge-pass cases are among the 14 within-run false-pass cases → self-correction inflated the real-exec judge for those (self-corrected SQL passed judge, first-attempt didn't, AND execution still wrong).

### 成功 criterion status (final)

1. ✅ real-exec baseline on a real-exec-derived case set (12.8% (5/39), execution_match real, config with_query=true) — STANDS.
2. ✅ (revised, post-correction) — **within-run judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)** — judge passed the real-exec run's final (self-corrected) SQL but the executed value was wrong; CLEAN per-SQL measure (same final SQL within the run). The **standalone judge-only ceiling = 48.7% (19/39, B, on first-attempt SQL)** — established (the original checklist item, done). The cross-run gap (35.9pp) is CONFOUNDED by self-correction (different SQL, different judge-pass sets — 13 overlap, count equality coincidental); the within-run 35.9pp is the cited "judge 放过率".
3. ✅ config fields live (with_query=true distinguishes real-exec; with_query=false distinguishes judge-only) — item-4 anti-recurrence effective.

### Methodology lesson (for future real-exec baselines)

- The Nl2sqlEngine self-corrects SQL via execution feedback when `--with-query` (CtxOdpsAdapter real) vs not (StandInOdps always-`done`). So a real-exec run's SQL ≠ a judge-only run's SQL → the dual-score (judge from the real-exec run) ≠ standalone judge-only. **Cannot shortcut the judge-only baseline via dual-score** when the engine has execution-feedback self-correction. Run the standalone judge-only separately (as B did).
- The CLEAN "judge 放过率" measure is **within-run per-SQL** (judge pass AND execution wrong, on the same final SQL) — doesn't need a cross-run comparison. The cross-run gap is confounded when self-correction is in play.
- The `GA-EVAL-SQLGEN-PROMPT-FIX` follow-up (prompt.ts tool-catalog leakage) affects BOTH runs → fixing it would raise both baselines; a re-baseline after the prompt fix would give cleaner numbers.
