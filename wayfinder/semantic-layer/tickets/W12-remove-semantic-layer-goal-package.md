# W12 — 删除过时 `semantic-layer-goal` 包

**Type**: task（cleanup）
**Status**: Resolved (2026-08-25, commit 7337407981)
**Blocked by**: —（无前置）

## 背景

`packages/data/semantic-layer-goal/` 是一个预研性设计，晚于真实架构落地。其全部职责已被以下已发布包覆盖：

| semantic-layer-goal 组件 | 已落地替代 |
|---|---|
| `GoalRoundDriver`（命令式状态机） | `@deepseek-ai/dsh-goal-round-driver`（事件驱动，base bundle 挂载） |
| `NoProgressDetector`（纯函数检测器） | `@deepseek-ai/dsh-goal-eval-policy`（Cordis 插件，data-agent bundle 挂载） |
| `EvalEvidence` 反馈机制 | `@deepseek-ai/dsh-goal-eval-context`（系统提示词节，data-agent bundle 挂载） |
| `eval-runner-types.ts` 类型镜像 | `@deepseek-ai/dsh-eval-runner`（直接导入，类型已稳定） |
| `ManagementAgentToolset` 接口 | `semantic-layer-management` 预设 + 各 `tool-*` 独立注册 |
| B→A Evolution | W6d（独立 ticket） |

该包零外部消费者（grep 确认）、架构模式不兼容（命令式 vs 事件驱动）、类型镜像已过时。

## 范围

1. 删除 `packages/data/semantic-layer-goal/` 目录（含 src/、tests/、lib/）
2. 从 `tsconfig.host.json` 移除该包的 references 条目
3. 运行 `pnpm install` 更新 lockfile
4. 确认 `npx tsc --build` 通过
5. 确认无其他包 import 该包（grep 已确认无外部消费者）

## 验收

- [ ] `packages/data/semantic-layer-goal/` 不存在
- [ ] `tsconfig.host.json` 无该包引用
- [ ] `pnpm install` 成功
- [ ] `npx tsc --build` 干净
- [ ] 全量 vitest 无新增失败

## 参考

- 审计发现：该包 0 消费者、重复 goal-round-driver / goal-eval-policy / goal-eval-context 职责
- W6（③ 自驱循环决议）、W6a（policy）、W6b（context）、W7（management preset）
