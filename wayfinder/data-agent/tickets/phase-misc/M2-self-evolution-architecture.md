# M2-self-evolution-architecture — self-evolution 架构：error 识别 + 问询控制流 + override 链路

**Type**: grilling（planning；3 核心架构决策待 grilled）
**Phase**: misc（cross-phase / self-evolution infra）
**Assignee**: wayfinder-session 2026-08-24
**Status**: Implemented + merged to master 2026-08-25（8 commits cc732dea→76b5c36e，fast-forward merge；plan docs/superpowers/plans/2026-08-24-c-self-evolution.md；subagent-driven 7 task + RBAC fix；262+19 tests + M2 typecheck clean + cordis 136 + dsh web 200）
**Surfaced by**: M1 Phase 2 self-evolution（表 project 未知时诊断→问用户→写 override→重试）。C 重构（qualifyTable 移 query provider）是 self-evolution 基础，但完整 self-evolution 有 3 个架构阻碍。
**Scope**: self-evolution 完整实现的 3 个核心架构决策（#1 error 识别 / #2 问询控制流 / #3 override 链路）。
**Question**: self-evolution（表 project 未知→问用户→写 override→重试）的 error 怎么可靠识别？问询控制流怎么扩 phase-gate？override 怎么存+传 qualifyTable？

## Why mandatory

- **M1 Phase 2 自进化是核心需求**：表 project 未知时 agent 诊断→问用户→写 override→重试，避免硬失败。当前表都在 ieu_cdm（C 解阻塞），但 self-evolution 是未来跨 project/新表的基础能力。
- **3 个架构阻碍决定可行性**：error 识别（failureKind 不可靠）+ 问询控制流（phase-gate 无 EXECUTION HALT）+ override 链路（存哪+传 provider）。

## Evidence（已查）

- **#1 error classification**：query-maxcompute 只产生 `failureKind: 'remote'`（MCP isError）或 `'transport'`（undecodable），**无 'not_found'**（`query-maxcompute/src/index.ts:259,268`）。TABLE_NOT_FOUND → 'remote' + error text "ODPS-0130131 Table not found"。phase-gate 拿 'remote'（太粗）。query-tool 透传 failureKind（`query-tool/src/index.ts:145`）+ 默认 'unknown'（`:256`）。
- **#2 phase-gate 问询**：当前 EXECUTION fail → fallback GENERATION（inject error，LLM 重写 SQL）。`route:clarify` HALT 只在 UNDERSTANDING（`phase-gate.ts:261`）。EXECUTION 无 HALT 问用户 path。
- **#3 override 架构**：per-table project override 需存 table yaml（`TableDefinitionSchema` 加 `project` 字段，M1a 说 .loose passthrough 不够）。qualifyTable 在 query provider（C 后），provider 不该读 semantic-layer substrate（engine-agnostic）。

## Open decisions（grilling 候选）

1. **error 识别 → Resolved B**：query-maxcompute 加 failure 分类（provider 层解析 maxc MCP error text → failureKind: not_found/permission/syntax/timeout/unknown）。分层正确（provider 懂 ODPS error code，phase-gate 只读 failureKind）；query-tool 已透传 failureKind（:145）；不动 sidecar（vs C）。映射：ODPS-0130131/Table not found/NoSuchTable→not_found；permission→permission；syntax→syntax；超时→timeout；其他→unknown。
2. **问询控制流 → Resolved C**：present_clarification 提 UNIVERSAL_TOOLS + phase-gate post-execute 检测 present_clarification 调用→awaiting_clarification HALT（扩展现有 UNDERSTANDING-only route:clarify HALT，不分 phase）。复用现有问询工具（DRY）；EXECUTION not_found→fallback GENERATION+inject self-evolution 指引→LLM 调 present_clarification→HALT→用户答→update_table_config→重试。update_table_config 加 GENERATION_TOOLS。
3. **override 链路 → Resolved A**：qualifyTable(tableName, override?) 在 provider 拼 `${override ?? maxc default_project}.${tableName}`；TableDefinitionSchema 加 project: z.string().optional()（schema 化，M1a）；SearchHit 加 project? 字段（projectHit 从 payload.project 提取）；qualifyCandidates 传 qualifyTable(id, c.project)。分层正确（provider 拼懂格式，不读 substrate；override 参数 engine-agnostic）；override 持久化 table yaml（单一源）。load_table_definition 删 qualified_name（search 已 qualify）。

## 实施决策（细节，M1 已定 default）

- **RBAC**：update_table_config admin-only stub（identity.current()?.role === 'admin'，前期单用户 all-admin，完整 RBAC follow-up）
- **cache invalidation**：update_table_config 写 table yaml project→invalidateCaches（D2f corpusVersion）→search rebuild，qualifyTable 读新 override（tool 每次读 schema payload）
- **用户探查**：问用户为主（SHOW TABLES 在错 project 找不到，M1 决策）
- **多表粒度**：per-table 逐个问 + 写 override

## 实施顺序（依赖 C 重构基础）

1. **C 重构**（qualifyTable 移 query provider，读 maxc default_project）—— 基础，解当前 DAU 阻塞（qualified ieu_cdm.dws_...）
2. **#1** query-maxcompute 加 failure 分类（not_found 等）
3. **#3** override 链路（TableDefinitionSchema project + qualifyTable override param + SearchHit project + tool 传）
4. **#2** 问询控制流（present_clarification UNIVERSAL + phase-gate HALT 扩展 + update_table_config 工具 + GENERATION whitelist）
5. **RBAC** update_table_config admin stub

## 关联

- [M1-virtual-metric-projection](M1-virtual-metric-projection.md)（C 重构基础）
- [M1a-yaml-structure-future-support](M1a-yaml-structure-future-support.md)（area2 per-table project schema 化）
- [AGENTS.md](../../../../AGENTS.md) capability seam 三角色 + engine-agnostic
