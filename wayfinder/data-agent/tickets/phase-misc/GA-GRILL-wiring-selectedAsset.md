# GA-GRILL-wiring — EvidenceSidebar selectedAssetId 共享信号方向 grilling

**Type**: grilling（先 grill 决方向，再开实施票）  ·  **Phase**: misc  ·  **Status**: Resolved（方向 D）  ·  **Resolved**: 2026-09-03
**Source**: [adversarial review CRITICAL](../../../.tmp/adversarial-review/synthesis.md)（ui-semantic-layer-1）
**Related**: [map GA-AUDIT1](../../map.md) · [wiring.tsx](../../../packages/client/ui-semantic-layer/src/client/wiring.tsx) · [SchemaExplorer](../../../packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx) · [EvidenceSidebar](../../../packages/client/ui-semantic-layer/src/client/EvidenceSidebar.tsx)

## 问题（grill 前先读这些确认）

生产接线 `SemanticLayerEvidence`（wiring.tsx:97）渲染 `<EvidenceSidebar>` 时传了所有 prop **唯独不传 `selectedAssetId`**。EvidenceSidebar 的 asset-scoped effect 第一行 `if (!selectedAssetId) return` → `fetchGapAnalysis`/`fetchEvalResults` 永不触发 → 生产里 GapPanel + EvalTrajectory 永久空（只有不依赖选中资产的 CoveragePanel/GoalDock 能显示）。

根因：SchemaExplorer 把"用户点了哪个资产"存在**自己的局部 useState**（`packages/client/ui-semantic-layer/src/client/SchemaExplorer.tsx:22`），没往外共享。SemanticLayerEvidence 是另一个 sibling `details.aux` adapter，拿不到。两个 sibling 槽之间无共享信号。

读确认：`rg selectedAssetId packages/client/ui-semantic-layer/src/client/EvidenceSidebar.tsx`（看 108 行的 early-return）+ `rg 'useProjection' packages/client/ui-semantic-layer/src/client/wiring.tsx`（看现有 projection 用法，`useProjection('goal')`）。

## 三个方向

### A. 加 'selection' projection
SchemaExplorer 发布选中资产到 `useProjection('selection')`；SemanticLayerEvidence 读它传 `selectedAssetId`。
- **pro**：与框架 projection 体系一致（`useProjection('goal')` 是既有模式）；session-scoped（多 session 隔离）；任意组件可订阅；架构正交、长期最干净。
- **con**：框架级改动（要在 projection registry 注册新 projection，动 session-projection/ui-*）；最 invasive；需懂 projection 注册机制。

### B. 模块级共享 store
两个 sibling `details.aux` adapter 之间用一个模块级 store（Zustand-style）共享 `selectedAsset`。
- **pro**：不动框架；只在 ui-semantic-layer 内；快。
- **con**：模块单例非 session-scoped（多 session 会串）；与既有 useProjection 模式不一致 → dsh-find-simplifications 会标"hand-rolled store where framework has projection"；易 stale。

### C. 暂不动（已上报）
留到专门 UI session；本次只记录在 synthesis。
- **pro**：0 风险。
- **con**：生产侧 GapPanel/EvalTrajectory 永久空——核心能力退化。

## Grilling 问题（逐个 grill，逼出真正的取舍）

1. **真需求**：用户在 SchemaExplorer 点资产时，真的期望侧边栏 GapPanel/EvalTrajectory 跟着变吗？还是这两个面板本就该显示"全局最新 eval"而非"选中资产的"？如果是后者，正确修法不是共享 selectedAssetId，而是改 EvidenceSidebar 不依赖选中资产。先 grill：这个"选中资产→侧边栏"的联动是真需求还是误设计？
2. **多 session**：dsh web 支持多 session 吗？如果支持，方案 B 的模块单例会串——确认多 session 是否真实场景。如果单 session 够用，B 的 con 消失。
3. **projection 注册成本**：方案 A 要在哪个 registry 注册 'selection' projection？改动面多大？读 `packages/client/ui-slots` + `session-projection` 确认注册机制。如果注册就是加一行，A 的 con 很小 → A 胜出。
4. **框架既有 pattern**：repo 里有没有别的 sibling-slot 共享信号的先例？如果有，照着走；如果都用 projection，A 是正统。
5. **UI 反应速度**：方案 A（projection）vs B（store）——选中资产切换时，哪个能让侧边栏更快刷新？projection 是 reactive 的；store 要手动 trigger re-render。性能差异？
6. **可测性**：哪个方向更好测？projection 可 mock；store 可直接 set。测试成本？
7. **dsh-find-simplifications 立场**：方案 B 会被 simplification audit 标"hand-rolled where framework has projection"吗？如果是，B 是技术债 → A 更对。

## 决策门槛

grill 到能回答"选中资产→侧边栏联动是真需求还是误设计"+"多 session 是否真实"+"projection 注册成本多大"后，定方向。定后开实施票（GA-WIRING-impl）。

## 不 grill 就不能定的事

- "联动是真需求"——这决定了是"共享 selectedAssetId"还是"改 EvidenceSidebar 不依赖选中资产"。这是 A/B/C 之外的第四种可能（重构侧边栏），grill 出来才能开票。

## Resolution (2026-09-03)

grilling 锁定方向 **D**（grilling 中新发现，超出原 A/B/C）：

- **Q1（真需求 vs 误设计）**：真需求。侧边栏按资产 scoped 设计（OnDemandEvalTrigger/fetchGapAnalysis/fetchEvalResults/EvalDeltaView 全吃 assetId）。fix = 共享选中资产信号，不重构侧边栏。
- **多 session**：真实（`sessions.list.byId` + session-scoped inject + `pruneStoreScope`）→ 机制须 session-scoped；模块单例（B）会串。
- **projection 机制**：projection 是 **log-derived**（host fold session 事件日志、客户端只读不能 publish；`docs/subsystems/session-projection.md`）。临时 UI 选中不是 session log event → **A 错配机制**，出局。
- **方向 D**：框架 session-scoped **slot store**（`defineStore` + `store:` on 两 `details.aux` entry → 共享 per-session 实例；`scoped-slots.tsx` `standardKit` 注入 `useStore`+`actions`）。既非 log-derived（不对 projection 误用）、也非手搓单例（用框架 store seat，审计无债）。
- B（模块 store）被 D 全面压制；C（不动）留生产侧 GapPanel/EvalTrajectory 永久空。

实施 → [GA-WIRING-impl-session-scoped-slot-store](GA-WIRING-impl-session-scoped-slot-store.md)。
