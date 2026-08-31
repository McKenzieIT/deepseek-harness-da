# B-DA2 — Scope routing: 确认 + 按需加载

**Type**: bugfix
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无
**Related**: [G-DA5](G-DA5-per-question-scope-routing.md)（设计），[P-DA4c](P-DA4c-scope-routing-ship.md)（ship）

## Problem

session-b3e4f0a3 暴露三个 scope routing 缺陷（均为设计遗漏，非代码回归）：

1. **静态全量注入**：`scope-hint.ts` `buildScopeAwarenessSection()` 在 >1 scope 时无条件 dump 全部 scope 到 system prompt，`list_scopes` 工具形同虚设。注入量随 scope 数线性增长，浪费 token。
2. **自动切换无确认**：`buildAliasHint()` 的指令是 `"You MUST use switch_scope to switch to the correct scope before searching or querying"` — 强制自动切换，不给用户确认机会。用户问"查询过去七天DAU"（无 scope 关键词），LLM 自行选了 X63。
3. **Persona 无 scope 确认指导**：`BASE_PERSONA` 和 `PHASE_INSTRUCTIONS` 没有任何文本告诉模型"向用户确认 scope 选择"。

## Root Cause

G-DA5 设计了"LLM 工具自决 + harness 兜底"方案，P-DA4c 忠实实现。但设计本身未包含"确认 scope"环节 — "自决"被理解为"自动切换"而非"自主决策后向用户确认"。

## Fix

1. `buildScopeAwarenessSection()` → 不再列出全部 scope 详情；改为简短提示"有 N 个数据 scope 可用，使用 `list_scopes` 查看详情"
2. `buildAliasHint()` → `"You MUST use switch_scope"` 改为 `"Ask the user to confirm which scope they want before switching. Mention the detected scope as a suggestion."`
3. 在 UNDERSTANDING PHASE_INSTRUCTIONS 中添加 scope 确认步骤（在 search_data_sources 前）

## Files

- `packages/data/tool-scope-routing/src/scope-hint.ts`
