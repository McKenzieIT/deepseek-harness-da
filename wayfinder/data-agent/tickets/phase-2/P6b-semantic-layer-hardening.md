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

**Code-review follow-ups（subagent review 2026-08-20）**：已修——#7 BasicIndex per-layer hook（A 层 write 不脏 B 层 index；ADR-0011 语义修正）、#3 `canonicalizeType` 收窄 `(raw: string): string`（去 dead `typeof` 分支、output type 不再含 undefined/null）、#2 `canonType` 加 `.default('')` 镜像 RBI `ParamField/ColumnDef/PartitionDef type: str = ""`（RBI 接受省略 type）。Deferred（P6b 当前无 model-facing tool，name 来自内部 trusted 调用，defense-in-depth 待 load_* 接入）：#4 `writeTable/updateTableMeta` 写 `r.data`（canonicalize-on-write，当前写 raw——loaded 已 canonical 故 P13b swap 不受影响，纯 on-disk faithfulness）、#5 definition name path-traversal guard（intranet-security-first，拒 `/` `\` `..`）、#6 `updateTableMeta` read-merge-wrap `withFileLock`（@deepseek-ai/dsh-atomic-write，concurrency-safety，prototype 已注 production 用 lock lib）。非 issue：#1 write-before-audit（audit `recordTier2Write` fail-silent 不 throw，D5「不可关」指调用非可选非回滚）、#8 max-len（oxlint 0 error 已过）、#9 `/src/*` import（repo 约定——nl2sql-engine 自身 import query-maxcompute 亦走 `/src/*`）。

**load_* 接入 follow-up（2026-08-21，[data-agent-tool-packages-shipping](../phase-misc/data-agent-tool-packages-shipping.md)）**：`load_table_definition` / `load_event_definition` tool 包 ship（`packages/data/tool-{load-table-definition,load-event-definition}/`），底层调 `ctx.schema.loadTableDefinition/loadEventDefinition` substrate。**#5 path-traversal guard 落实于 tool 边界**（`validateDefinitionName` 拒 `/` `\` `..` NUL——model input = untrusted boundary，intranet-security-first）；substrate `io.ts` 读路径按 `table_name`/`name` 字段匹配（非按文件名），故 `load_*` 不可达穿越，守卫为纵深防御。#4（canonicalize-on-write）/ #6（withFileLock）仍 deferred 于 `io.ts`（不影响只读 load_*）。**ctx.schema bundle mount deferred**（并发会话 pnpm-lock collision；见聚合票 Resolution）——load_* 暂 "callable but unwired"，注册该 service 即接通真 substrate。

**load_* code-review fix（2026-08-21，[aggregate](../phase-misc/data-agent-tool-packages-shipping.md) Resolution）**：处理 540dbd155d ship 后两 subagent code review findings（3 MAJOR + MINOR/NIT，无 CRITICAL）。MAJOR-1 白名单 overclaim → **加 `GENERATION_TOOLS`**（additive，`phase-gate/src/types.ts` 加 `load_table_definition`/`load_event_definition`）——load_* 在 GENERATION 写 SQL 前 schema grounding 合理 + critic harvest `partition_cols`/`event_params` 一致；使所有 "UNDERSTANDING/GENERATION" 文案 accurate。MAJOR-2 substrate try/catch → 两 `load*DefinitionResult` 包 `schema.load_*` 于 try/catch（substrate `load_*` 是 strict `Schema.parse`-on-match，name 匹配但 schema 失败抛 ZodError + readdir/readFile I/O 错），catch 返 `{found:false, message:'substrate error: <sanitized>'}`（单行/去路径/截断 200）+ malformed-fixture 测试。MAJOR-3 preset header 注释重写。MINOR：table 投影 `domains`（对齐 event）+ `engine` render + 两包完整 nested `output.schema`（消除 `as unknown as` cast + output-validation 强制投影形状）；disambiguation/caliber_variants/primary_key_unique 补否（YAGNI）。NIT：empty-type 去尾随空格、not-found `JSON.stringify(name)`、found:true 无 table 中性 fallback、name 长度上限 200、empty-string record key filter。**#5 path-traversal guard 不变**（已落实于 tool 边界，非 substrate）。验证：tsc + vitest 52/52 + verify-cordis-config 135 + gate oxlint 0 error 全绿。substrate `io.ts` 未改（#4 canonicalize-on-write / #6 withFileLock 仍 deferred；只读 load_* 不受影响）。
