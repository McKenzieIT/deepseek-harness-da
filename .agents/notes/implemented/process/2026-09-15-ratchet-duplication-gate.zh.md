# Agent Note: 从既有基线开始收紧 duplication 门禁

Status: implemented

[English](2026-09-15-ratchet-duplication-gate.md) | 中文

## 问题

原 duplication 门只要 jscpd 发现任意 clone 就非零退出，但 workflow 修复后的首次有效 CI 在 `packages/` 和 `scripts/` 中发现了 89 个既有 clone。相同结果可以在 `origin/master` 上复现，因此无关拉取请求无法让门禁变绿。语料还包含根目录 `scripts/**/*.spec.ts`，尽管已有的 `**/tests/**` 已表达测试重复不属于这道生产代码门禁。

## 决策

jscpd 语料排除 `**/*.spec.ts` 和 `**/*.spec.tsx`，继续扫描生产 TypeScript、TSX 组件、仓库脚本和类型声明。排除根级 spec 后减少两个 clone；保留语料报告 87 个 clone，在 404,202 行中有 1,364 个重复行，即 0.337455%。门禁使用 jscpd 原生 `threshold` 0.338%，这是高于实测基线的最小三位小数上限；同时移除 `exitCode`，因为该选项会在 threshold 生效前让任意 clone 直接失败。

这个百分比是棘轮，不是对既有重复的认可。每次报告继续展示所有 clone，生产类型声明和组件样板仍属于可治理债务；任何降低实测比例的清理都应在同一变更中下调 threshold。当前语料留下的空间小于一个最小六行 clone，因此负向控制夹具会越过阈值并非零退出。若未来语料增长使百分比稀释成为实际问题，[T16](../../../../wayfinder/repo-infra/tickets/T16-duplication-gate-89-clones.md) 要求用稳定的 clone 基线比较器替换原生 threshold，而不是放宽上限。

## 考虑过的替代方案

**在恢复 CI 前重构全部既有 clone。** 保留的 87 个 clone 分布在互不相关的 UI、数据、LLM、评估和仓库脚本所有者中。把它们合并进一个门禁修复 PR 会引入广泛的行为风险、模糊各包责任，并让后续 CI 门继续被 fail-fast 遮蔽。

**排除类型声明或 TSX 组件样板。** 两者都可能揭示真实的所有权漂移或缺失的共享 primitive，因此宽泛排除会丢失有用信号。只排除与现有 `**/tests/**` 规则一致的测试 spec。

**关闭非零退出或设置宽松阈值。** 这会把门禁退化为信息报告。0.338% 上限在实测基线上方保留了极小空间，继续提供阻断信号。

## 后果

拉取请求不再仅因继承当前 clone 清单而失败，同时新增重复不能消耗超过刻意保留的极小空间，否则门禁仍会失败。报告继续列出债务，后续简化可以同时降低 clone 数和 threshold。这道门仍是聚合百分比检查，而不是精确 clone 指纹；只有实测语料增长使新 clone 能隐藏在阈值下时，才值得引入后续比较器。
