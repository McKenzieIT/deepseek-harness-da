# GA-GT2-eval — prompt 引擎中性改写 eval 验证

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-GT2 D2 决策](GA-GT2-engine-abstraction.md)（规则 1/3 改写为引擎中性 + eval 验证约束）
**Priority**: high
**Blocked by**: [GA-GT2-impl](GA-GT2-impl-engine-abstraction.md)（需要 D2 代码改动先落地）

## Question

验证 prompt §6 规则引擎中性改写后，NL2SQL eval 无回归。

## 验证方法

1. 跑 eval-cli 全量（168 cases + sql-judge）
2. 对比 CL-15 基线（73.8% pass rate）
3. 用 `compare.ts` 分析 case-level flips
4. 如果回归 > 2pp（降至 < 71.8%），回滚 D2 改动并分析哪些 case 受影响

## 成功标准

- eval pass rate ≥ 73% (基线 73.8% 允许 ~1pp 波动)
- 无 category-level 大面积退化（任一类别 < -5pp 需分析）

## 关联

- GA-EXP2（prompt 语言实验）——如果 GT2-eval 发现引擎中性改写有回归，可能影响 EXP2 的实验设计
