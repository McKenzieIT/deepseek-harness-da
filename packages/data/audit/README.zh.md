# @deepseek-ai/dsh-audit

[English](README.md) | 中文

DeepSeek Harness 的按用户审计存储（`ctx.audit`）：关系型 `node:sqlite` 用于 tool/session/guard 审计事件 + G3 按用户 Qoder Credits 对账。P8b 生产硬化（移植一次性 `prototypes/p8-audit/`）。

## 概述

一个 additive Cordis `Service`，观察 `tools/post-execute` 和 `session/event` waterfalls，将结构化审计事件（tool 调用、session 生命周期、guard 决策、Credits）记录到不可变追加式 SQLite 存储中，支持按用户所有权隔离。

## 关键设计决策

- **自有 SQLite**（`ctx.audit`，非 `ctx.storageDomain`）— 关系型 3 表 schema（audit_event / audit_override / audit_tag）需要二级索引、跨表事务和多段键，`storage-domain` KV 无法提供。
- **不可变追加 + 仅限裁决 patch** — 身份字段永不可覆盖；纠正使用 `appendCorrection`（新行，`tag=attribution_correction` + `extra.corrects=originalLogId`）。
- **`stats` vs `correctedStats`** — `stats` 聚合不可变原始记录（快速，始终与 `rawPayload` 一致）；`correctedStats` 应用纠正供合规对账（O(n)，按需）。
- **Tier-2 hash-not-body** — `recordTier2Write` 存储内容哈希而非完整 payload，用于 semantic-layer 写审计。

## 验证

```sh
tsc -b packages/data/audit/tsconfig.json   # typecheck
pnpm vitest run packages/data/audit         # 12 specs
pnpm verify-cordis-config                   # bundle mount resolves
```

## Known Limitations and Deferred Work

- **userId 按用户维度** — 当前为 NULL（T1 fallback）；需要 P9 `@deepseek-ai/dsh-admin` 落地并连线 `resolveIdentity()`（小的 additive 变更）。
- **`guard_deny` 自动标记** — post-execute 无 `decision` 参数，guard 拒绝无法与 tool 失败自动区分；经 `ctx.audit.record({auto_tags:['guard_deny']})` 的显式标记延期至 P10 内网 tool-gate。
- **Qoder 内部 tool/推理流** — P8b 审计调用结果（终态 + Credits），非内部推理流；取证流审计需要单独的 core seam 票（map Not-yet-specified）。
- **`verify-cordis-config` llm-dashscope** — 先前存在的问题（P2 committed insert 无 bundle dep）；非 P8b 引入。
- **身份 `''` vs NULL 不一致** — `sameOwner` 和 `_where` 对空字符串 vs NULL 身份字段的处理不同（code-review L2，边界情况）。
- **`dumpAll` 无所有权 guard** — 不在生产路径中（code-review L3，边界情况）。
