# P-DA4 — Scope routing 工具 + harness 兜底

**Type**: prototype
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无硬阻塞；G-DA5 已 resolved 提供设计方向。
**Blocked by**: 无
**Related**: [G-DA5](G-DA5-per-question-scope-routing.md)（resolved，设计决策），[P1-per-scope-config](../../semantic-layer/tickets/P1-per-scope-config.md)（resolved，scope-registry 基础设施），[P9](../phase-2/P9-admin-access-isolation.md)（resolved，admin/access）

## Question

G-DA5 确定了"LLM 工具自决 + harness 兜底"的 scope 路由方案。本票实现具体工具和兜底机制：

1. **`list_scopes` / system prompt 注入**：LLM 如何获知可用 scope 列表？工具 call vs system prompt 静态注入 vs 两者兼有？
2. **`switch_scope(scope_id)` 工具**：单 scope 切换的 model-facing tool 设计——参数、返回值、副作用（`ctx.scopes.setActive` + state cleanup）、phase-gate 何时 reset。
3. **`delegate_query(scope_id, question)` 工具**：多 scope 委派——subagent 启动参数、subagent 拿到什么 context（scope binding 而非 global active）、返回值契约（QueryOutcome? 结构化 JSON?）、与 phase-gate 的关系（subagent 有独立 phase-gate 还是跳过 gate？）。
4. **Harness 兜底 hook**：pre-step alias 检测挂载点（`agent/pre-step`? `question/start`?）、匹配算法（case-insensitive substring? word-boundary?）、检测到未 switch 时的 inject 机制（system prompt section? tool result injection?）。
5. **Scope metadata aliases 扩展**：`scopes.yaml` metadata 加 `aliases` 字段、scope-registry 是否需要 API 变更、管理员如何配置。

## 约束

- additive-only（不改 core agent-loop / session / scope-registry API）
- 工具通过 `defineTool`（dsh-tools）注册，作为独立包 `packages/data/tool-scope-routing/` 或类似
- subagent 使用 `spawn-in-process`（不继承父上下文）
- harness 兜底不能 block 强模型的自主路由能力（只 inject hint，不强制）
- 兼容 N 个 scope 注册

## 设计方向（G-DA5 决策）

- 单 scope：主 agent 直接执行，`switch_scope` 切换
- 多 scope：主 agent dispatch `delegate_query` → spawn subagent per scope → 返回结果 → 主 agent INTERPRETATION
- 兜底：pre-step alias 检测 → inject hint（弱模型 fallback）
- scope 描述 metadata 双重用途：管理 + LLM 路由

## 待 grill 的细节

1. `delegate_query` 的 subagent 如何获得 scope context？
   - (甲) subagent 的 system prompt 中注入该 scope 的完整 config（event_view、conventions 等）
   - (乙) subagent 仍走正常 pipeline 但 `ctx.scopes.active()` 被覆写为指定 scope
   - (丙) subagent 接收 `semanticRoot` 参数，直接使用该 scope 的语义层

2. `delegate_query` 返回什么？
   - (甲) QueryOutcome 原样（columns/rows/error）
   - (乙) 结构化摘要（subagent 自行 INTERPRETATION 后的文本）
   - (丙) 两者都有（structured + text）

3. harness 兜底 inject 的形式？
   - (甲) system prompt section（每轮更新）
   - (乙) 模拟一个 tool result injection
   - (丙) agent/pre-step decision 中 inject 用户消息前缀

4. 多 scope 检测后如果 LLM 仍只查单 scope（忽略了 hint）怎么办？
   - (甲) 允许——harness 只建议不强制
   - (乙) 二次 inject 更强烈提示
   - (丙) harness 自动帮 spawn 另一个 scope 的查询

## Resolution

见 `prototypes/p-da4-scope-routing/RESOLUTION.md`。

核心决策：`delegate_query` **不是 subagent**，而是直接调用 `Nl2sqlEngine`（纯函数式 NL2SQL 引擎）。每次调用创建独立的 engine 实例，传入目标 scope 的 corpus/conventions/retrieval linker。天然并行安全、无 clarify 路径、不改全局状态。

关键依据：
1. eval-cli (`packages/eval/eval-cli/src/context.ts`) 已证明可行
2. Cordis Service 是全局单例（同进程子 agent 共享 `ctx.schema`，无法原生隔离）
3. `Nl2sqlEngine` 是纯函数，只需 `Llm` + `OdpsExecutor` + `RetrievalLinker` 三个接口
4. 2026 H2 行业趋势：确定性计算留给 subagent/worker，用户交互留在主 agent

后续：E-DA4 实验验证端到端可行性。

## Out of scope

- P9 access isolation（per-token 权限检查）
- 跨 scope JOIN 引擎
- Scope CRUD UI（已有 W5）
- phase-gate SQL_CONVENTIONS 动态化（→ P-DA4b）
