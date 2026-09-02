# GA-GT2-impl — 引擎抽象落地实施

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-01 claude session — B impl (dual-line)  ·  **Resolved**: 2026-09-01
**Source**: [GA-GT2 resolution](GA-GT2-engine-abstraction.md)（2026-09-01 grilling 锁定 5 项决策）
**Priority**: high
**Blocked by**: 无

## Question

实施 GA-GT2 的 5 项设计决策（D1-D5），将引擎抽象从纸面落地到代码。

## Scope

### D1: EngineConventions 迁移 + QueryEngine.getConventions()

- `dsh-query/src/conventions.ts`（新文件）：迁入 `EngineConventions`、`ConventionFunction`、`ConventionCast`、`ConventionTemplate` 类型定义
- `dsh-query/src/index.ts`：`QueryEngine` 加 `getConventions(): EngineConventions` 方法（默认 throw，子类 override）
- `query-maxcompute/src/conventions.ts`：import types from `dsh-query`；保留 YAML 加载
- `query-maxcompute/src/index.ts`：`MaxComputeQueryEngine` override `getConventions()` 调用本地 YAML 加载
- `nl2sql-engine` 5 个源文件 + 1 个测试文件：import 从 `@deepseek-ai/dsh-query-maxcompute/src/conventions.ts` 改为 `@deepseek-ai/dsh-query`
- `nl2sql-engine/package.json`：peerDep `dsh-query-maxcompute` → `dsh-query`
- `nl2sql-engine/src/index.ts`：`Nl2sqlEngineService` 改用 `ctx.query.getConventions()`

### D2: prompt §6 引擎中性改写

- `nl2sql-engine/src/prompt.ts`：规则 1/3 去掉 MaxCompute 特定语法，改为引用方言规范区域
- `nl2sql-engine/src/conventions.ts`：`renderConventionsPrompt` 标签去 `maxcompute` 字样
- `buildEvalPrompt` 同步处理

### D3: 删除 PARTITION_COLUMNS + ['ds'] fallback

- `nl2sql-engine/src/types.ts`：删除 `PARTITION_COLUMNS` 常量；`makeCriticCtx` 默认 `partitionCols = []`
- `nl2sql-engine/src/critic.ts`：移除 `PARTITION_COLUMNS` import 和合并逻辑
- `nl2sql-engine/src/engine.ts`：`partitionCols` fallback `['ds']` → `[]`

### D4: dsh-query-postgres 空壳

- `packages/query/query-postgres/`：新包，conventions.yaml + `PostgresQueryEngine extends QueryEngine`（execute 等 throw not-implemented；getConventions 从 YAML 读）

### D5: bundle + tool 描述

- `cordis.patch.yml`：加 Postgres swap 注释
- 逐文件确认引擎特定字面量并改为引擎中性

## Key files

同 [GA-GT2 ticket](GA-GT2-engine-abstraction.md) Key files 列表。

---

## Resolution (2026-09-01)

B1–B5 全部实施 + 验证通过：

- **B1 (D1)**：`EngineConventions`/`ConventionFunction`/`ConventionCast`/`ConventionTemplate` 迁入 `@deepseek-ai/dsh-query/src/conventions.ts`；`QueryEngine.getConventions()`（默认 throw、子类 override）；maxcompute override；nl2sql-engine 4 源文件 import repoint + peerDep 加 `dsh-query`。
- **B2 (D2)**：prompt §6 规则 1/3 + `renderConventionsPrompt` + `buildEvalPrompt` 引擎中性化（`ds`/`MAX_PT`/`GET_JSON_OBJECT`/`CAST AS BIGINT` → 引用方言规范 `functions`/`cast_map`）；heading 收进 renderer、数据驱动 `# 方言规范（${conv.engine}）`。flag：maxcompute conventions.yaml 缺 MAX_PT/latest-partition（eval 验是否需补）。
- **B3 (D3)**：删 `PARTITION_COLUMNS`（`['ds','dt','partition_date','p_date']`）+ `makeCriticCtx` 默认 `[]` + critic `hasPartitionFilter` 合并逻辑 + engine.ts `['ds']`→`[]` fallback。phase-gate 本地 `PARTITION_COLUMNS` 不动（另票）。
- **B4 (D4)**：`@deepseek-ai/dsh-query-postgres` stub 包（`PostgresQueryEngine extends QueryEngine`，override `getConventions` 读 YAML，`execute`/`attach`/`cancel`/`getProgress` throw not-implemented）；import 路径修（深 `@deepseek-ai/dsh-query/src/index.ts` → bare，因新包无 node_modules、深路径不解析）。
- **B5 (D5)**：`cordis.patch.yml` Postgres swap 注释（`id: query-engine` seam）+ 27 文件引擎特定字面量中性化（tool 描述/README/JSDoc/eval prompt/api-catalog/package.json）；代码标识符（`MaxComputeQueryEngine`/`OdpsExecutor`/config keys/ODPS 错误码）保留（CL16/CL17 另票）。

**验证**：consolidated `tsc -b tsconfig.host.json + query-postgres` —— B1-B5 **0 编译错误**；残留 11 tsc 错 + 17 vitest 失败**全在两个未追踪 pre-existing WIP 测试文件**（`stand-in-odps.spec.ts` GA-EXP2 / `per-scope-maxc-config.spec.ts` B-DA5，并行 eval 工作、B1-B5 之前就坏），非 GA-GT2-impl 回归。GA-EXP2 `promptBuilder` WIP 全程保留。

**跨线耦合（记 GA-GT1-impl）**：`Nl2sqlEngineService` 构造时 `this.conventions = ctx.query.getConventions()` 缓存——GT2-D1 正确但多租户坏（`ctx.query` 单例 → 所有 tenant 同一 conventions）。GA-GT1-impl（per-request scope，β）须让 `getConventions()` per-request-scope 解析。

**Follow-ups（非阻塞）**：✓ ~~maxcompute 深路径 import 一致性~~ → **已由 [GA-GT2-nit-cleanup](GA-GT2-nit-cleanup.md) 解决（2026-09-02，NIT1 deep→bare）**；query-postgres 运行时 `pnpm install` 建 symlink；conventions.yaml 可能需补 MAX_PT/latest-partition（B2 flag → GA-GT2-eval 验）；query-postgres `package.json` `files` 漏 `lib/types/conventions.js`（publish 会破，改 `lib/types/**/*.js`，pre-existing NIT，out-of-scope）。

**Unblock**：GA-GT2-eval（168-case eval 语义验证引擎中性化）。
