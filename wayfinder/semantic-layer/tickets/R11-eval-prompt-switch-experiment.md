---
type: research
status: open
blocked_by: []
---

# R11: eval 切换 buildEvalPrompt 实验

## Question

CL-19 根因分析发现 `buildEvalPrompt`（`prompt.ts:159-200`）已存在——无 tool catalog、无 agent persona、纯 SQL 生成——但 eval-cli 的 `Nl2sqlAgentResponder` 未使用它。需实验验证：将 eval promptBuilder 切换为 `buildEvalPrompt` 后，对 eval 结果的影响如何？

核心权衡：
- **收益假设**：消除 TOOL_CATALOG 触发的 tool-call 发射（CL-19 根因），对开放/模糊问题产生更合理的行为（纯 SQL 生成 or 直接报告候选不足）
- **风险假设**：改变评测标的——从测试 agent 行为（含 tool 理解、多阶段 SOP）变为测试纯 SQL 生成质量；`buildEvalPrompt` 缺少 §5 诚实拒绝规则、§3 复合判断门、§6 完整八规则（仅保留核心 8 条），可能影响复杂 case 质量

## 实验设计

### 变量

- **控制组**：当前 `buildPrompt`（含 TOOL_CATALOG + agent persona + 完整 SOP），即 CL-15 标准基线 run `10320fe2`
- **实验组**：`buildEvalPrompt`（无 TOOL_CATALOG，纯 SQL 生成 prompt）

### 实施

在 `context.ts` `Nl2sqlAgentResponder` 构造 engine 时：

```typescript
const engine = new Nl2sqlEngine({
  ...deps,
  promptBuilder: buildEvalPrompt,  // 替换 buildPrompt / buildPromptEN
})
```

注意 `buildEvalPrompt` 的 `BuildEvalPromptArgs` 与 `BuildPromptArgs` 签名不完全相同（缺 `eventDef`、`phase`、`today`），需确认 engine 传参兼容性或做适配。

### 观测指标

1. **Overall pass_rate**：与控制组（73.8%）对比
2. **分类别 delta**：Original / Alias / Voice EXEC / Voice DELIVERY 各自变化
3. **Case-level flips**：gained/lost 明细 + 归因（tool-call 消除 vs SOP 缺失导致退化）
4. **DELIVERY 特别关注**：voice_017/voice_042 是否因无 tool-call 发射而改善
5. **复杂 case 关注**：多表 join / 复合问题 / metric 路由——这些依赖 §3 SOP 的 case 是否退化

### 判断标准

- 若 overall ≥ 控制组 且 DELIVERY 显著改善：buildEvalPrompt 作为 eval 默认 prompt 的候选
- 若 overall 下降但 DELIVERY 改善：需权衡，可能仅对 DELIVERY case 使用
- 若 overall 和 DELIVERY 均下降：不采用，维持 CL-23 (a)+(b) 修复路径

## 验收

- 完成 full 168 case eval run（buildEvalPrompt）
- compare.ts 与控制组对比，记录到 `experiment-audit-log.md`
- 结论：是否采用 / 部分采用 / 不采用 + 理由
