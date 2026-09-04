# GA-GT3-4a — tool-discover-event-relations（events 的 agent 工具）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（用户问题 4a）
**Size**: M  ·  **Risk**: Low（镜像现有 tool-discover-relations）

## 问题

当前只有 `tool-discover-relations`（DWS→DIM）agent 工具；events 的 `external_refs` 只能靠 `scripts/seed-event-external-refs.ts` 脚本 seed，**agent 没法交互式发现 event→DIM 关系**。substrate 的 `discoverEventRelations` Service 方法已存在（item 5 已接 origin-aware replace），只缺 agent 工具 wrapper。

包一层 `tool-discover-event-relations`（镜像 `tool-discover-relations`：`defineTool` + `ctx.tools.register` + `tables?`→`events?` filter + not-mounted honest fallback + `formatDiscoverRelations`-style 渲染含 add+remove），让 agent 能 discover event 关系。

## 背景

- `tool-discover-relations`（`packages/data/tool-discover-relations/`）是镜像模板（S1-S14 测试结构可复用；item 6 的 `computeRemovedRelations`/`note` 一并继承）。
- substrate `enrichAllEvents`/`discoverEventRelations` 已支持 `preserveCurated`（item 5，origin-aware replace）。
- management-session 工具门禁（`index.ts:10-11`）需加 `discover_event_relations`。
- gen-tool-catalog（`scripts/gen-tool-catalog.ts`）需重生成以纳入新工具。
- events on-write hook 仍 deferred（GA-GT3，`index.ts:639`）——本票只加显式工具，不加 auto-trigger。

## 不在本票

- 跨数据源关联（table↔event、event↔event、table↔metric）——更大模型改动，fog / GA-EXP1 Phase 3（ontology 结合深度）。
- events on-write hook。
