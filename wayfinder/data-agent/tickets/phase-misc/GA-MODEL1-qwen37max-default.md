# GA-MODEL1 — 切 qwen3.7-max 为默认 eval/生产模型

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EXP4 交叉验证](GA-EXP4-qwen37max-en-prompt-crossval.md)（2026-09-03）
**Blocked by**: 无
**Blocks**: GA-GT3（eval 基线依赖）、GA-GRILL2 Kind 1 重新评估（前提）

---

## 背景

GA-EXP4 证明 qwen3.7-max 在所有指标上显著优于 qwen-plus：

| 指标 | qwen-plus | qwen3.7-max | 差异 |
|------|-----------|-------------|------|
| 中文 pass rate | 72.0% | 88.1% | +16.1% |
| 英文 pass rate | 31.0% | 85.1% | +54.1% |
| EN B-A delta | -41.1% | -3.0% | 退化几乎消除 |

模型升级是当前最大的质量杠杆，且是后续所有工作（GT3 eval 验证、Kind 1 i18n）的前置条件。

## Question

将 qwen3.7-max 切为默认 eval 和生产 LLM 模型，需要做哪些变更和验证？

## 工作清单

### 1. 配置变更

- [ ] eval-cli: 更新 README 中的示例命令和基线数据（当前基线 76.8% @ qwen-plus → 预期 ~88% @ qwen3.7-max）
- [ ] eval-cli: `EVAL_LLM_MODEL` 环境变量文档更新
- [ ] 生产配置（如有）：DashScope 模型路由确认 qwen3.7-max 可用性
- [ ] 确认 qwen3.7-max 的成本/延迟/并发限制是否可接受

### 2. Eval 基线验证

- [ ] 用 qwen3.7-max 跑一轮完整 eval（168 cases × pass@3）作为新基线
  - EXP4 ARM A 已有数据（88.1%），可直接复用为新基线
  - 或重跑一轮确认可复现性
- [ ] 对比 per-intent、per-complexity breakdown 确认无意外回归
- [ ] 更新 eval-cli README 基线表

### 3. 成本/延迟评估

- [ ] 对比 qwen-plus vs qwen3.7-max 的：
  - 单 case 平均延迟（EXP2 A 78s vs EXP4 A 需测量）
  - token 消耗（如 DashScope 提供 usage 数据）
  - 并发限制（当前 concurrency=3 是否仍适用）

### 4. 文档更新

- [ ] eval-cli README 基线表更新
- [ ] wayfinder map Notes 中的模型参考更新

## 成功标准

1. qwen3.7-max 成为默认 eval 模型（环境变量 / 文档 / CI 配置）
2. 新基线 pass rate 记录在 eval-cli README（预期 ~88%）
3. 成本/延迟在可接受范围内（或标注 tradeoff）
4. 不引入任何代码回归（tsc + vitest 绿）
