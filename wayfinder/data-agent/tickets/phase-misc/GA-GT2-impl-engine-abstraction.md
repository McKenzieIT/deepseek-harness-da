# GA-GT2-impl — 引擎抽象落地实施

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
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
