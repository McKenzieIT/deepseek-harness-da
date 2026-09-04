# GA-GT2 — 引擎抽象落地

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Resolved（2026-09-01；决策 D1-D5 记于 [map Decisions so far](../../map.md)，实现见 [GA-GT2-impl](GA-GT2-impl-engine-abstraction.md) Resolved）
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) · [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) — H1+H2 / arch G1 · **high**

**Problem**: MaxComputeQueryEngine 是唯一 `extends QueryEngine` 子类；`loadConventions` 对非 maxcompute 返回空 shape（静默 no-op，非路由）；prompt/critic/metric 用字面量烤 ODPS 方言（`ds=`+`MAX_PT`+`GET_JSON_OBJECT`+`['ds']` fallback）而非从注入的 conventions 驱动 → PG/Snowflake/ClickHouse 产错误 SQL 无信号。

**Scope**:
- 落地第二个引擎 provider（`dsh-query-postgres`）+ 其 `conventions.yaml` 验证缝
- 分区列名 / JSON UDF / 日期惯用语从字面量 prompt 规则移入 conventions（`functions`/`cast_map`/`sql_templates` 已有缝）
- `loadConventions` 未知引擎 fail-loud（不返回空）
- `EngineConventions` + `loadConventions` 移入抽象 `dsh-query` 包（去 leaky import）
- bundle `engineType` 改 deployment-configurable；eval-cli 引擎 import 按 config；`DASHSCOPE_API_KEY` 按所选 provider 条件化
- tool 描述改引擎中性（"SQL" 非 "MaxCompute SQL"）
- 去掉 `PARTITION_COLUMNS` const 与 `['ds']` fallback，依赖 schema 提供的 partitionCols

**Blocked by**: 无（是 GA-GT1/GT3/GT4 的试金石，建议最先做）  ·  **关联**: GA-GT1、GA-GT4、CL16（OdpsExecutor 命名）、CL17（leaky import）
**Key files**: packages/query/query/src/index.ts:38; packages/query/query-maxcompute/src/conventions.ts:77; packages/data/nl2sql-engine/src/{index.ts:29,prompt.ts:111,113,175,engine.ts:160,217,critic.ts:74,233,metric-engine.ts:139,158,types.ts:37}; packages/bundle/data-agent/cordis.patch.yml:106; packages/eval/eval-cli/src/context.ts:405,413

---

## Resolution（2026-09-01）

本票是 grilling 决策票；**5 项设计决策 D1-D5 记于 [map Decisions so far](../../map.md) 的「GA-GT2 引擎抽象落地」条**（不在此重复），实现落地于 [GA-GT2-impl-engine-abstraction](GA-GT2-impl-engine-abstraction.md)（Resolved，commit `89311537d9`），后续 NIT 清理见 [GA-GT2-nit-cleanup](GA-GT2-nit-cleanup.md)（Resolved），引擎中性 eval 验证见 [GA-GT2-eval](GA-GT2-eval-prompt-neutral.md)（Open）。

**行号漂移注意**：上方 Key files 中的 `prompt.ts:111,113,175` 是 2026-09-01 写入时的行号，现已漂移（`见方言规范` 实际在 `:54`/`:56`/`:145`；`renderConventionsPrompt` 调用在 `:108`/`:182`）。引证前以当前文件为准。
