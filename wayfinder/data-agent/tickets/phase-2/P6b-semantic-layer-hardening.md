# P6b — 语义层 生产硬化

**Type**: prototype
**Phase**: 2
**Assignee**: —（unclaimed）
**Status**: Unblocked（graduated from P13b Q1 finding 2026-08-20）
**Graduated from**: P13b grilling Q1（P5/P6 生产 gap：P6 仅 prototype resolved，生产包未 ship）
**Blocked by**: P6（resolved, prototype）、P13b（resolved，local `CriticGuardData` contract consumer）

**Question**: P6 prototype（`prototypes/p6-semantic-layer/`）→ 生产 `ctx.schema` seam + substrate（EventDefinition/TableDefinition zod schema + BasicIndex + terminology + accumulated_definitions + atomic write + ADR-0011 cache-invalidate + write-tiers），替换 P13b 本地 `CriticGuardData` 薄默认（additive swap，critic 守卫数据 params_fields/partitions 从真 substrate 拿，P13b 引擎逻辑不变）。

**Design**: P6 决策（substrate 一等公民 + ODPS schema 解耦 `ctx.schema` seam discover/describe/sample）+ P13b Q1 contract（`CriticCtx{candidateTables, eventParams, partitionCols}`，`makeCriticCtx` 从 `EventDefinition.params_fields` + `TableDefinition.partitions`——见 `packages/data/nl2sql-engine/src/types.ts`）。生产 `packages/{semantic-layer,...}/...`（zod 镜像 RBI pydantic，per-scope YAML）。P13b YAML substrate reader → 真 `ctx.schema` substrate swap（additive，`CriticCtx` 契约不变）。

**Research**: → `../../research/p6-nl2sql-feasibility.md`（§1.5 substrate 成熟面）+ P6 ticket + P13b ticket Q1。
