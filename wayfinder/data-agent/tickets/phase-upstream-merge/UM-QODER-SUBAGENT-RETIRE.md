# UM-QODER-SUBAGENT-RETIRE — 退掉 Qoder-as-subagent 能力 + 删 SubagentCosts（解 type-equiv costs DRIFT + 恢复 additive-only）

**Type**: task
**Phase**: upstream-merge
**Status**: open (2026-09-15 拆出，用户决策 d1：本 session 不动，单开票)
**Assignee**: unclaimed
**Blocked by**: UM11（PR merge 后再做，避免与 PR-blocker 扫除混 scope）
**Blocks**: 无（type-equiv 的 costs DRIFT 在本票完成前作 known-red）
**Related**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md)（type-equiv costs DRIFT 的归因票）、[UM11](UM11-pr-merge-post-cleanup.md)

## Question

退掉「Qoder 作为 harness subagent 接入」这个能力，并随之删除 `SubagentCosts` 类型 + `SubagentResult.costs` 字段 + audit 的 G3 Credits 对账 feed + admin 给 qoder 的 export + bundle 的注释挂载行。本票是产品退场，不是 merge 回归修补——拆出来单独走，不塞进 UM12 PR-blocker 提交。

## 背景：为什么是这张票

type-equiv 门 3 条 DRIFT 之一是 `SubagentResult.costs`（源码有 costs、upstream doc 没有）。实测确证：
- `SubagentCosts` + `SubagentResult.costs` 是 **fork 加在 upstream 包 `packages/subagent/subagent/src/types.ts` 上的字段**（upstream `d347e70390`/`c389f96bf3`/`upstream/master` 三个基点 `SubagentResult` 全无 costs）→ **additive-only 违反**。
- `costs` 的唯一生产者是 `packages/subagent/subagent-qoder/src/run.ts` 的 `qoderCosts()`（G3 Qoder Credits 对账）。`tool-subagent/src/index.ts:201` 的 `costs?` 只是把它转出来。
- 即 Qoder subagent 一退，`costs` 变 write-never → 可直接删（恢复 upstream `SubagentResult` 原貌，doc 天然对齐，**type-equiv 这条 DRIFT 自动消失，不需 augmentation hack**）。

用户 2026-09-15 决策：Qoder-as-subagent「实际可以不要了」→ 退场比 augmentation（保留 Qoder、costs 挂 fork 侧）更优。退场单开票（d1），本 session 把 type-equiv costs 标 known-red（注明待本票清除），PR 不被它卡。

## Scope（实测耦合，非 lib/doc）

### A. 退 Qoder + 删 costs（6 处）
1. **删 `packages/subagent/subagent-qoder/`**（整个包，`src/` ~487 行：`run.ts` 的 `qoderCosts()` 是 costs 唯一生产者）。
2. **`packages/subagent/subagent/src/types.ts`**：删 `SubagentCosts` 接口（`:280`）+ `SubagentResult.costs` 字段 + JSDoc（`:333-335`）→ 恢复 upstream 原貌。删 `src/index.ts:89` 的 `SubagentCosts` re-export。
3. **`packages/subagent/tool-subagent/src/index.ts:201`**：删 `readonly costs?: SubagentCosts`（+ `:25` 的 import）。
4. **`packages/data/audit/`**：删 `extractCosts` + `extra.credits = costs`（`src/index.ts:199,214-215,315-317,323`）+ `qoder_call`/`QODER_CALL` audit tag（`src/schema.ts:45,96,102`）+ 对应 spec（`tests/audit.spec.ts`）。这是 G3 Credits 对账 feed，Qoder 退了成孤儿。
5. **`packages/data/admin/src/index.ts:538`**：清给 qoder 的 export（`P3/subagent-qoder` 注释 + 相关 API）。
6. **`packages/bundle/data-agent/`**：清 `cordis.patch.yml` 的注释挂载行（`:224,227-228`）+ `README.md` 的 `subagent-qoder` 提及（`:5,11,19`）。

### B. 搭车删 scopeId×2（同一 regen pass，免二次级联）
本票删 `SubagentResult.costs`（upstream 接口字段）会触发 3-generator regen cascade（`api-cordis-catalog`/`config-catalog`/`doc-graphs` stale，doc-graphs 有 zh gap → 并入 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) zh 实现一起处理）。既然级联躲不掉，把 type-equiv 另两条 DRIFT 的 `scopeId` 删除搭进同一 pass，一次级联解全部 3 条 DRIFT、type-equiv 全绿。scopeId 是 write-never 死字段（upstream 零 scopeId 确证，全仓无 setter，dormant reader 仅 TODO 注释），删它无产品影响、恢复 upstream `AgentOptions`/`ToolExecutionInput` 原貌：

7. **`packages/core/agent/src/runtime-types.ts`**：删 `AgentOptions.scopeId` 字段 + JSDoc（恢复 upstream）。
8. **`packages/core/tools/src/index.ts`**：删 `ToolExecutionInput.scopeId` 字段 + JSDoc（恢复 upstream）+ 删 `:1393` 的 `...exec.scopeId` spread（`base` = ToolExecution 构造）。
9. **`packages/core/tools/src/ptc.ts:476`**：删 `...exec.scopeId !== undefined ? { scopeId: exec.scopeId } : {}` spread。
10. **`packages/core/agent-loop/src/tool-calls.ts`**：删 scopeId 注释（`:71-74`）+ `...agent.options.scopeId` spread（`:83`）。
11. （可选）`packages/data/tool-retrieve/src/index.ts` + `tool-search-data-sources/src/index.ts`：清 JSDoc 里对 `exec.scopeId`/`AgentOptions.scopeId` 的 stale 提及（TODO 注释，非代码，不破 tsc；做掉则文档诚实）。

⚠ 耦合点 4（audit schema 删 tag）是行为变化，须 tsc + audit spec 验。耦合点 2/7/8 删 upstream 包字段 → 同一 regen pass 处理 3 generator 门，验 type-equiv 翻绿 + 3 generator 门不新增红 + translation-pairing 不恶化。

## Acceptance

- `grep -rn 'SubagentCosts\|\.costs\b\|subagent-qoder\|qoder_call\|QODER_CALL' packages/ apps/ scripts/`（排除 lib/、.zh.md、node_modules）返回 0。
- `verify-type-equiv` 的 `SubagentResult` DRIFT 消失（源码恢复 upstream 原貌 = doc 对齐）。
- `pnpm run build:official` GREEN；tsc 0 错；audit spec 绿。
- `check:ci:static` 不新增失败（regen 后 cordis-catalog / config-catalog / doc-graphs 仍绿；translation-pairing 不恶化——若 doc-graphs regen 触 zh gap，并入 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 的 zh 实现一起处理）。

## Notes

- 本票与 [UM-UI-SETTINGS-MODELS-RE-PORT](UM-UI-SETTINGS-MODELS-RE-PORT.md) 同类（都是 fork 加在 upstream 上的 drift），但方向相反：那张是 re-port 真特性 merge，本张是退掉不要的特性。
- 不阻塞 UM11 PR（type-equiv costs 作 known-red 进 PR 的 known-red 清单）。
- 退 Qoder 后，`packages/subagent/` 下仍留 `subagent-claude-code`/`subagent-codex`/`subagent-acp`/`subagent-dsh-sdk`/`subagent-in-process-driver` 等其它 provider——本票只退 qoder 那一个。

### [2026-09-11 复核] ⚠ 本票 scopeId 半的核心前提**被证伪**——落地前必须重新拍板

本票 Scope 写 `scopeId` 是「**write-never 死字段**（upstream 零 scopeId 确证，全仓无 setter，dormant reader 仅 TODO 注释），删它无产品影响」，并把 item 11 的 `tool-retrieve`/`tool-search-data-sources` 提及标为「（可选）stale 提及（TODO 注释，非代码，不破 tsc）」。**这两条都不成立**（2026-09-11 在 resync `5fe9b32e44` 逐处核实）：

- **有 3 个 writer**：`core/agent-loop/src/tool-calls.ts:83`、`core/tools/src/ptc.ts:476`、`core/tools/src/index.ts:1393`。
- **有 6 处 live reader（是代码，不是注释）**：`data/tool-retrieve/src/index.ts:327` `getEnrichedLinker(schema, exec.scopeId)`；`data/tool-search-data-sources/src/index.ts:727` `probeRelationGraph(ctx, exec.scopeId)`、`:750` `getEnrichedLinker(schema, exec.scopeId)`、`:731`/`:751`/`:755` `applyGraphExpansionAndJoins(…, exec.scopeId)`。
- 删 `ToolExecutionInput.scopeId` **会破 tsc**，并且**会移除 fork 的 GA-GT1 Phase-5b per-tenant linker 隔离**——相邻注释直指 tenant-leak「#19」。这是产品能力回退，不是清理死码。
- 另有 **4 个专门的 scopeId 测试**未列入 Scope：`core/agent-loop/tests/tool-calls.spec.ts:771-813`（2 个 `it`）、`core/tools/tests/ptc.spec.ts:1880-1931`（2 个 `it`）。

**建议：把 scopeId 半拆成独立票并重新 grilling。** 原来「搭车 Qoder 退场免二次级联」的理由已不成立——单 `costs` 就会触发同样的 generator 级联，所以拆开不多付代价，却避免在一张 task 票里悄悄做掉一个产品决策。

### [2026-09-11 复核] 其余 Scope 缺口与已解除的阻塞

- **两个阻塞都已死**：① `Blocked by: UM11（PR merge 后再做）` → PR #115 已 merged（`origin/master` = `607868e6a0`）；② translation-zh 前置 → zh emission 已于 2026-09-11 落 resync `4d4f725748`，`verify-doc-graphs` 6 docs 绿。**但本票 Scope §B 与 Acceptance 两处仍写着 zh 依赖**，需删。
- **Scope 漏项**：`data/audit/src/store.ts:572`（按 `TAG.QODER_CALL` 汇总 cost/credits 的 SQL）+ `:629`（`correctedStats` 分支）；`tool-subagent/src/index.ts:223` 第三处 costs 站点。
- **实际足迹是 38 个文件**（Scope 未列全）：含 `data/audit/README.{md,zh.md}`、`identity/identity/src/index.ts` + README 双语、`data/phase-gate/src/domain.ts`、`credentials-keychain{,-host}/tests/*.spec.ts`、以及 12 个 `docs/` 文件（含 `da-architecture`/`da-plugin-development-guidelines`/`subsystems/data-agent`/`da-upstream-debt` 的手写双语对）→ **真实 translation-pairing 暴露面**。
- **regen 级联是 5 个 generator 不是 3**：除 `api-cordis-catalog`/`config-catalog`/`doc-graphs`，还有 `docs/module-graph.{md,zh.md}` 与 `docs/architecture-graph.md`；另 `extensions/tool-cordis/src/api-catalog.ts:6422-6423`/`:6463` 存 `SubagentCosts`、`:565` 存 `qoder_call` 描述。
- `verify-type-equiv` 实测恰好 3 条 DRIFT，与本票所列一致：`docs/subsystems/tools.md:179`（`ToolExecutionInput.scopeId`）、`docs/subsystems/subagent.md:290`（`SubagentResult.costs`）、`docs/subsystems/core.md:195`（`AgentOptions.scopeId`）。
- **估算**：Qoder+costs 半（已拍板、AFK）~1 session；scopeId 半（需重新拍板 + 改 live 代码 + 5-generator regen + 双语文档扫）~1-2 session。
