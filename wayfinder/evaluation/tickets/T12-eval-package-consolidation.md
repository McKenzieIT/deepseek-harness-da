# T12 — eval 包级重组（eval-runner 并回 dsh-eval）

**Type**: task（impl，AFK；走 SPEC→instruction+rubric→另一环境，见 [playbook](../playbook.md)）  ·  **Direction**: 1
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Status**: open（题面需在 G10 解后重定）
**Blocked by**: T1-exec-grader-impl（先完成 [G1](G1-exec-grader-seam.md) D2 的去分叉）+ G10-harness-bhe-split（它会重新切同一批包）
**Blocks**: 无
**证据**: [R24 — eval 包级合并可行性](../research/eval-package-consolidation.md)；两篇先行 Agent Note：[delete-unused-eval-core-runtime-stack](../../../.agents/notes/proposed/simplification/2026-09-03-delete-unused-eval-core-runtime-stack.md)（core 死编排该删）、[promote-eval-cli-adapters](../../../.agents/notes/proposed/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md)（两份 adapter fork 该退役）——二者描述的删除已归 [G1](G1-exec-grader-seam.md) D2 的 T1 验收项，本票只管**包边界**。

---

## Question

在 T1 完成"一能力一实现"的去分叉、且 G10 定下 benchmark / harness / environment 的切分之后，`packages/eval/` 的**包边界**是否应重组——具体是把 `dsh-eval-runner` 并回 `dsh-eval`、让 CLI 与 Cordis service 成为共享同一 runtime 的两个薄 host。

**本票开出时的已知结论**（R24）：合并**有条件可行**，无循环依赖，且与 benchmark-agnostic 目标一致而非冲突（`eval-runner` 的 `runBatch` 已只接受通用 `Collaborators`）。

**为何 blocked 而非现在做**：G10 会把 case set 移出 runner、使其与具体 benchmark 解耦，这会重新划定同一批包的边界。先合并再被 G10 重切等于 churn 两遍，且两票可能互相推翻。**T12 的题面必须在 G10 解后重定，届时"是否还需要合并"本身可能已改变答案。**

## 若执行，必须同步更新的面（R24 已定位）

- 仓外消费者：`packages/data/tool-trigger-eval`（`src/index.ts:17` 类型导入 + `tests/trigger-eval.spec.ts:3` + `package.json`）、`packages/goal/goal-eval-policy`（`package.json`；运行时 `ctx.get('evalRunner')` duck-typing）、`packages/data/patrol-mode`（依赖 `dsh-eval-runner-service`）、`python/sdk-runtime/package.json:149`、`scripts/live-verify-w1-w5.ts:19-21`。
- 工程面：各包 `package.json` 的 `exports`、各 `tsconfig.json` 的 project references、`tsconfig.base.json:301` 的路径映射、`knip.json:395-418`、`tsdown.config.ts:19`。
- 覆盖率门：当前"因无人调用而无测试"的代码并入在用包后会进入 per-file 100% 统计范围。

## 成功标准（待 G10 后重定）

包数减少必须换来可陈述的收益（少一层 re-export、少一处 exports 面、host 共享同一 runtime），而非仅仅目录变少；仓外 5 处消费者全部可编译且测试通过；`pnpm run hygiene` 与 `test:coverage` 全绿。
