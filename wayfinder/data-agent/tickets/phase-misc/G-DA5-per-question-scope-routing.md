# G-DA5 — Per-question 自动 scope 路由（NL→scope 映射）

**Type**: grilling
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无硬阻塞；P1（scope-registry 基础设施）已 resolved；scope-registry + semantic-layer delegation 管道已通。
**Related**: [P1-per-scope-config](../../semantic-layer/tickets/P1-per-scope-config.md)（resolved，基础设施），[P4e-per-scope-odps-data-source-resolution](../phase-2/P4e-per-scope-odps-data-source-resolution.md)，[G-DA2](G-DA2-intent-confidence-router.md)（意图路由）

## Question

用户在新对话中发送"查询X63司测期间上报的日志"，期望系统自动识别"X63"并切换到 X63 的语义层（scope_id `'10000334'`，`examples/x63-semantic-layer`）。当前系统**无任何 NL→scope 自动路由**机制——`ctx.scopes.active()` 返回的要么是上一次手动 `setActive` 的值，要么是 undefined（回退 K11 静态 fallback）。如何设计 per-question 自动 scope 路由，使数据 query 自动定位到正确的游戏 scope？

## Resolution

### 决策总览

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 路由时机 | **(乙) LLM 工具自决 + harness 兜底** | 行业趋势（Genie One 2026、Fabric Data Agent）验证 LLM-driven routing；harness pre-step alias 检测作为弱模型 fallback |
| 2 | 路由信号 | **LLM 自评（scope 列表+描述注入 system prompt）+ harness alias fallback** | LLM 读 scope metadata 决策；管理员只需维护 scope 描述（双重用途：管理+路由） |
| 3 | 多 scope 查询 | **(乙) subagent 并行/串行独立执行** | 对齐 Genie One "switch agents without losing context" + Fabric "data source routing" |
| 4 | 切换粒度 | **per-question LLM-driven（工具调用触发）** | LLM 判断每条消息是否需要切换；不切换=沿用当前 |
| 5 | 回退策略 | **harness pre-step alias 检测 inject hint；无信号时沿用 active** | 弱模型兜底 |
| 6 | K11 硬编码清理 | **phase-gate scopeId 动态化 + SQL_CONVENTIONS 动态化；semanticRoot fallback 保留** | phase-gate 读 ctx.scopes.activeId()；conventions 从 seam 注入 |
| 7 | P9 关系 | **正交组合：route 先 gate 后** | 本票先落，P9 后叠加 |

### 核心原则

**"提供工具让 LLM 编排，harness 做好兜底以抹平不同模型的能力差异。"**

### 单 scope 查询（最常见 case）

主 agent 直接执行四阶段 pipeline。LLM 通过 `switch_scope` 工具主动切换（如果需要）。无 subagent 开销。

### 多 scope 查询

主 agent 作为路由器+编排器+最终汇总：
- LLM 调用 `delegate_query(scope_id, question)` 委派查询到 subagent
- subagent = `spawn-in-process`（不继承父上下文，独立 session）
- 切分点 = **UNDERSTANDING + GENERATION + EXECUTION**（scope-specific 阶段由 subagent 执行）
- INTERPRETATION 留在主 agent（跨 scope 汇总 + 保留对话记忆供多轮追问）

### Harness 兜底

1. pre-step alias 检测：scope metadata aliases 匹配用户消息；LLM 未 switch → inject hint
2. 多 scope 自动拆分：检测多 scope 匹配 → LLM 未 delegate → inject "建议分别查询"
3. scope 切换后 state cleanup：自动 reset phase-gate 脏状态（last_sql/candidate_tables/event_params）
4. F2 same-source gate reset：scope 变更时清除 cached SQL

### 工具设计（概要）

- `list_scopes` — 返回可用 scope 列表+描述（或注入 system prompt）
- `switch_scope(scope_id)` — 单 scope 场景切换 active scope
- `delegate_query(scope_id, question)` — 多 scope 场景委派查询到 subagent

### Scope 管理

作为 DSH 插件，管理员在设置中 CRUD scope。管理员维护的 scope 描述性 metadata = 同时服务于管理界面和 LLM 路由决策。

### 行业调研支撑（2026 H2）

- **Databricks Genie One (2026 GA)**：统一入口→自动搜索匹配 Agent→"switch agents without losing context"→会话内可改 context/tables
- **Microsoft Fabric Data Agent (2026 GA)**：单 Agent ≤5 源→"Data Source Routing" GA→自动路由到正确源
- **Solix (2026 Preview)**：Cross-application question routing
- **行业共识**：跨源 JOIN 无人做；同会话路由到不同源独立执行 = 前沿标准

### 技术调研支撑

- corpus 重建：动态 getter + lazy rebuild（K11 ~100ms，X63 ~10ms），零额外 LLM round-trip
- `PhaseGateState.scope_id`：dead field（保留为 informational）
- `SQL_CONVENTIONS`：硬编码 K11 view，需从 conventions seam 动态注入
- subagent spawn：`spawn-in-process` 基础设施 <10ms；子 agent 无父历史 = token 更省
- scope singleton：subagent 用 per-call scopeId 参数，不依赖 global active

### 遗留后续 ticket

- P-DA4（待建）：scope routing 工具实现 + harness 兜底 hook
- phase-gate SQL_CONVENTIONS 动态化（待建）
- phase-gate scope-aware state reset（待建）
- scope metadata aliases 扩展（待建）
- subagent scope binding 机制（待建）

## 现状（事实）

1. **P1 管道已通**：`ctx.schema.semanticRoot` / `ctx.schema.scopeId` 代理到 `ctx.scopes.active()`；`scopes/active-changed` 事件触发 `invalidateCaches`；corpus 按 active scope 重建。
2. **无自动路由**：`cordis.patch.yml:143` 注释明确："per-query/per-tenant scope selection is a process-global active-scope switch today — **not automatic per question**"。
3. **K11 硬编码回退**：
   - `packages/bundle/data-agent/cordis.patch.yml:162` — `semanticRoot: ./examples/k11-semantic-layer`
   - `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` phase-gate config — `scopeId: game-1`
   - `packages/data/phase-gate/src/types.ts:315` — `freshPhaseGateState(scopeId = 'game-1')` 默认值
4. **scope-registry 运行时**：`~/.dsh/data/scopes.yaml` 存储注册的 scopes + active id。
5. **phase-gate state 的 scope_id**：dead field（逻辑不消费），保留为 informational。

## 约束

- 不依赖外部分类器——LLM 自评复用 UNDERSTANDING 既有调用（不加额外 round-trip）。
- 兼容 multi-scope 注册。
- additive-only（不改 core）。

## Out of scope

- P9 access isolation。
- 跨 scope 联合查询引擎（JOIN）。
- Scope CRUD UI——已有 W5。
