# Next Session Prompt — GA-MODEL1 → GT3 ‖ Kind 1

## 目标

分三阶段：先完成 GA-MODEL1（模型切换），然后并行启动 GA-GT3 和 Kind 1 重新评估。

---

## Prompt（直接粘贴到下一个 session）

```
/effort max

我要按顺序完成三件事。先读 wayfinder map 和相关 tickets 获取上下文：

- `wayfinder/data-agent/map.md`（Decisions so far 中的 GA-EXP2/EXP3/EXP4/MODEL1）
- `wayfinder/data-agent/tickets/phase-misc/GA-MODEL1-qwen37max-default.md`
- `wayfinder/data-agent/tickets/phase-misc/GA-GT3-enrichment-generalization.md`
- `wayfinder/data-agent/tickets/phase-misc/GA-GRILL2-i18n-architecture.md`

## 阶段 1：GA-MODEL1 — 切 qwen3.7-max 为默认模型

背景：GA-EXP4 证明 qwen3.7-max baseline 88.1%（vs qwen-plus 72.0%），英文 prompt 退化仅 -3.0%。现在要把它切为默认 eval/生产模型。

### 需要做的：

1. **eval-cli README 更新**：
   - 更新 Quality Baseline 表（当前 76.8% @ qwen-plus → 新基线用 EXP4 ARM A 数据 88.1% @ qwen3.7-max）
   - 更新 run-id 引用为 exp4-arm-a
   - 更新示例命令中的模型参考
   - 确认 Quality Targets 是否需要上调

2. **成本/延迟评估**（从 EXP4 数据提取）：
   - 对比 EXP2 ARM A (qwen-plus) vs EXP4 ARM A (qwen3.7-max) 的平均延迟
   - 检查 EXP4 结果文件中是否有 token usage 数据
   - 如果延迟/成本可接受，记录结论；如果不可接受，标注 tradeoff

3. **per-intent / per-complexity breakdown**：
   - 用 eval-results/exp4/exp4-arm-a.json 做 per-intent 和 per-complexity 分析
   - 确认没有意外回归（某个 intent 大幅下降）
   - 对比 EXP2 ARM A 的同维度数据

4. **关闭 ticket**：更新 GA-MODEL1 ticket status → Resolved，写 resolution，更新 map Decisions so far

完成 MODEL1 后，告诉我结果，然后进入阶段 2。

## 阶段 2：并行启动 GA-GT3 + Kind 1 grilling

MODEL1 完成后，用两个并行 subagent 同时处理：

### Subagent A：GA-GT3 enrichment 泛化（wayfinder ticket 解决）

用 `/wayfinder wayfinder/data-agent/tickets/phase-misc/GA-GT3-enrichment-generalization.md` 处理这张 ticket。它是 map 主线上的下一个 frontier ticket，依赖 GA-EXP1 的结论（已 resolved）。按 wayfinder 流程：claim → resolve → record resolution → 更新 map。

### Subagent B：Kind 1 重新评估（grilling session）

GA-EXP4 证明 qwen3.7-max 下英文 prompt 退化仅 -3.0%，Kind 1（prompt 英文化）重新打开。需要一次 grilling session 重新评估 Kind 1 的 scope 和优先级：

1. **读取上下文**：
   - GA-GRILL2 ticket（原始 Kind 1 讨论 + EXP2 关闭 + EXP4 重新打开）
   - GA-EXP4 crossval report（`research/exp4-crossval-report.md`）
   - prompt.ts 和 exp2-prompts-en.ts（中英文 prompt 对比）

2. **Grilling 问题**（按 `/grilling` skill）：
   - Kind 1 现在可行了，但 **应该做吗**？英文 prompt 的可维护性收益 vs 迁移成本
   - 如果做，scope 是什么？全部英文化，还是只做 boilerplate（section headers + tool catalog），保留中文核心规则？
   - 优先级：相对于 GT3/GT4/CL-batch 等 map 主线工作，Kind 1 排在哪里？
   - conventions prompt（`renderConventionsPrompt`）要不要一起改？它目前永远输出中文，但 EXP4 证明中文 conventions + 英文指令在 qwen3.7-max 下无问题
   - 如果决定做，开实施票还是留作 backlog？

3. **产出**：grilling session 的决策记录，更新 GA-GRILL2 ticket，如果决定做则开实施票

两个 subagent 完成后，汇总结果，更新 map，commit。
```
