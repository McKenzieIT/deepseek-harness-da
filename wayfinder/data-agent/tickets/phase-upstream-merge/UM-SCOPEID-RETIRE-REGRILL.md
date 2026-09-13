# UM-SCOPEID-RETIRE-REGRILL — regrilling: 拆自 UM-QODER §B（前提证伪）

**Type**: grilling
**Phase**: upstream-merge
**Status**: resolved (2026-09-13 keep-with-waiver — 2 doc type-equiv block edits; see [Resolution](#2026-09-13-resolution--keep-with-waiver-via-2-doc-type-equiv-block-edits) below. Originally 2026-09-13 spawned from [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md) §B.)
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

---

### [2026-09-13] Resolution — keep-with-waiver via 2 doc type-equiv block edits

**Applied (commit `7eb3046101`, PR #125 merged `8ace277bce`):** keep-with-waiver — the fork-additive `scopeId?: string` seam is adopted into the two upstream-owning doc type-equiv blocks so `verify-type-equiv` turns GREEN. **Zero source-code change; zero tsc/test impact.**

1. `docs/subsystems/tools.md` — inserted `readonly scopeId?: string` + its full source JSDoc into the `ToolExecutionInput` type-equiv block (fence at line 179), between `agent?: Agent` and `parent?: ToolExecutionToken`. Sibling `docs/subsystems/tools.zh.md` mirrored byte-identically.
2. `docs/subsystems/core.md` — inserted `scopeId?: string` + its full source JSDoc into the `AgentOptions` type-equiv block (fence at line 195), after `maxTokens?: number`. Sibling `docs/subsystems/core.zh.md` mirrored byte-identically.

`scripts/type-equiv.manifest.json` needed no change (both symbols `ToolExecutionInput`@~811 + `AgentOptions`@~1961 already mapped to their sources).

**Why keep, not retire (research `scopeid.json`, high-confidence):** the ticket's original UM-QODER premise ("scopeId is a write-never dead field") is falsified and UNDER-stated. The field has 3 writers + 9 live code readers across 5 data-tool packages, one of which (`tool-trigger-eval`) is a HARD fail-closed dependency (`if (exec.scopeId === undefined) return not_configured` → `runBatch({scopeId: exec.scopeId})` where `EvalRunnerService` throws 'explicit scopeId required'). `ToolExecutionInput.scopeId` / `AgentOptions.scopeId` thread GA-GT1 Phase-5b per-tenant linker isolation (the `getEnrichedLinker` root-check closing #19/#22 cross-tenant leak). Retire = product-capability regression + 13 tsc break sites + the tenant-leak #19 regression.

**Mechanism note:** the "keep-with-waiver" label is a misnomer — `verify-type-equiv.ts` does NOT read `upstream-sync.json` (that file's waivers only hold UM-MERGE-INTEGRITY keep-fork/drop-fork/revert-fork path decisions). The keep path = adopt-the-doc-blocks-to-source. The 2 DRIFT were tracked purely as type-equivalence known-red, not a registered waiver.

**Retire cost (for the record, NOT taken):** ~13 tsc break sites (6→13 corrected from ticket's estimate), tenant-leak #19 regression HIGH, generator regen cascade ≈ 0 (the ticket's "~5 generator regen" figure was inherited from the UM-QODER costs half and does NOT apply to scopeId-core-field retirement — verified none of the 5 predicted generators regenerate the 2 retired fields).

**Acceptance verification:**
- `npx tsx scripts/verify-type-equiv.ts` → **412 type-equiv block(s) match source structure and JSDoc (1:1 with manifest); 412 paired derivative(s)** (was 2 DRIFT).
- Pre-commit lefthook (whitespace + lint + vendor manifest) green.

**Open question (recorded, not blocking):** meta-gate coverage — whether a permanently-adopted-to-source doc block for a fork-additive core field is the sanctioned gate policy (UM-C-GATES/UM15 §2 territory). The keep path is self-consistent with the fork's existing "fork self-owned code refactor as needed" principle and the same pattern used elsewhere; the §2 `knownRed[]` schema extension (deferred, UM15 decision-doc) would structurally track this if desired.

Refs: research `wayfinder/data-agent/research/next-session-2026-09-14/scopeid.json`; session plan `wayfinder/data-agent/prompts/next-session-2026-09-14-parallel-7-tickets.md`; map.md session-2 snapshot.
