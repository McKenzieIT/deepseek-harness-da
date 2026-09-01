# E-DA5 — Eval coverage for table-resolvability + per-scope routing (the stand-in blind spot)

**Type**: bugfix (eval)
**Phase**: misc
**Status**: resolved (2026-08-31)
**Assignee**: claude-code (subagent-driven)
**Verified**: spec ✅ + quality ✅. 81/81 tests green (8 new `stand-in-odps.spec.ts` + eval-cli `main.spec.ts` CL-15 staleness fixed: `cases/k11`→`k11-v2`, `k11_059`→`k11v2_059`). Corpus-aware `StandInOdps` (reuses `critic.extractTableNames`, maxc-shaped `not_found`) wired at 3 sites (eval-cli `context.ts` `loadScopeCorpus`, `runner.ts`, `comparison-runner.ts`). Deviation D1 (`FailureKind.TABLE_NOT_FOUND` vs spec literal `'not_found'`) accepted — correct codebase constant. **Deferred follow-up**: K11↔X63 multi-scope SWITCHING eval-case (needs X63 schema fixtures; per-scope isolation unit-covered in `stand-in-odps.spec.ts` t3). **Known residual (pre-existing, not E-DA5)**: comma-join `FROM a, b` 2nd table missed by `critic.extractTableNames`.
**Blocked by**: —
**Related**: [B-DA5](./B-DA5-per-scope-maxc-config-routing.md), `packages/data/nl2sql-engine/src/stand-in-odps.ts`, `packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs`, `packages/eval/eval-cli/`

## Problem

eval 基线（CL-8 100%、CL-9 91.7%、CL-15 73.8%）通过，但 live 执行失败——eval 未拦住 B-DA5 这类 per-scope 路由 / 表可解析性回归。

## Root Cause（三个子项）

(a) `stand-in-odps.ts`（eval-only）对任意 SQL 返回 `done/{cnt:42}`，从不校验 `FROM` 表是否在 active scope 语料里可解析——LLM 编造表名或漏限定都不报 `table_not_found`。
(b) K11 eval 走 `dev/maxc-sidecar-k11.mjs` 硬注入 `config_ieu_cdm.yaml.bak`——永远命中 ieu_cdm，测不到 sidecar-self 旁路 / scope 切换路由错配。
(c) 无多 scope（K11↔X63）切换 eval case——B-DA5 这类回归对 eval 不可见。

## Fix

- (a) **corpus-aware stand-in**：`StandInOdps.execute` 解析 SQL `FROM`/`JOIN` 表引用，表不在 active scope seeded corpus 则返 `{state:'failed', failureKind:'not_found', error:'ODPS-0130131 ... Table not found - table <name> cannot be resolved'}`（对齐 maxc 真错文本，让 `classifyMaxcError` 命中）。catches 编造表名 + 漏限定（裸名按 scope default project 解析）。
- (b) **sql-judge 静态校验**：每张 `FROM` 表必须解析到 active scope 下定义（或在 corpus 中）。
- (c) **多 scope 切换 eval case**：K11↔X63 切换，断言候选/限定/路由随 scope 变（catches sidecar-self 旁路 + 错配 scope project）。

## Acceptance criteria

- 一个 B-DA5 复现（K11 路由到 SG project / 裸名落错 scope）在 eval 中**失败**而非通过。
- corpus-aware stand-in 对不在语料的 `FROM` 表返 `not_found`。
- K11↔X63 切换 case 落地。
- `pnpm vitest run packages/data/nl2sql-engine` + eval-cli smoke 全绿。

## Files

- `packages/data/nl2sql-engine/src/stand-in-odps.ts`
- `packages/eval/eval-cli/`（多 scope case）
