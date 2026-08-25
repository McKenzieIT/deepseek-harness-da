# W6e — Management agent persona ③ 演进

**Type**: task
**Status**: Closed
**Blocked by**: W6b

## Question

更新管理 agent preset 使其适配 ③ 自驱循环模式。

## 规格

### Persona prompt 演进

当前 persona（G5/W7 设定）面向 **人驱管理**（v1 ②）。③ 模式下 persona 需增加：

1. **Eval evidence 解读指引**：
   - 告知 model `<eval_evidence>` block 的存在和含义
   - 指导 model 根据 delta 调整方向（improved → 继续；no improvement → 换方向/分析 regressed cases）
   - 明确 block 时机（当自己判断无法进一步改进时，标记 blocked + reason）

2. **自驱循环行为规范**：
   - 每轮应有明确可衡量的改善目标（不做无目标的 exploration）
   - 改动后应触发 eval 验证效果（不盲改）
   - 连续无改进时分析 regressed/failed cases 而非重复同一策略

3. **Tool 使用指引增补**：
   - `trigger_eval`：改动后验证效果的核心 tool
   - `get_goal`：每轮开始时读取当前目标状态
   - `update_goal(blocked)`：当确认无法进一步改进时使用

### Tool 激活状态

当前 preset 中的 tool 状态：
- ✅ 已活跃：search_schema, get_definition, list_domains, get_coverage, discover_relations, tool-goal, trigger_eval
- ⬜ 待激活：`edit_definition`（③ 模式必需——agent 需要能实际修改定义才能推进 goal）
- ⬜ 待评估：`execute_metric`（若 ctx.query 可用）

**edit_definition 激活前提**：
- Tier-2 audit 已有基建（G4 Q5 决议）
- Agent 写入标 `unreviewed`（G3 决议）
- 无 draft/publish 流程（G4 Q5 决议）
- 需确认：edit_definition 包是否已实现？若未实现则为本 ticket 的新包开发

### Config 演进

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      [③ mode persona — 含 eval evidence 解读 + 自驱行为规范]
```

不改 plugin 代码——仅更新 config text。

## 验收

- [ ] Persona prompt 包含 eval evidence 解读指引
- [ ] Persona prompt 包含自驱循环行为规范
- [ ] edit_definition 在 preset 中激活（或确认阻塞原因并记录）
- [ ] Model 在 goal round 中能正确解读 `<eval_evidence>` 并据此行动
- [ ] 测试：persona 文本注册正确
