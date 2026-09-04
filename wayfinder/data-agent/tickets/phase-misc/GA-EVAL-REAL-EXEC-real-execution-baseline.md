# GA-EVAL-REAL-EXEC — executor real-exec baseline on a real-exec-derived case set

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
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

- [ ] 定位 RBI eval case 目录（`eval_10000251_*` case 文件在哪？规模多少？）+ 确认每个 case 有 `expected.sql`（不止 `result_value`）。
- [ ] 用 maxc-smoke 模式 spot-check 1-2 个 case 的 expected.sql 真执行是否 = expected.result_value（确认 real-exec-derivable + 数据未变）。
- [ ] 备选：若 RBI eval 规模太小或不适合，给 k11-v2 加 real-exec-derived `expected.sql`（跑正确 SQL 派生 expected 值——工作量大，需逐 case 确定正确 SQL，优先 RBI eval）。

### 2. 跑 executor real-exec baseline

- [ ] 先跑 judge-only baseline（同 case set，`--with-query` off）作对比基准（若该 case set 还无 judge-only baseline）。
- [ ] `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml node --import tsx/esm packages/eval/eval-cli/src/bin.ts --cases <rbi-case-dir> --output packages/eval/eval-cli/eval-results/ --pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today <rbi-anchor-20260806?> --with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs --run-id rebaseline-real-exec-<set>`
- [ ] nohup+disown + 频繁 poll（first-poll ~90s 确认 sidecar mount + 0 no-content；每 ~5min truly-empty + real `query_result` 非 null 检查）。
- [ ] 全程 0 no-content + real `query_result`（非 null）+ `config.with_query=true` + `config.verdict_semantics='pass^k'`。

### 3. 对比 + record

- [ ] per-category real-exec pass_rate；对比 judge-only（同 case set）。real-exec ≤ judge-only；**差距 = judge 放过率**（judge 语义放过但真执行值错的 SQL 占比）。
- [ ] append `experiment-audit-log.md`（real-exec baseline + judge 放过率，带 config）。
- [ ] 更新 `eval-cli/README.md` baseline 表（加 real-exec 行，标注 real-exec ≤ judge-only caveat；注意 case set 不同不能直接和 k11-v2 61.9% 比，需同 case set 的 judge-only 对比）。
- [ ] 本票 checklist + Resolution；map.md frontier。

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
