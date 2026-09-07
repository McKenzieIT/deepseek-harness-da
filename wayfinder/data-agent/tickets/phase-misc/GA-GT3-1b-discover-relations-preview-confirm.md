# GA-GT3-1b — discover_relations preview/confirm mode

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（用户问题 1b）
**Size**: M  ·  **Risk**: Med（反转 G3 direct-write 设计）

## 问题

`discover_relations` 当前 direct-write（无 approval）——G3 设计决策（2026-08-22 note：「written directly, no approval」）。item 6（GA-GT3）加了「报告改了什么」（add+remove via `computeRemovedRelations`），但**没有确认步骤**：agent 调一次就写盘，即便它看到 −N removed 也无回头路。

是否给 `discover_relations` 加 preview/confirm 流（`dry_run` 模式返回 before/after diff 不写盘，确认后再写）？还是保持 direct-write（item 6 的可观测性已足够 agent 自纠）？

## 背景

- G3 设计：direct-write, no approval（`.agents/notes/implemented/feature/2026-08-22-semantic-layer-ai-native-enrichment.md`）。
- item 6 已让 agent 看到 add+remove（`formatDiscoverRelations` 渲染）。
- `discoverRelationsResult` 已抓 `_before`/`_after` 快照——preview 模式可复用，不需新采集。
- 张力：preview/confirm 反转 G3 的 direct-write 决策；但调用方是 LLM agent（非人类），「确认」语义需 grilling 定义（agent 自确认？人类介入？两段式 tool-call？）。

## 不在本票

- item 5 的 origin-aware replace（已落地，GA-GT3）。
- events on-write hook（仍 deferred，GA-GT3）。
- audit-log 恢复（GA-GT3-3）。
