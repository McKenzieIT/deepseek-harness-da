# W7 — 管理 agent preset

**Type**: task
**Status**: Closed
**Blocked by**: （无前置——可立即开始）

## Question

创建 `semantic-layer-management` agent preset 的 `agent.cordis.yml` 配置，使管理 agent session 启动后挂载正确的 tools、persona prompt 和 goal 默认参数。

## Scope

### cordis.yml 配置

参考 MODES.md §6（Agent preset composition）：在 `${DSH_HOME}/.agent-presets/semantic-layer-management/` 创建 `agent.cordis.yml`，内容包括：

1. **Tools 挂载**（9 个 tool rows）：
   - `search_schema`
   - `get_definition`
   - `list_domains`
   - `discover_relations`
   - `execute_metric`
   - `edit_definition`
   - `get_coverage`
   - `trigger_eval`（W3 提供）
   - `goal`

2. **Persona prompt section**：
   - 角色定义：语义层管理 agent
   - 目标：提升语义层质量（coverage、accuracy、completeness）
   - 工作方式：eval evidence 驱动决策
   - 与数据 agent 的区别：管理 agent 管理定义/结构，数据 agent 服务用户查询

3. **Goal 配置**：
   - `defaultMaxGoalRounds`：合理默认值
   - round prompt 模板（可选，v1 可用 goal 默认）

### 验证方式

- preset 目录存在且 `agent.cordis.yml` 格式正确
- 在 session 中 mount 该 preset 后，`ctx.tools` 包含上述 9 个 tool
- agent 启动时 persona prompt 注入正确

## 验收

- [ ] `semantic-layer-management/agent.cordis.yml` 存在且 loader 可解析
- [ ] preset mount 后 session 的 tool list = 9 个指定 tool
- [ ] persona prompt section 出现在 agent 系统消息中
- [ ] `npx tsc --build` 干净（若涉及 TypeScript）

## 参考

- G5 Resolution §1（管理 agent preset）、§4（Tool set）
- MODES.md §6（Agent preset composition）
- `packages/preset/README.md`（preset 契约）
- `docs/cordis-primer.md#loader-configuration`（row 配置语法）
