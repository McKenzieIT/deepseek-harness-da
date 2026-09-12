# UM-SCOPEID-RETIRE-REGRILL — regrilling: 拆自 UM-QODER §B（前提证伪）

**Type**: grilling
**Phase**: upstream-merge
**Status**: open (2026-09-13 从 [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md) §B 拆出)
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: `verify-type-equiv` 的 2 条 scopeId DRIFT 消失（`docs/subsystems/tools.md:179` ToolExecutionInput.scopeId + `docs/subsystems/core.md:195` AgentOptions.scopeId）；本票完成前作 known-red
**Related**: [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md) 2026-09-11 复核节 + 2026-09-13 §B spawn

## Question

`SubagentResult.scopeId` / `AgentOptions.scopeId` / `ToolExecutionInput.scopeId` 是 fork 加在 upstream core 上的字段。原 UM-QODER 票的框架把它们连同 costs 一起归入「write-never dead 字段，删了 restore upstream 原貌」。2026-09-11 在 resync `5fe9b32e44` 逐处核实**该前提证伪**：

- **3 个 writer**：`packages/core/agent-loop/src/tool-calls.ts:83`、`packages/core/tools/src/ptc.ts:476`、`packages/core/tools/src/index.ts:1393`
- **6 处 live reader（是代码，不是注释）**：
  - `packages/data/tool-retrieve/src/index.ts:327` `getEnrichedLinker(schema, exec.scopeId)`
  - `packages/data/tool-search-data-sources/src/index.ts:727` `probeRelationGraph(ctx, exec.scopeId)`、`:750` `getEnrichedLinker(schema, exec.scopeId)`、`:731`/`:751`/`:755` `applyGraphExpansionAndJoins(…, exec.scopeId)`
- **4 个专门的 scopeId 测试**：`packages/core/agent-loop/tests/tool-calls.spec.ts:771-813`（2 个 `it`）+ `packages/core/tools/tests/ptc.spec.ts:1880-1931`（2 个 `it`）

删 `ToolExecutionInput.scopeId` 会**破 tsc**（6 处 live reader），并且**会移除 fork 的 GA-GT1 Phase-5b per-tenant linker 隔离**（相邻注释直指 tenant-leak「#19」）。这是产品能力回退，不是清理死码。

## Scope（拟）

- 决策：keep scopeId 作为 fork additive-only 分歧（登记 `upstream-sync.json` waiver + type-equiv known-red 保持）/ retire scopeId + 重构 per-tenant linker 隔离到另一 seam / 其他方案
- 若 retire：3 writer + 6 reader + 4 test 的迁移路径 + 5-generator regen cascade（`api-cordis-catalog`/`config-catalog`/`doc-graphs`/`module-graph`/`architecture-graph`）
- 若 keep：`verify-type-equiv` 的 2 条 scopeId DRIFT 作 permanent known-red，登记 waiver

## Estimated

- Grilling: ~1 session（需要 GA-GT1 Phase-5b 上下文 + tenant-leak #19 的历史决策访谈）
- Apply（若 retire 决策）: ~1-2 sessions

## Related tickets

- UM-QODER-SUBAGENT-RETIRE — §A 的 costs 半已 resolved（2026-09-13），此票承接 §B
- UM12 (type-equiv 门归属)
- UM-C-GATES + UM15 §2（若 keep-with-waiver，进 meta-gate 讨论）
