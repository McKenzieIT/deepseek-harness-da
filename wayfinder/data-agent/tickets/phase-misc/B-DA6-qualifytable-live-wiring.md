# B-DA6 — Wire qualifyTable into the live execute path (deterministic qualification)

**Type**: bugfix (hardening)
**Phase**: misc
**Status**: reverted (2026-08-31) — option B FAILED real-LLM verification
**Assignee**: claude-code (subagent-driven)
**Verification**: option B regressed eval pass_rate **73.8% → 6.5% (-67.3pp)**. Real-LLM run `1f0ec09c` (qualified prompt, aga/qwen3.7-max, sql-judge, 168 cases) vs baseline `10320fe2` (CL-15, bare): Lost 113, Gained 0. 153/168 **semantic** wrong (only 4 parse-fail → not judge-infra flake). **Root cause (generation breakage, not judge bug)**: qualified candidate names (`ieu_cdm.dws_…`) in `buildPrompt` caused the LLM to emit **reasoning prose / tool-call text / empty** instead of ```sql-fenced SQL → `extractSqlCandidate` finds no SQL → judge "Input is not SQL". NOTE: production (search_data_sources tool path) handles qualified candidates fine (session-31bd30c9 emitted valid qualified SQL) — breakage is **buildPrompt-path-specific**. All B-DA6 code reverted (prompt.ts/engine.ts/eval-cli context.ts/eval-runner-service index.ts + `qualify-table.spec.ts` deleted + S20 reverted); E-DA5 + staleness fix preserved; 104 tests green. **Recommendation**: if qualification ever needed, use option A (execute-time SQL rewrite — doesn't touch the prompt/LLM) NOT option B; B-DA5 already makes bare names resolve via per-scope config, so qualification is redundant for MaxCompute correctness.
**Blocked by**: —（独立于 B-DA5；B-DA5 修好后非阻塞，本票为加固）
**Related**: [B-DA5](./B-DA5-per-scope-maxc-config-routing.md), [P4e](../phase-2/P4e-per-scope-odps-data-source-resolution.md), `packages/query/query-maxcompute/src/index.ts`, `packages/query/query-tool/src/index.ts`, `packages/data/nl2sql-engine/src/prompt.ts`

## Problem

`qualifyTable` + `Config.defaultProject` + 表定义的 `project: ieu_cdm` 三处正确限定信息在 live execute 链路里**从不被调用**：
- `query-tool` `executeQuery` → `query.execute({sql, scopeId})` 把 LLM 的 SQL 原样透传；
- `MaxComputeQueryEngine.execute` 只做 `normalizeForMaxCompute`（空白/方言规整），不调 `qualifyTable`；
- NL2SQL prompt 不注入 project、不指示 `project.table` 限定（候选以裸 `c.id` 列出）。

限定与否全靠 LLM 自觉——session-31bd30c9 里 LLM 时而裸名 `dws_…`、时而 `ieu_cdm.dws_…`，非确定。

## Root Cause

C 重构把 qualification 搬到 query provider（`qualifyTable`，engine-agnostic 接口 + per-engine 实现），意图作为 "single source of truth"，但**未接进 execute 链路**——是 wiring gap，非归属错误。

## Fix（确定性限定，跨引擎安全）

限定逻辑住 query provider（per-engine `qualifyTable`：MaxCompute→`project.table`、Holo→`schema.table`、MySQL→`db.table`、本地文件→no-op/`read_csv`），**不住 prompt**。

实现选项（择一，倾向 option B）：
- **A. execute 时 SQL 表名改写**：provider 解析 SQL `FROM`/`JOIN` 表引用，对裸名调 `qualifyTable`。需 SQL 解析（regex/轻量 parser），较脆。
- **B. 经 provider seam 在生成阶段算好限定名**：NL2SQL 构建 prompt 时对每个候选 `c.id` 调 `ctx.query?.qualifyTable?.(table_name, def.project)` 渲染为限定名；无 provider/qualifyTable 则 fallback 裸名。engine-agnostic（optional seam）+ per-engine（provider 实现）+ 跨引擎安全。

## Why not prompt injection

- 连本 bug 都修不了：session-31bd30c9 里 agent 已发 `FROM ieu_cdm.dws_10000251_univ_acc_act_di`（正确限定）仍 `ODPS-0130131`——因 sidecar 在错 endpoint（B-DA5 根因），prompt 注入 project 前缀对根因无效。
- 破坏跨引擎：holo=`schema.table`、mysql=`db.table`、本地文件无 `project.table`。违反 standing principle "语义层不绑定特定查询引擎"（map 常设原则）。prompt 至多经 per-engine conventions seam 带方言规则，但「具体哪个 project」这个**值**必须来自 provider/scope，不能硬编码 prompt。

## Acceptance criteria

- 裸表名在生成 SQL 中确定性限定为 `<scope project>.<table>`（option B）或 execute 时改写（option A）。
- per-engine `qualifyTable` 各自正确（MaxCompute 已有；Holo/MySQL/本地文件 provider 出现时各实现）。
- prompt 不硬编码 `project.table`。
- 单测 + `tsc` + vitest 全绿。

## Files

- `packages/query/query-maxcompute/src/index.ts` 或 `packages/data/nl2sql-engine/src/prompt.ts`（option B）
- `packages/query/query-tool/src/index.ts`
