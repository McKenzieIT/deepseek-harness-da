# GA-EVAL-CLEAN-RERUN — 单次 uniform clean conc=4 pass^k 基线 + executor real-execution baseline

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved (2026-09-04) — Phase 1 (uniform clean conc=3) DONE (61.9%); Phase 2 (executor) RE-SCOPED: sidecar boot bug fixed (context.ts) + real-exec path verified, BUT k11-v2 expected values not real-exec-derived -> not viable on k11-v2 (needs a real-exec-derived case set). See Resolution.
**Source**: [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) Resolution（2026-09-03，item 2-4 完成后用户指定下一个 session 做）
**Blocked by**: 无（item 4 `config` 字段已落地；`pnpm build` 是 setup 前置，非 blocker）
**Blocks**: 无

---

## Question

把 pass^k 168-case 基线从"hybrid merge（105 genuine + 63 重跑）"升级为**单次 uniform clean conc=4 artifact**，并新增一个 **`--with-query` executor real-execution baseline**（real `execution_match`，非 judge-only upper bound）——两个 baseline 都自带 `config` 字段（[GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4）。

## 背景（why）

- definitive **52.4%**（`rebaseline-passk-168-merged.json`）是 hybrid merge（105 genuine from 污染 run + 63 重跑），可信（与重放 47.6% 一致 + 105 verified-genuine + 独立 code review），但**非单一 uniform clean artifact**。单次 uniform clean conc=4 会给一个 within-MDE（≈5.4-10.1pp）的干净单一数字 + 单一 artifact（归档更干净，无需 merge 说明）。
- 当前所有 baseline 都 **judge-only**（`query_result` null，`execution_match` 来自 SQL 语义 judge ≥0.6）= 语义正确性 upper bound（judge 可能放过执行错的 SQL）。接 executor（`--with-query` + MaxCompute）给 **real execution_match**——这是更彻底的 baseline，揭示 judge 放过率。

## 工作清单

### 0. 前置（CRITICAL）

- [x] ~~`pnpm build`~~ — **NOT NEEDED** (premise overcautious): lib/index.js already had the item-4 config spread (`...options?.config !== undefined ? {config: options.config} : {}`) from the 9/3 tsc emit; the ticket verify `grep verdict_semantics lib/index.js > 0` was WRONG (verdict_semantics is constructed in eval-cli main.ts:363 + eval-runner-service:452, NEVER in eval-runner/runner.ts). `pnpm build:lib:host` re-bundled to identical bytes (31,942). 1-case smoke verified config stamps (12 fields).（或 `pnpm --filter @deepseek-ai/dsh-eval-runner build`）—— **live eval 前必做**。`packages/eval/eval-runner` 的 `exports` → `lib/index.js`（gitignored + stale，item 4 源码改后未 rebuild）；unit spec 走 `src/` 故全过，但 live CLI 走 `lib/` → 不 rebuild 则 `config` 字段不 stamp。verify：`grep -c 'verdict_semantics' packages/eval/eval-runner/lib/index.js` > 0。
- [x] 机器减载（dsh web PID 21923 + 探测 Chrome 72652 已停；AliEntSafe 安全扫描 ~62% CPU root 杀不掉）→ 用 **conc=3**（非 4）避 AGA burst（README prefer 2-3；user-chosen via AskUserQuestion）（暂停 `pnpm dsh web` PID 21923 / 减轻 IDE）—— 避免 AGA empty-burst（教训见 [audit-log 2026-09-03](../../research/experiment-audit-log.md)）。或用 `--concurrency 3`（若 conc=4 re-degrade）。conc=1 不可行（~16h）。
- [x] nohup+disown detached + 频繁 poll（first-poll ~90s + 每 ~5min truly-empty [DIAG] 检测 + burst 簇发检查） + 频繁 poll（防 bg shell 回收；first-poll ~90s 确认 0 no-content = AGA 未退化）。

### 1. 单次 uniform clean conc=4 pass^k 168-case

- [x] `node --import tsx/esm packages/eval/eval-cli/src/bin.ts` (bin/eval.ts deleted -> src/bin.ts staged move; **conc=3** not 4; **--today 20260903** pinned to match prior protocol; --run-id rebaseline-passk-168-clean --cases packages/eval/eval/cases/k11-v2 --output packages/eval/eval-cli/eval-results/ --pass-k 3 --concurrency 4 --provider aga --model qwen3.7-max --skip-health-gate --run-id rebaseline-passk-168-clean`
- [x] 0 AGA burst — 3 scattered empty attempts in 504 (0.6%, 3 distinct cases k11v2_025/voice_017/voice_042, NOT clustered) = normal AGA flakiness, not the prior 63/168 burst. Single clean artifact, no merge/rerun. config.verdict_semantics='pass^k' ✓ (12 fields, today=20260903, with_query=false, concurrency=3)（AGA 不退化）→ 单一干净 artifact `rebaseline-passk-168-clean.json`（自带 `config` 字段——verify `config.verdict_semantics === 'pass^k'`）
- [x] **61.9% (104/168) vs 52.4% = +9.5pp** — within n=168 two-sample MDE (~10.5pp, NOT significant). Per-category: Original 67.5%(+7.5) / Alias 50.0%(+10.0) / Voice EXEC 63.3%(+16.7) / Voice DELIVERY 61.1%(+5.6). Positive shift across all 4 (likely model non-determinism + conc=3 cleaner AGA than prior conc=4-under-load merge). CONSISTENT per "within MDE".（应在 n=168 MDE ≈5.4-10.1pp 内一致；若显著偏离，investigate）

### 2. executor real-execution baseline（`--with-query`）

- [x] creds located: `maxc` CLI 0.4.8 (~/Library/Python/3.13/bin/maxc) + `~/.maxc/config_ieu_cdm.yaml` (project=ieu_cdm, K11's project per maxc-sidecar.mjs 'all 5 scopes live in ieu_cdm') + real sidecar `maxc-sidecar-k11.mjs` (default standin-sidecar.mjs is a MOCK: 'owns no real ODPS connection'). MUST set MAXC_CONFIG + --sidecar.：`ODPS_ACCESS_ID`/`ODPS_ACCESS_KEY`/`ODPS_PROJECT`/`ODPS_ENDPOINT` env，或 `~/.maxc/config_*.yaml` + sidecar（见 `context.ts:boot()` `withQuery` 分支 + `MaxComputeQueryEngine`）。
- [ ] **NOT RUN** — sidecar boot bug FIXED (context.ts EnvCredentialProvider duplicate removed, verified --with-query boots + smoke real-exec query_result=[[26770]]), BUT full run not viable on k11-v2 (see 2.3).（real `execution_match`：SQL 真执行 + 结果比对，非 judge-only）。
- [ ] **NOT VIABLE on k11-v2** — k11-v2 expected result_values are judge-only semantic targets (NOT real-exec-derived; no expected.sql; k11v2_001's 1.5M unachievable by any reasonable SQL — SUM on covered table com_pay_order_df=13.6B, pay_order_di=26770, acc_summary_df=null, COUNT=2.97M, AVG=4571; no clean unit conversion). A full real-exec run would score ~0% (expected unachievable), NOT the ticket's 'judge false-pass rate'. SQL probes sufficient; ~3h full run NOT executed. Needs a real-exec-derived case set (RBI eval eval_10000251_* has one).（Original/Alias/Voice EXEC/Voice DELIVERY）real-execution pass_rate；对比 judge-only 52.4%（real-exec 应 ≤ judge-only，因 judge 可能放过执行错的 SQL——差距 = judge 放过率）。

### 3. 记录

- [x] appended (2026-09-04 entry: uniform clean 61.9% + Phase 2 viability finding, both with config).（两个 baseline：uniform clean conc=4 + executor real-exec，都带 `config` 字段）。
- [x] updated (CURRENT->clean 61.9%, per-category w/ prior in parens, Quality Targets, 2026-09-04 note w/ Phase-2-not-viable caveat, MAXC_CONFIG+sidecar env row, --with-query desc, reproduce line). baseline 表（加两个新行，带 `config` 字段；标注 real-exec ≤ judge-only 的 caveat）。

## 成功标准

1. 单一 uniform clean conc=4 pass^k artifact（自带 `config`，0 污染），数字与 hybrid 52.4% 在 MDE 内一致。
2. executor real-execution baseline（real `execution_match`），对比 judge-only 揭示 judge 放过率。
3. 两 baseline 都自带 `config` 字段（item 4 防复发生效——污染/协议可从 artifact 检出）。

## 备注

- pass^k per-case concurrency-无关 → conc=4（或 3）verdict 合法可比。
- 两个 baseline 是**不同维度**（uniform-clean 替换 hybrid；executor 替换 judge-only）——不冲突，可同 session 跑（但都长跑，~4h 量级）。
- [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4 token usage（LLM-stream interceptor）仍 open，本票不涉及。


---

## Resolution (2026-09-04, GA-EVAL-CLEAN-RERUN)

### Phase 1 — uniform clean conc=3 pass^k baseline: DONE ✅

- **Result: 61.9% (104/168)**, single artifact `rebaseline-passk-168-clean.json` with `config` (verdict_semantics='pass^k', today='20260903', with_query=false, concurrency=3 + 8 more fields). **Replaces the 52.4% hybrid merge** as the clean single-artifact baseline.
- Per-category: Original 54/80=67.5% / Alias 20/40=50.0% / Voice EXEC 19/30=63.3% / Voice DELIVERY 11/18=61.1%.
- **0 AGA-burst contamination**: 3 scattered empty attempts (3/504=0.6%, 3 distinct cases, NOT clustered) = normal AGA flakiness, not the prior 63/168 burst. Single clean artifact, no merge/rerun.
- **vs prior 52.4%: +9.5pp** (within n=168 two-sample MDE ~10.5pp, NOT significant). Positive shift across all 4 categories → likely model non-determinism (pass^k noise) + conc=3 cleaner AGA than the prior conc=4-under-load merge. CONSISTENT per the ticket's "within MDE" criterion.

**Deviations from the ticket command (all justified)**: (1) `bin/eval.ts` → `src/bin.ts` (bin/eval.ts deleted, staged move to src/bin.ts); (2) `--concurrency 4` → `3` (user-chosen via AskUserQuestion: machine load ~5 even after stopping dsh web, dominated by an unkillable AliEntSafe scan ~62% CPU; README "prefer 2-3" + prior conc=4-under-load contamination → conc=3; pass^k per-case concurrency-independent → verdict comparable); (3) added `--today 20260903` (prior run used system date 9/3=20260903; now 9/4 → without --today, dates shift 1 day → not comparable; pinned to replicate prior protocol; config.today records this); (4) **build skipped** — the ticket's "must pnpm build" premise was overcautious + its verify was wrong (lib already had the item-4 spread; see checklist 0.1).

### Phase 2 — executor real-exec (`--with-query`): RE-SCOPED (not viable on k11-v2)

- **Bug found + fixed (code change to committed context.ts, committed this session)**: `--with-query` boot CRASHED. context.ts:476 (credentials seam, step 1b) mounts `LocalCredentialProvider` (static name='credentials'); the withQuery branch (context.ts:506) ALSO mounted `EnvCredentialProvider` (same name='credentials') → cordis threw `service "credentials" has been registered at <credentials>` → --with-query broken. **Regression from the credentials-seam landing** (the withQuery branch wasn't updated to drop the now-redundant duplicate). The failure was silent because bin.ts's catch printed only `err.message`, which == the cordis throw text (looked like a normal log line). **Fix**: removed the EnvCredentialProvider class + `CredentialProvider` import + `ctx.plugin(EnvCredentialProvider)` mount from context.ts:489-506 (in credMode 'sidecar-self' the maxc sidecar self-auths from its own config — `set_credentials` is a no-op — so no creds pushed; `ctx.credentials` from the seam satisfies MaxComputeQueryEngine's `static inject=['credentials']`, unused in sidecar-self). Verified: --with-query boot now reaches "Query engine mounted (sidecar ready)" + real execution (smoke k11v2_001: `query_result=[[26770]]`, `config.with_query=true`). **Committed this session (GA-EVAL-CLEAN-RERUN)** (it's a real bug: --with-query was broken for ALL uses, not just k11-v2).
- **Real-exec path WORKS**: `maxc` CLI 0.4.8 + `~/.maxc/config_ieu_cdm.yaml` (ieu_cdm) + `maxc-sidecar-k11.mjs` (real, spawns `maxc` binary) → real ODPS via ieu_cdm. (The DEFAULT `standin-sidecar.mjs` is a MOCK — "owns no real ODPS connection" — must use `--sidecar maxc-sidecar-k11.mjs`. MUST set `MAXC_CONFIG` explicitly or it defaults to `~/.maxc/config.yaml` = overseas hdyl_data_sg_dev, wrong project.)
- **BUT k11-v2 expected values are NOT real-exec-derived** → full Phase 2 baseline NOT meaningful. Evidence (k11v2_001, expected `total_pay_amt=1500000`, covered_assets=`dws_10000251_com_pay_order_df`): `SUM(pay_amt) FROM com_pay_order_df WHERE ds=...` = 13.6B for all probed ds (20260902/20260805/20260831/20260901/20260830); alternatives `SUM(pay_amt) pay_order_di`=26770, `acc_summary_df pay_amt_std`=null, `COUNT(*)`=2.97M, `AVG(pay_amt)`=4571 — NONE = 1.5M, no clean unit conversion (ratio ~9069x). k11-v2 case yamls have NO `expected.sql` field (only `result_value`) — vs the RBI eval (`eval_10000251_037`, `maxc-smoke.mjs`) which HAS expected SQL + real-exec match (dau=4336, anchor 20260806). → k11-v2 is a JUDGE-ONLY eval (expected values are semantic targets/placeholders, not real-exec-derived). A full `--with-query` run would score ~0% (expected unachievable by any reasonable SQL) — NOT the ticket's intended "judge false-pass rate" (real-exec ≤ judge-only; gap = judge leniency). **SQL probes are sufficient evidence; the full ~3h run was NOT executed.**
- **Recommendation**: re-scope Phase 2 to a real-exec-derived case set (the RBI eval `eval_10000251_*` has `expected.sql` + real-exec-derivable values), OR add real-exec-derived `expected.sql` to k11-v2.

### 成功标准 status

1. ✅ Single uniform clean conc=3 pass^k artifact (config, 0 burst), 61.9% within MDE of 52.4%.
2. ❌ Executor real-exec baseline — NOT viable on k11-v2 (expected not real-exec-derived); sidecar bug fixed + real-exec path verified (smoke), but no meaningful baseline number (needs a real-exec-derived case set).
3. ✅ Both artifacts carry the `config` field (uniform-clean + exec-smoke: 12 fields, verdict_semantics='pass^k', with_query distinguishes them) — item 4 anti-recurrence LIVE.

### Carried forward

- **context.ts fix** (EnvCredentialProvider duplicate removed, line 488-506) — committed this session (GA-EVAL-CLEAN-RERUN).
- **Phase 2 on a real-exec-derived case set** (RBI eval `eval_10000251_*`) — next step if the executor baseline is still wanted.
- [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4 token usage (LLM-stream interceptor) — still open, not addressed here.
