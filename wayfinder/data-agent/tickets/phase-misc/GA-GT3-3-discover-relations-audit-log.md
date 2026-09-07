# GA-GT3-3 — discover_relations audit-log（恢复支持）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（用户问题 3）
**Size**: M  ·  **Risk**: Low（additive）

## 问题

`discover_relations` agent 跑后写未提交工作树——若销毁/改错，无版本记录可恢复。item 5（GA-GT3）的 origin-aware replace 已让 curated ref 不被销毁（紧急性下降），但**仍无审计日志**记录每次 agent 跑的 before/after（用于恢复 + 事后审计）。

给 `discover_relations`（+ 未来 `discover_event_relations`）加审计日志：每次跑记 before/after snapshot + 时间 + scope 到 `packages/data/audit`（已存在的 audit package），支持从审计日志恢复。

## 背景

- `packages/data/audit` package 已存在（带 `tests/audit.spec.ts`）——审计基础设施有落脚点（接口待实施时确认）。
- `discoverRelationsResult` 已抓 `_before`/`_after` 快照——audit-log 可复用。
- YAML 全 git-tracked——committed 改动可 git revert；audit-log 主要覆盖**未提交的 agent 跑**那种（item 5 让那种不再销毁 curated，但 audit-log 是恢复力增强 + 事后审计）。
- 与 GA-GT3-1b（preview/confirm）互补：1b 是事前确认，3 是事后恢复。

## 不在本票

- item 5/6 的 write-safety + 可观测性（已落地，GA-GT3）。
- preview/confirm（GA-GT3-1b）。
