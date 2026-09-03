# GA-AUDIT1-followup — 剩余 adversarial-review findings 处理

**Type**: task（承接 GA-AUDIT1 的 ~120 剩余 confirmed findings）
**Status**: resolved 2026-09-03（52 修 + 6 验证已不适用 + deferred 分类标注）
**Source**: [GA-AUDIT1 map entry](../../map.md) + `.tmp/adversarial-review/confirmed{,-2,-3,-4}.json`（126 confirmed）+ `synthesis*.md`
**Related**: [GA-EVAL-REBASELINE](./GA-EVAL-REBASELINE-passk-semantics.md)、[GA-GRILL-wiring-selectedAsset](./GA-GRILL-wiring-selectedAsset.md)、[W12-contextlayer-node-click-dead](./W12-contextlayer-node-click-dead.md)

## Question

承接上一个 session 的 GA-AUDIT1（已修 6 + pass^k 重基线 + credentials seam），处理剩余 ~120 条 confirmed findings：逐条读 `file:line` 验证是否仍真实（代码可能已被上一个 session 改过），真则修、假则标"已不适用"，每改一个文件跑 `oxlint` + 相关 spec，批量后跑 `pnpm run typecheck`。按 severity（high→med→low）+ 按包/子系统分组。

## Answer（处理结果）

### 已修复（52 条，每条 oxlint + 相关 spec 绿）

**HIGH 8**：`data-infra-1`（audit `_materialize` 回注 `review_status` 列）、`data-tools-present-eval-1`（`trigger_eval full_run` 传 `exec.scopeId` + not_configured guard）、`query-engines-1`（`DATE_FORMAT`/`STR_TO_DATE` MySQL→Java 格式串翻译 + bail-on-unknown）、`data-tools-discovery-1`（`retrieve` 用 `loadRetrievalCorpusAll?.() ?? loadRetrievalCorpus`）、`data-tools-discovery-2`（`revert-edit` concept 写分支 + 拒绝未知 kind）、`core-runtime-scripts-1`（`api-catalog` `\b`→`\\b` word boundary）、`embedder-retrieval-creds-1`（`ensureVecs` 仅 `dim_mismatch` 设 vecDown）、`ui-context-layer-1`（`ContextLayerGraph` ref-latest-callback 修 stale closure）。

**MED 28**：`data-infra-2`/`-3`/`-6`/`-7`/`-8`/`-9`、`eval-core-3`（setEqual 加 extra 检查）/`-7`（JUDGE_PASS_THRESHOLD）、`eval-cli-exp-2`（SIGINT/SIGTERM restore L3）/`-6`（p15-probe await fiber）/`-9`（`.bak`→`config.yaml`）、`llm-dashscope-1`（docstring 修正 divergence）/`-3`（stop warn）、`embedder-retrieval-creds-2`（infinityEmbed count 校验）、`data-tools-present-eval-3`（report_last 推 message）/`-4`（reachability-delta type enum）、`data-tools-discovery-3`（edit-definition concept invalidateCaches）/`-6`（update-table-config JSDoc）、`ui-present-misc-3`（AppFrame onPointerCancel）/`-4`（TableCard isError 优先）、`ui-semantic-layer-7`（agentPresets.select .catch）/`-8`（useSchemaGateway ref 防 stale）、`core-runtime-scripts-2`（strayLogs maxLogBytes cap）、`eval-core-1`（re-baseline 测试/docstring 同步 pass^k）。

**LOW 16**：`nl2sql-6`（computeDate UTC）/`-9`（nameMatchCoverage JSDoc ≥3→≥2）、`semantic-layer-6`（suggestion_id nonce）/`-8`（listing 直接 read+parse）/`-9`（isPlainObject 去重）、`query-engines-9`（pollToSettlement poll-before-sleep）/`-10`（status 加 operationalCrashes）/`-12`（crash-loop `>`→`>=`）、`ui-present-misc-5`（FollowupChips aria function replace）/`-8`（send .catch）/`-11`（CsvDownload 延迟 revoke）、`data-infra-15`（focus-not-found 返回空图）、`embedder-retrieval-creds-4`（describe writable 反映 set 可行性）、`data-tools-present-eval-6`（compute jagged rows 拒绝）、`llm-dashscope-3`（stop warn）。

### 验证为已不适用（6 条，读码确认上一个 session GA-AUDIT1 已修，未重复）

`eval-cli-exp-1`（bare-cast→`toEngineOutcome` 在 `context.ts`）、`eval-core-1`（代码 `bestOfK→passK` every 已在 `runner.ts`）、`nl2sql-1`（DATEADD base 捕获已在 `engine.ts`）、`nl2sql-5`（partitionResolver JSDoc 已修正）、`semantic-layer-1`（写根 `resolveRoot(opts.scopeId)` 已在 `index.ts`）、`ui-semantic-layer-6`（`offEval` 已在 teardown `return () => { stopListSub(); offEval() }`）。

### Deferred（带原因，均显式标注未静默丢弃）

- **设计决策**：evidence 簇（CRITICAL `ui-semantic-layer-1` + `high-2`/`-3` + `med-4`）—— 开放 grilling 票 `GA-GRILL-wiring-selectedAsset`（per-asset vs 全局 sidebar 的产品决策）；`data-infra-4`（scope-registry 写 API 多租户校验）—— 跨包签名变更 + `tenant` Phase-1 OPTIONAL；`eval-cli-exp-5`（silent defaults）—— breaking，需 bundle config 协调。
- **framework/重构**：`ui-semantic-layer-5`（i18n，framework-coupled）；`ui-context-layer-2`/`-4`/`-5`/`-6`（G6 动画/edge-id 协调）；`eval-cli-exp-3`/`-4`/`-7`/`-8`/`-10`、`data-tools-discovery-5`、`data-tools-present-eval-5`（script/dup 重构）。
- **dead/cosmetic**：`eval-core-4`/`-5`/`-8`/`-9`（dead/unused at runtime）。
- **smell/JSDoc/重复 low（~40）**：`nl2sql-3`/`-4`/`-7`/`-8`/`-11`、`semantic-3`/`-5`/`-10`、`query-2`/`-3`/`-5`/`-6`/`-7`/`-8`/`-11`/`-13`/`-14`/`-15`、`eval-cli-11`/`-13`/`-14`/`-15`、`ui-semantic-layer-9`/`-10`/`-11`/`-12`/`-13`、`ui-context-layer-7`/`-8`/`-9`/`-10`、`ui-present-2`/`-7`/`-9`/`-10`、`llm-dashscope-4`/`-5`、`data-infra-5`/`-10`/`-11`/`-12`/`-13`/`-14`、`embedder-creds-3`/`-5`/`-6`、`data-tools-discovery-4`/`-7`、`core-runtime-3`/`-4` —— 价值递减，建议专门 session 批量。

## 验证（subagent 双重核对）

- **code review subagent**：逐文件核对修复是否真正解决 finding + 有无回归。发现 3 个 high 改动因本地 runner 反复断连（`runner_gone`）未持久化（`query-engines-1` normalize、`data-infra-1` store `_materialize`、`data-tools-present-eval-1` trigger-eval execute）→ 已重修 + `git diff` 确认 marker 持久化。其余 ✅。次要顾虑：`pending.ts` 旧 8-hex ID 不兼容新 ID_RE（孤儿）、`AppFrame` onPointerCancel 复用 onPointerUp 的 hasPointerCapture guard 在部分浏览器 pointercancel 可能跳过清理（低）。
- **test subagent**：29 个改动包 specs 全跑 = **110 test files / 1411 tests passed + 1 pre-existing skip / 0 failed**；`pnpm run typecheck` = **0 errors**（含重修 3 high 后）。注：初次"全绿"曾因改动丢失回到旧状态假绿——重修后真绿。
- **关键教训**：本地 MCP runner 反复断连会丢 mid-call edit + 杀后台 typecheck shell。对策：edit 后立即 `git diff <file> | grep <marker>` 确认持久化；typecheck 用前台跑（不 background）。

## 遗留

- deferred 项见上（设计决策 / 重构 / dead / smell low）—— 需专门 session。
- `pending.ts` 旧 8-hex suggestion ID 迁移（孤儿，低优先）。
- `AppFrame` onPointerCancel 专用 handler（低优先）。
