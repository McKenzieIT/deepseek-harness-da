# R-DA-UI-PRESENTER-COMPOSITION — data-agent UI presenters vs new ui-conversation view-registry architecture

**Type**: grilling (design) · **Phase**: refactor (post-merge) · **Status**: open · **Assignee**: unclaimed · **Priority**: **HIGH**（升级自 MEDIUM——见下方 "priority 升级理由"）
**Blocked by**: [UM-ARCH](../phase-upstream-merge/UM-ARCH-architecture-diagrams-depmap.md) regen-from-synced（要看到 view-registry seam 在 synced latest 的权威结构）· [UM-ADAPT](../phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md) seam-4 manifest 集中化分析 + view-registry seam adaptive 判定
**Blocks**: [R-DA-CLIENT-RUNTIME-DECOMMISSION](R-DA-CLIENT-RUNTIME-DECOMMISSION.md) **Phase-2**（4 presenter 包迁移的注册模式决策；zombie 本体删除依赖此完成）· UM10（typecheck 全绿）· UM16（build:official 绿的一部分——4 presenter 迁完前 tsc 有残留错）
**Related**: UM14（synced base 提供权威 view-registry API 表面）· UM-ADAPT § 移位清单「seam 3/4」· map § Context Layer · design-research 2026-09-08

## Question

fork 的 data-agent UI presenters（`ui-present-table`, `ui-present-decomposition`, `ui-suggest-followups`, `ui-semantic-layer`——共 4 个 needs-logic-change 包，20 个文件）该：**方案 A（merge-into-ui-conversation）**——注册为 `ConversationViewRegistry` / `ConversationEventRegistry` 的 conversation-node renderer（跟随上游新架构，view/builder 模式），还是 **方案 B（keep-standalone）**——保持 standalone package，直接 import 拆分后的新类型（`ToolCallBlock`/`ConversationSnapshot`）继续做 slot-based 渲染？

> **note**：R-DA-CLIENT-RUNTIME-DECOMMISSION 原文列 5 包（含 `ui-context-layer`），2026-09-09 subagent survey 修正为 **4 包**——`ui-context-layer` 只 import `ClientContext`，`slots.register` 目标是 `shell.overlay`（fullscreen overlay，与 tool-call 渲染无关），是 TRIVIAL Phase-1 目标，不进本票 scope。

## Priority 升级理由（MEDIUM → HIGH，2026-09-09）

本票原标注 MEDIUM 且明确"不阻塞 merge"——**merge 层面成立**（Phase-1 unblock catalog 后 merge 层的进展照常）。**但事实上间接阻塞：**

1. **4 presenter 包的适配性改造**（isLatestTurn/blockText 无上游等价物 → 替代逻辑只有在选定注册模式后才存在）；
2. **zombie 包 (`packages/client/runtime`) 的最终删除**（4 presenter 迁完前包不能删）；
3. **UM10 全量 typecheck 门**（4 presenter 有残留 tsc 错——client tsc 现 206 err 里的 60× TS2339 `ClientRemote namespace-missing` 里跟 tool-call 视图相关的部分要等新注册模式实装才能解）。

且本票是 **UM-flow 三大核心需求②「data-agent 按 dsh 最新逻辑做适配性改造（非小修补）」的关键设计决策**——非"nice-to-have post-merge refactor"。UM-ADAPT 判据 3「改造后达成干净 seam 消费（public 契约，不用 zombie 内部）」+ 判据 5「可验证——行为符合新逻辑，不只编译过」直接由本票的答案决定。升 HIGH。

## Background（corrected 2026-09-09）

上游把 monolithic `@deepseek-ai/dsh-client-runtime`（`packages/client/runtime`）拆成 5+ 个 focused 包：
- `SlotRegistry` → `@deepseek-ai/dsh-client-ui-renderer`（`packages/client/ui-renderer/src/client/registry.ts`）
- `ToolCallBlock`/`ConversationSnapshot`/`ConversationNodeAssembler`/`ConversationLocationIndex` → `@deepseek-ai/dsh-client-ui-conversation`（`packages/client/ui-conversation/src/client/contract/{snapshot,records,slots}.ts`）
- `createSnapshotStore`/`defineStore`/`SnapshotStore`/`EngineStoreHandle` → `@deepseek-ai/dsh-client-store`（新包）
- `ISessions`/`createScope`/`scopeOf`/`AgentScopeHandle` → `@deepseek-ai/dsh-api-session-controller`（新包）
- `SessionId`/`SessionEvent` → `@deepseek-ai/dsh-client-connection`（沿用）
- `ClientContext` → **GONE**（`type ClientContext = Context`；上游 ui 直接从 `@deepseek-ai/cordis` import `Context`）

**新架构中心**是 `ui-conversation`/`ui-chat`/`ui-tool` 里的 `ConversationEventRegistry` / `ConversationViewRegistry` 注册模式。fork 的 data-agent presenters 是**上游架构下的 additive peers**——但目前用旧 `ctx.slots.register('tool.call.toolview',...)` + `isLatestTurn`/`blockText` 消费旧 monolith 类型。

**核对 R-DA-CLIENT-RUNTIME-DECOMMISSION 原文"UM7 已 repoint"的说法是错的**——本文原版说"UM7's per-type repoint is MINIMAL migration"，暗示 delete+repoint 已作为 UM7 一部分做完；R-DA-CLIENT-RUNTIME-DECOMMISSION 原文说 UM7 只做了极小的兼容 shim（仅 `transportError` import 改到 `dsh-client-connection` + 删 `dsh-host-apiproxy` dep，让 `pnpm install` 能跑）。**后者是对的**（Session A verify：`packages/client/runtime` 仍在，7 个消费者仍 import `@deepseek-ai/dsh-client-runtime`）。前者误读——本文修正。

## Scope

1. **审计**每个 needs-logic-change presenter 的渲染入口：目前如何注册（slot 位置、消费 `ToolCallBlock` 的方式）、`isLatestTurn`/`blockText` 用来做什么、tool-call 结果如何渲染。
2. **评估**两方案：
   - **方案 A（merge-into-ui-conversation）**：用 `ctx.uiConversation.views.register()` + `ConversationNodeDefinition`；builder 提供已投影视图；`isLatestTurn`/`blockText` 消失（builder 内建）。**pros**：跟随上游权威模式，UM-ADAPT 判据 3+5 满足；未来 `ui-conversation` 演进免费吸收；zombie 内部类型完全脱钩。**cons**：4 包代码结构重写；behavioral 变化需 QA（是否 preserve preset 切换/renarration 等 fork 特殊行为）；一次性成本高。
   - **方案 B（keep-standalone）**：presenters 继续用 `ctx.slots.register`，import 拆分后的 `ToolCallBlock`（`@deepseek-ai/dsh-client-ui-conversation/client`）+ 手写 `isLatestTurn`/`blockText` 的等价逻辑消费新 `ConversationSnapshot` 形状。**pros**：改动最小；行为一比一保留。**cons**：**UM-ADAPT 判据 4「不用 fork workaround 对抗新逻辑」有 marginal 违反风险**——保留旧注册模式跟"upstream 让 view-registry lazy/carrier-neutral"这类将来的移位撞；`isLatestTurn`/`blockText` fork 侧手写副本会随上游 snapshot 演进漂移，产生新维护债；4 包的独立性未必是真收益（都在 web-app 里，没有 tree-shaking 收益）。
3. **决**：A 还是 B；如 A，prototype 一个 presenter（`ui-present-table` 最小） verify pattern；如 B，把 `isLatestTurn`/`blockText` 的 fork 侧实现和上游 builder 逻辑 diff，评估漂移风险 + 添加 sync-test gate。
4. 决策落成后，本票 close；R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 按此决策执行 4 包迁移。

## adaptive-refactoring 主线定位

本票 = **UM-flow 核心需求②「适配性改造」的 view-registry seam 上的关键决策点**。R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 是本票决策的**执行**（不是决策本身）。UM-ADAPT 的 per-shift 分析里，seam 4「manifest 集中化」+ view-registry seam 是本票的**输入**（不是本票的替代）。UM15 的 durable analyzer 未来会自动化"识别 view-registry 这种 seam 的架构冲突"——本次手动跑本票 = UM15 的**训练样本**。

## Why-not-a-patch

它是**composition-DESIGN 决策**（presenter 在 UI 架构里居于何处）需要 prototype + grilling，不是一次性 import repoint。R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1 是 unblock（清 catalog 障碍 + 完成 3 个 trivial）；本票决定 Phase-2 的注册模式；R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 是 4 包迁移的执行。三层——设计（本票）、执行（Phase-2）、清障（Phase-1）——各自独立。

## Blocks / Blocked-by

- **Blocked by**：UM-ARCH regen-from-synced（要看权威 view-registry API 结构，not 旧手画图）· UM-ADAPT seam-4 + view-registry seam adaptive 判定。
- **Blocks**：R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2（4 包迁移的模式）· zombie 包本体删除 · UM10 全量 typecheck 门 · UM16 build:official 剩余错。
- **不阻塞**：UM14 re-sync merge（Session A done）· R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1（AFK-safe subset 独立）· UM-ARCH 本身 · UM-CORDIS-REGEN 的 api 半（result-cache typert）。

## Other refactor tickets surfaced by the deep research (LOW, nice-to-have post-merge)

- **R-DA-DASHSCOPE-STRICT-SYNC** (LOW): establish a sync contract so `llm-dashscope` tracks `llm-deepseek`'s streaming-identity + brand changes automatically (shared `acceptIdentity` helper extraction OR sync-test gate).
- **R-DA-SQLITE-STORAGE-ALIGNMENT** (LOW): evaluate whether fork's `storage-sqlite` (kv) + `data/audit` (node:sqlite relational) should route through the new upstream `storage-domain` hub rather than direct sqlite.
- **R-DA-JSONL-FIBER-LIFECYCLE-VERIFY** (LOW, tied to B-DA1): verify `ctx.effect` disposer capture (PB-COMPLY R2) still binds to the correct fiber under the new jsonl write-ownership lease (cross-process).
- **B-DA1** (already tracked, task #10): preset-autojoin's `agent/created` fire-and-forget race — real fix = move preset-join to the awaited setup path (session-controller `@Remote('prompt')`/`@Remote('create')`), retire `preset-autojoin`.

## Resolution

(open；建议 UM-ADAPT 出完 seam-4 + view-registry seam 分析后，本票 grill A/B——预期 A（真适配性改造），但决策要 UM-ADAPT 判据为证)
