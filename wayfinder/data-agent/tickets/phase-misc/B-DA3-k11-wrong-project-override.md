# B-DA3 — K11 表定义错误 project override (hdyl_data_sg)

**Type**: bugfix
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无
**Related**: [P4e](../phase-2/P4e-per-scope-odps-data-source-resolution.md)（per-scope data-source resolution）

## Problem

session-b3e4f0a3 中 search_data_source 搜到正确的 K11 表但 project 显示为 `hdyl_data_sg`（X63 overseas project），而非 K11 的 `ieu_cdm`。

## Root Cause

`examples/k11-semantic-layer/tables/dws_10000251_univ_acc_summary_di.yaml` 末行有 `project: hdyl_data_sg` — K11 语义层 321 个表定义中唯一一个带 `project` 字段。enrichment-agent-2026-07-31 在同时处理 K11/X63 语义层时将 X63 的 project 值误写入该 K11 表定义。

`search_data_sources` 读取 per-table `project` override 后传给 `qualifyTable(id, c.project)`，override 优先于 scope 级配置 → K11 scope 下仍显示 `hdyl_data_sg`。

P4e 的 per-scope 解析逻辑本身正确，被错误的 per-table override 绕过。

## Fix

删除 `dws_10000251_univ_acc_summary_di.yaml` 中的 `project: hdyl_data_sg` 行。无 override 时 `qualifyTable` 正确 fallback 到 active scope 的 `ieu_cdm`。

## Verification

确认 K11 其余 320 个表定义均无 `project` 字段。

## Files

- `examples/k11-semantic-layer/tables/dws_10000251_univ_acc_summary_di.yaml`
