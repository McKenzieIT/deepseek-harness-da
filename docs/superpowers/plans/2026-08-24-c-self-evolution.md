# C + Self-Evolution Implementation Plan

## Context

M1 重构后 metric 是派生视图，但 Phase 1 的 `qualifyTableName` 误用 `config.yaml project.name`（游戏 scope 标识 `game_10000251`，**非 ODPS project**）→ DAU 查询 qualified `game_10000251.dws_...` ODPS 找不到（表实际在 `ieu_cdm`）。C 重构移 `qualifyTable` 到 query provider（读 maxc `default_project=ieu_cdm`）解阻塞 + 回归 engine-agnostic。self-evolution（M2 #1/#2/#3）让 agent 遇 TABLE_NOT_FOUND 时问用户 project + 写 per-table override + 重试。

**M2 决策（grilling resolved）**：#1=B query-maxcompute 加 failure 分类；#2=C+A present_clarification 提 UNIVERSAL + HALT 扩展（**新建工具包**）；#3=A qualifyTable(tableName, override?) + tool 传 override。RBAC=admin stub。

## Architecture

- **C**: `qualifyTable` 上 `QueryEngine` abstract + query-maxcompute impl（`Config.defaultProject`，cordis.patch.yml 填 `ieu_cdm`）；SemanticLayerService 删 qualifyTableName/getDefaultProject/findTable；search 调 `ctx.get('query')?.qualifyTable`；load 删 qualified_name
- **#1**: query-maxcompute `decodeResult` 解析 error text → `failureKind`（provider 层，不动 dev sidecar）
- **#3**: `TableDefinitionSchema` 加 `project`；`qualifyTable(tableName, override?)` 收 override；`SearchHit` 加 `project?`；新 `update_table_config` 工具调 `updateTableMeta`
- **#2**: 新 `tool-present-clarification` 包；`present_clarification` 加 UNIVERSAL；`onTurnStopping` 加 HALT check；EXECUTION not_found fallback inject
- **RBAC**: `CallerIdentity` 加 `role?`；`update_table_config` admin check

## File Structure

**Modify**: `packages/query/query/src/index.ts`（QueryEngine abstract qualifyTable）、`packages/query/query-maxcompute/src/index.ts`（Config.defaultProject + impl + decodeResult 分类）、`packages/bundle/data-agent/cordis.patch.yml`（defaultProject: ieu_cdm）、`packages/data/tool-search-data-sources/src/index.ts`（qualifyCandidates 调 ctx.query + SearchHit project）、`packages/data/tool-load-table-definition/src/index.ts`（删 qualified_name）、`packages/data/semantic-layer/src/index.ts`（删 qualifyTableName:405-446）、`packages/data/semantic-layer/src/types.ts`（TableDefinitionSchema project）、`packages/data/phase-gate/src/types.ts`（UNIVERSAL+GENERATION whitelist）、`packages/data/phase-gate/src/phase-gate.ts`（onTurnStopping HALT + executionDecision inject）、`packages/identity/identity/src/index.ts`（CallerIdentity role）、`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（2 新工具行）

**Create**: `packages/data/tool-present-clarification/`、`packages/data/tool-update-table-config/`

## Tasks

### Task 1: C — qualifyTable 移 query provider
- `QueryEngine` abstract 加 `qualifyTable?(tableName, override?): string`（query/src/index.ts:66 后）
- query-maxcompute：Config 加 `defaultProject: z.string()`；`qualifyTable(tableName, override?) => `${override ?? this.cfg.defaultProject}.${tableName}``
- cordis.patch.yml query-engine config 加 `defaultProject: ieu_cdm`
- search qualifyCandidates：`ctx.get('query')?.qualifyTable?.(c.id, c.project) ?? c.id`（删 SchemaCorpusSource.qualifyTableName）
- load_table_definition：删 qualified_name + schema
- SemanticLayerService：删 :405-446
- TDD: qualifyTable default/override/无；search qualified

### Task 2: #1 — query-maxcompute failure 分类
- `decodeResult`（:255-269）解析 error text → failureKind：ODPS-0130131/Table not found→not_found；permission→permission；syntax→syntax；超时→timeout；其他→unknown
- 提取 `classifyMaxcError(text): string` 纯函数
- TDD: 各 ODPS code 映射

### Task 3: #3a — override 链路（schema + SearchHit + qualifyTable override）
- TableDefinitionSchema 加 `project: z.string().optional()`（types.ts:244）
- SearchHit 加 `project?`；projectHit 从 payload.project 提取
- qualifyCandidates 传 `qualifyTable(c.id, c.project)`
- TDD: candidate 带 project → override 优先

### Task 4: #3b — update_table_config 工具
- 新 `packages/data/tool-update-table-config/`（mirror tool-load-table-definition）
- `defineTool({ name:'update_table_config', parameters:{table_name,project}, invoke: RBAC + updateTableMeta(layer,name,{project},{recorder:ctx.audit,scope_id}) })`
- inject `['tools','schema','audit','identity']`
- agent.cordis.yml 行
- TDD: 写 override → updateTableMeta + invalidateCaches → rebuild

### Task 5: #2a — tool-present-clarification 包
- 新 `packages/data/tool-present-clarification/`
- `defineTool({ name:'present_clarification', parameters:{question, options?}, output:{presented:boolean}, invoke: ({presented:true, question}) })`
- agent.cordis.yml 行
- captureToolData 已检测（:393-396）

### Task 6: #2b — phase-gate HALT + self-evolution 流程
- UNIVERSAL_TOOLS 加 `present_clarification`（types.ts:152）
- GENERATION_TOOLS 加 `update_table_config`（types.ts:168）
- onTurnStopping（:213）加 `if (s.awaiting_clarification) return`（:223 后）——任意 phase HALT
- executionDecision（:290）：not_found → fallback GENERATION + inject `[self-evolution] 表 X not found。问用户 project（present_clarification），答后 update_table_config 写 override，重试`
- TDD: not_found→fallback+inject；present_clarification→HALT

### Task 7: RBAC — admin stub
- CallerIdentity 加 `role?: string`（identity:30）
- update_table_config：`ctx.identity?.current()?.role !== 'admin'` → 拒（safe-by-default，current() undefined→拒）
- TDD: non-admin 拒；admin 通过

## Verification

1. `pnpm vitest run packages/data/ packages/query/ packages/identity/` — 全单测
2. `pnpm tsc -b tsconfig.host.json` — M1 packages clean
3. `pnpm run verify-cordis-config` — preset integrity
4. dsh web E2E "查询K11过去一周的DAU"：search type 标注 → qualified `ieu_cdm.dws_...` → query_data 成功 → DAU
5. self-evolution 闭环：配错 defaultProject → TABLE_NOT_FOUND（failureKind=not_found）→ fallback+inject → present_clarification 问 → HALT → 用户答 → update_table_config 写 override → 重试 qualified → 成功
