# Next-session prompt — Follow-on 3 reframe + re-scope（2026-09-10 session 末 handoff）

**Session 起始**：2026-09-10 phase-C integration session（`prompts/next-session-2026-09-10-phase-c-integration.md`）。
**本 session 实际完成**：
- Follow-on 1 **UM-CONNECTION-FIXTURE-DEAD-APICLIENT** resolved（fixture apiproxy→Typert 适配收尾，41/41 fixture error 清；resync `63659a22d4`，master `b399e3aee8`）。
- Follow-on 2 **UM-CLIENT-CONFIG-CLEANUP** resolved（client tsc surface config D+E，4 composite refs；resync `5ee128214d`，master `502ed34714`）。
- tsc `tsconfig.client.json` **287→217**（-70；--force 权威确认）。余 217 全 adaptive 域。
- Follow-on 3 **R-DA-TYPERT-REMOTE-REGISTRATION** subagent Explore 调研 + 主 session 重验 6 条断言 → **CRITICAL reframe**（ticket 前提证伪，见 ticket `## Reframe finding`）。

## ⚠️ 关键 reframe（已验证，铁律）

Follow-on 3 ticket 假设"18 包缺 `src/remote.ts` → `ClientRemote` 缺 X → ~81 error"**与 on-disk 状态矛盾**：
- 18 包**已有生成的** `lib/typert.remote-client.d.ts`（`@deepseek-ai/dsh-typert-generator` 发），声明 `interface TypertRemoteNamespaceMap { '<ns>': ... }` augment `TypertClientRemote extends TypertRemoteNamespaceMap`（`packages/typert/protocol/src/types.ts:307`）。→ `ctx.remote.<ns>.Y()` **已 resolve**。
- `tsc -b tsconfig.client.json` `TS2307`（cannot-find-module）= **0**。35 TS2339 全 transport 层（`$dispatch`/`ConnectionHandle.api`/`ConnectionSinks.onHostEnvelope`/`agentPreset` on SessionSummary），零 `remote.<ns>` 失败。
- 67 TS2305 在 **consumer 包**（`packages/client/runtime` 47、`ui-settings-models` 9、`connection` 8、`result-cache` 3），**非 18 provider**（provider 0 TS2305）。driver = (a) **ghost transport 类型**（`IApiclient`/`MuxFrame`/`HostFrame`/`RpcReceipt`/`ClientResponse`/`SessionModels`——apiproxy 删除残留，fork src 无定义；`RpcError`→`RemoteError` 改名，`RemoteError` 在 `packages/typert/protocol/src/remote-error.ts`）；(b) **错位 view 类型**（`ToolEventView`/`SubagentAddress`/`JobView`/`DirectoryEntry`/`DirectoryListing`/`SessionMaybeProvideInfo`/`TodoItem`——存于其它包，consumer 从错 barrel import，需 barrel re-export 或修 import）。
- 故 18 包 `src/remote.ts` = **结构提取重构**（gateway 已 inline 在 `src/index.ts`，仅搬到 `src/remote.ts`），**~0 直接 error drop**。UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS 的"~122 adaptive（B/C/G 18 包 ~81）"归因**有误**。

## 217 真路径（B）= consumer 包改造

ghost 类型改用 Typert 新类型（`RemoteError` 非 `RpcError`；Typert transport 类型替 ghost）+ 错位 view 类型 barrel re-export / 修 import 路径 + transport 类型补全（`$dispatch`/`.api`/`onHostEnvelope`）。这是 UM10 typecheck-green（217→0）的**直接路径**，上游忠实（采新 Typert 类型），最利 data-agent（解锁 UM10→UM11 PR→push）。

## 开放决策（用户拍板，下一 session 首要）

- **(A)** 保 18 包结构重构（上游忠实、~0 error drop、不解 UM10；B 的前置——barrel re-export `XRemote` interface）。
- **(B)** **重 scope 到 217 真路径**（consumer ghost 重写 + barrel re-export + transport 补全）。直接解 UM10、上游忠实、最利 data-agent。**主 session 荐 B**。
- **(A-then-B)**：更全但慢。
- 若 B：按 consumer 包分片，先 **client/runtime（131 error：47 TS2305 ghost + 24 TS2339 transport + 23 TS7006 + ...）**，次 ui-settings-models(39)、connection(30)、ui-semantic-layer(7)、result-cache(4)。dispatch subagent 调研每个 ghost 类型对应的 Typert 新类型 + barrel re-export 方案。

## 环境 & 纪律（复用）

- 主仓 master（ahead origin 11：含 `b399e3aee8` + `502ed34714` + 前 9，未 push）；resync `upstream/resync-2026-09-08`（tip `5ee128214d`，含 `63659a22d4` + `5ee128214d` + 前 Phase-C merge，未 push）。
- worktree：dsh-resync（follow-on/UM10 在此跑，`PATH="/usr/local/bin:$PATH"` node 24）；其它 worktree 维持现状（不清）。
- 铁律：subagent 报告 = 未验证，主 session 重验 ≥1 关键断言才进产物（本 session 重验 Follow-on 3 reframe 6 条）。
- 提交：`[prefix]` 独立 commit；不 `--no-verify`（lefthook pre-commit oxlint/whitespace + pre-push typecheck）；resync 上 `[UM-*]`/`[Phase-C]` 前缀，master 上 `[wayfinder(um-flow)]` 前缀。
- 主 session 强制 `mcp__local__*`（built-in Read/Write/Edit/Bash/Grep/Glob 全 BLOCKED）；subagent 也须用；`mcp__local__grep` 不可靠（false zero-matches）——用 `mcp__local__bash` 的 `grep -rEl`/`rg`。
- 按 #1：dispatch subagent 省主上下文、多票推进到 70% 切 session。

## 未做（下 session 优先级）

1. **用户拍板 Follow-on 3 re-scope**（A/B/A-then-B，荐 B）。
2. 若 B：client/runtime 起步（131 error），dispatch subagent 调研 ghost→Typert 映射 + barrel re-export 方案 → 实现 → tsc 验。
3. UM10 绿（217→0 via B）后：UM11 PR（resync→master）+ UM12 GA-FORK-CI re-sweep + push（方案 D，node 24，pre-push `build:lib:host`）。
4. worktree 清理（收尾）。
5. Deferred：Phase-2（4 presenter 迁移 per Plan B ADR-0002）+ Round 2（isLatestTurn gap）；UM-CORDIS subtask 3（blocked by RootOwnerProps homing）；UM-ADAPT 剩余 shifts。
