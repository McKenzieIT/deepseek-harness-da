# GA-GT3-6b — discover_relations agent 可见报告（note? + 加减 diff）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（item 6 报告增强）
**Size**: M  ·  **Risk**: Low（additive）

## 问题

GA-GT3 item 6（PR #43）的空 inventory short-circuit 用 `console.warn` 报消息（运维可见，**agent 看不到**），且 `formatDiscoverRelations` 只报 `enriched`/`written`，**不显示改了哪些 ref**（add/remove）。agent 调一次 `discover_relations` 后看不到具体加减，自纠难。

两增强（additive，替换 console.warn 为 agent 可见）：

1. **`note?` 返回字段**：`enrichAllDwsTables`/`enrichAllEvents` 返回类型加 `note?: string`，空 inventory 时返 `note: 'no DIM tables in scope, nothing to enrich'`（替换 `console.warn`，让 caller/agent 可见）。
2. **加减 diff**：`tool-discover-relations` 的 `formatDiscoverRelations` 用 before/after 快照（`_before`/`_after` 已抓）渲染 added/removed ref（新增 `computeRemovedRelations`，镜像现有 `computeAddedRelations`）。

## scope

- `packages/data/semantic-layer/src/enrichment.ts`：返回类型加 `note?`；`enrichAllDwsTables`/`enrichAllEvents` 的 short-circuit 返 `note`（去 `console.warn`）；正常返回可选带 `note`。
- `packages/data/semantic-layer/src/index.ts`：`discoverRelations`/`discoverEventRelations` 返回类型加 `note?`（透传 substrate 的）。
- `packages/data/tool-discover-relations/src/index.ts`：`DiscoverRelationsResult` 加 `note?` + 输出 schema 加 `note`；`discoverRelationsResult` 透传 `res.note`；`formatDiscoverRelations` 渲染 added/removed（复用 `_before`/`_after`）；新增 `computeRemovedRelations`。
- **TDD**：red test 空 inventory 返 `note` + `formatDiscoverRelations` 输出含 added/removed 行；green。

## 不做

- preview/confirm（GA-GT3-1b，本票只报告不确认）。
- audit-log（GA-GT3-3）。
- **干净重写**，不 cherry-pick PR #15 的 tool-UX（那份和重复 fix 纠缠）。

## 参考

PR #15 有 `computeRemovedRelations` + `note?` 实现，但和其重复的 origin-aware replace 纠缠；本票干净重写，行为参考即可。

---

## Resolution（2026-09-07）

**Resolved via PR #58（merge `f5e111295e`）**。`enrichAllDwsTables`/`enrichAllEvents` 返回类型加 `note?: string`，空 inventory short-circuit 返 `note`（**移除 `console.warn`**）；`index.ts` `discoverRelations`/`discoverEventRelations` 返回类型加 `note?`（透传）；`tool-discover-relations` 的 `DiscoverRelationsResult`+schema 加 `note`，`formatDiscoverRelations` 渲染 `note:` + added/removed（新增 `computeRemovedRelations` 镜像 `computeAddedRelations`，复用 `_before`/`_after`）。Additive。TDD red→green（4 测试）；typecheck exit 0；vitest 269/269。**Rebase**：基于 5b 合并前的 master → 与 5b 在 enrichment.ts/index.ts 声明行冲突（5b 加 `preserveCurated` 参数、6b 加 `note?` 返回类型）→ rebase 解 4 块声明冲突（union：保 preserveCurated + 加 note?）后 merge。
