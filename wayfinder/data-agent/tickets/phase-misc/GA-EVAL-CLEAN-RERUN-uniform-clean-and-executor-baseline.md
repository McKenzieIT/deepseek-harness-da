# GA-EVAL-CLEAN-RERUN — 单次 uniform clean conc=4 pass^k 基线 + executor real-execution baseline

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
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

- [ ] `pnpm build`（或 `pnpm --filter @deepseek-ai/dsh-eval-runner build`）—— **live eval 前必做**。`packages/eval/eval-runner` 的 `exports` → `lib/index.js`（gitignored + stale，item 4 源码改后未 rebuild）；unit spec 走 `src/` 故全过，但 live CLI 走 `lib/` → 不 rebuild 则 `config` 字段不 stamp。verify：`grep -c 'verdict_semantics' packages/eval/eval-runner/lib/index.js` > 0。
- [ ] 确保机器空载（暂停 `pnpm dsh web` PID 21923 / 减轻 IDE）—— 避免 AGA empty-burst（教训见 [audit-log 2026-09-03](../../research/experiment-audit-log.md)）。或用 `--concurrency 3`（若 conc=4 re-degrade）。conc=1 不可行（~16h）。
- [ ] 用 nohup orphan + 频繁 poll（防 bg shell 回收；first-poll ~90s 确认 0 no-content = AGA 未退化）。

### 1. 单次 uniform clean conc=4 pass^k 168-case

- [ ] `node --import tsx/esm packages/eval/eval-cli/bin/eval.ts --cases packages/eval/eval/cases/k11-v2 --output packages/eval/eval-cli/eval-results/ --pass-k 3 --concurrency 4 --provider aga --model qwen3.7-max --skip-health-gate --run-id rebaseline-passk-168-clean`
- [ ] 全程 0 no-content（AGA 不退化）→ 单一干净 artifact `rebaseline-passk-168-clean.json`（自带 `config` 字段——verify `config.verdict_semantics === 'pass^k'`）
- [ ] 与 hybrid merge 52.4% 对比（应在 n=168 MDE ≈5.4-10.1pp 内一致；若显著偏离，investigate）

### 2. executor real-execution baseline（`--with-query`）

- [ ] MaxCompute creds：`ODPS_ACCESS_ID`/`ODPS_ACCESS_KEY`/`ODPS_PROJECT`/`ODPS_ENDPOINT` env，或 `~/.maxc/config_*.yaml` + sidecar（见 `context.ts:boot()` `withQuery` 分支 + `MaxComputeQueryEngine`）。
- [ ] `... --with-query --run-id rebaseline-passk-168-exec`（real `execution_match`：SQL 真执行 + 结果比对，非 judge-only）。
- [ ] 记录 per-category（Original/Alias/Voice EXEC/Voice DELIVERY）real-execution pass_rate；对比 judge-only 52.4%（real-exec 应 ≤ judge-only，因 judge 可能放过执行错的 SQL——差距 = judge 放过率）。

### 3. 记录

- [ ] append `experiment-audit-log.md`（两个 baseline：uniform clean conc=4 + executor real-exec，都带 `config` 字段）。
- [ ] 更新 `eval-cli/README.md` baseline 表（加两个新行，带 `config` 字段；标注 real-exec ≤ judge-only 的 caveat）。

## 成功标准

1. 单一 uniform clean conc=4 pass^k artifact（自带 `config`，0 污染），数字与 hybrid 52.4% 在 MDE 内一致。
2. executor real-execution baseline（real `execution_match`），对比 judge-only 揭示 judge 放过率。
3. 两 baseline 都自带 `config` 字段（item 4 防复发生效——污染/协议可从 artifact 检出）。

## 备注

- pass^k per-case concurrency-无关 → conc=4（或 3）verdict 合法可比。
- 两个 baseline 是**不同维度**（uniform-clean 替换 hybrid；executor 替换 judge-only）——不冲突，可同 session 跑（但都长跑，~4h 量级）。
- [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) item 4 token usage（LLM-stream interceptor）仍 open，本票不涉及。
