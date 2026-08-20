# P6b — 语义层 生产硬化

**Type**: prototype
**Phase**: 2
**Assignee**: claude (wayfinder session 2026-08-20)
**Status**: Resolved（2026-08-20）
**Graduated from**: P13b grilling Q1（P5/P6 生产 gap：P6 仅 prototype resolved，生产包未 ship）
**Blocked by**: P6（resolved, prototype）、P13b（resolved，local `CriticGuardData` contract consumer）

**Question**: P6 prototype（`prototypes/p6-semantic-layer/`）→ 生产 `ctx.schema` seam + substrate（EventDefinition/TableDefinition zod schema + BasicIndex + terminology + accumulated_definitions + atomic write + ADR-0011 cache-invalidate + write-tiers），替换 P13b 本地 `CriticGuardData` 薄默认（additive swap，critic 守卫数据 params_fields/partitions 从真 substrate 拿，P13b 引擎逻辑不变）。

**Design**: P6 决策（substrate 一等公民 + ODPS schema 解耦 `ctx.schema` seam discover/describe/sample）+ P13b Q1 contract（`CriticCtx{candidateTables, eventParams, partitionCols}`，`makeCriticCtx` 从 `EventDefinition.params_fields` + `TableDefinition.partitions`——见 `packages/data/nl2sql-engine/src/types.ts`）。生产 `packages/{semantic-layer,...}/...`（zod 镜像 RBI pydantic，per-scope YAML）。P13b YAML substrate reader → 真 `ctx.schema` substrate swap（additive，`CriticCtx` 契约不变）。

**Research**: → `../../research/p6-nl2sql-feasibility.md`（§1.5 substrate 成熟面）+ P6 ticket + P13b ticket Q1。

## Finding / Design (resolved 2026-08-20, commit 88524504f8)

P6b ports the throwaway `prototypes/p6-semantic-layer/` to production `packages/data/semantic-layer/`（@deepseek-ai/dsh-semantic-layer, group=data, 镜像 audit/phase-gate/nl2sql-engine）。5 grilling 决策（全 A）+ subagent 独立分析 ground Q1：

- **Q1 包形态**：`packages/data/semantic-layer/` 单包，group=data。subagent 独立分析三重实证锁定——(1) data 能力包皆单包 Service+substrate+hooks（audit/phase-gate/nl2sql-engine）；(2) tool 包 ALWAYS 独立于 Service 包（tool-bash vs shell、tool-search-data-sources vs nl2sql-engine 无例外）；(3) preset 已按 `dsh-tool-load-table-definition`/`dsh-tool-load-event-definition` 独立 tool 包名注释→排除同包（C）；独立 group=semantic 对 1 包过度抽象→排除 B。load_* tools deferred separate tool 包。
- **Q2 seam 范围**：`ctx.schema` 覆盖 live-ODPS（discover/describe/sample）+ substrate 定义（loadEventDefinition/loadTableDefinition）一 seam。P13b CriticGuardData swap 经 `ctx.schema.load_*`。
- **Q3 live-ODPS 实现**：deferred——P6b ship Service Definition + substrate + StandInSchemaProvider（sync demo/tests）；真 MaxCompute provider（query-maxcompute sidecar 加 schema tools 或独立 schema-maxcompute）= follow-up。discover/describe/sample throw "no provider" until mounted；P13b swap 只需 substrate 定义（不需 live ODPS），不阻塞。
- **Q4 Tier-2 audit**：走 `ctx.audit.recordTier2Write`（P8b 真 sqlite audit，hash 非 body、fail-silent），非 prototype flat JSON log——连 intranet-security-first 统一审计流；Tier2Recorder 接口 ctx.audit 满足；D5「不可关」fail-loud if audit 未挂。
- **grounded**：zod 库（mirrors pydantic extra=allow→.loose、model_validator→.refine/.superRefine、canonicalize_type→.transform、Literal→enum；schemastery 无 .passthrough 故不用）+ js-yaml substrate deps；复用 `@deepseek-ai/dsh-atomic-write`（writeFileAtomic: temp+wx+rename, mode stamped）替 prototype 手搓 openSync/fsync/renameSync。

**Validated**：5/5 vitest（S1 zod parse+round-trip+canonicalize+DIM superRefine；S2 ODPS-decoupled sync stand-in→generate/merge YAML+analyst role preserved；S3 write-tiers Tier-1 suggest→pending→approve + Tier-2 via ctx.audit recorder；S4 BasicIndex lookup+ADR-0011 invalidate rebuild；S5 P13b swap 可达：loadEventDefinition/loadTableDefinition→makeCriticCtx params_fields/partitions 跑通）+ tsc clean + verify-cordis-config 132 + oxlint 0。

**P13b swap 影响**：P6b ship 后 P13b CriticGuardData 本地 YAML-reader 可换 `ctx.schema.load_*` substrate（additive，P13b 引擎逻辑不变，CriticCtx 契约不变）。P5b（retrieval sibling）ship 后 P13b RetrievalLinker 本地 Bm25Linker 换 ctx.retrieval（同 Q1 模式）。

**Assets**：`packages/data/semantic-layer/`（src/{types,io,basic-index,pending,index}.ts + tests/scenarios.spec.ts + fixtures/{role_online,dws_pay_order_di,dim_charm_info}.yaml + README + package.json + tsconfig.json）；commit 88524504f8。bundle 接线（semantic-layer row）+ live-ODPS provider + load_* tool 包 = follow-up。
