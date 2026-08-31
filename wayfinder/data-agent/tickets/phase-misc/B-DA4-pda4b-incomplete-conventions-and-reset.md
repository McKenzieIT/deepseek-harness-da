# B-DA4 — P-DA4b 未完成：SQL_CONVENTIONS 动态化 + scope 切换全量 state reset

**Type**: bugfix
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无
**Related**: [P-DA4b](P-DA4b-phase-gate-scope-dynamic.md)（resolved 但两项改动未落地）

## Problem

session-b3e4f0a3 中 pipeline 止步于 EXECUTION 前。P-DA4b 标记 resolved 但两项关键改动未落地：

1. **SQL_CONVENTIONS 硬编码**：`phase-gate.ts:119` 仍是 `const SQL_CONVENTIONS = '...FROM ieu_ods.ods_10000251_all_view...'`（K11 特定）。非 K11 scope 的 GENERATION 阶段收到 K11 的 SQL 模板，误导模型写出错误 FROM 表。
2. **scope 切换 state reset 不完整**：`scopes/active-changed` handler 只清 `prior_turn_tables`，P-DA4b 要求同时清 `candidate_tables`/`event_params`/`partition_cols`/`last_sql`/`last_critique`/`last_quality`/`definition_loaded`。旧 scope 脏状态残留导致 `sqlSyntaxGate` 用旧 candidate_tables 验证新 scope SQL → gate 失败 → 重试耗尽 → honest_decline。

## Fix

### 改动 1: SQL_CONVENTIONS 动态化
- 删除 `const SQL_CONVENTIONS = '...'` 硬编码（line 119）
- 新增 `buildSqlConventions(ctx: Context): string` 函数：从 `ctx.schema.semanticRoot` 读 scope 的 `config.yaml`（`loadConfig(semanticRoot)`），提取 `event_view.full_name` + `params_extract_template`；通用 MaxCompute 方言规则保留（partition ds=yyyyMMdd, SELECT-only 等），scope 特定值动态填充
- 在 `onAssemble` 中调用 `buildSqlConventions(this.ctx)` 替换静态 `SQL_CONVENTIONS`

### 改动 2: scopes/active-changed 全量 reset
- 扩展 handler：清 `prior_turn_tables` + `candidate_tables` + `event_params` + `partition_cols` + `last_sql` + `last_critique` + `last_quality` + `definition_loaded`(=false) + `phase_output`(='')
- 重置 `current_phase` 到 UNDERSTANDING + `phase_idx`=0 + `phase_attempts`=0（scope 变了旧阶段结果无效）

## Files

- `packages/data/phase-gate/src/phase-gate.ts`
