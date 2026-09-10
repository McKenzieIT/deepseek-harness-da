# R24 — eval 包级合并可行性调研

**Type**: research（AFK，仓库取证）  ·  **Direction**: 1（执行级评分 + 非循环 GT 溯源）  ·  **Status**: claimed 2026-09-08（mckenzie）
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Branch**: `grilling/R1-G1-v3-independent`（主工作区）
**Blocked by**: 无
**Blocks**: [G1 — Execution grader seam](G1-exec-grader-seam.md) 的 D2（重构边界）
**产物**: `../research/eval-package-consolidation.md`

---

## Question

`packages/eval/` 现有 4 个包，判分能力三重分叉：`CtxQueryExecutor`/`LlmJudgeExecutor` 两份（`eval-cli` 与 `eval-runner-service` 各一）、结果比较器两份（`dsh-eval` 库内被单测覆盖的那份 + `eval-runner` 私有包装器）、失败分类（`infrastructure/timeout/patience`）只有一份且**无非测试调用点**。`eval-cli` 还直接依赖具体 provider `@deepseek-ai/dsh-query-maxcompute`，与 evaluation 只消费 query capability 的既定职责相冲。

G1 的 D2 需要在两条边界间选择：**只去分叉、不动包边界**，还是**连包结构一起重组**（`eval-runner` 并回 `dsh-eval`、CLI 只留薄壳、service 复用同一 runtime）。本票为后者提供可行性证据，不做决定。

## 需要回答

1. **符号级依赖图**：4 个 eval 包之间实际互相 import 了哪些符号；`packages/eval` 之外还有谁 import 这些包（含 `scripts/`、`examples/`、`apps/`、snapshot/e2e 测试、其它 `packages/*`）。
2. **死面清点**：`dsh-eval` 中哪些导出没有非测试调用点；`eval-runner` 中哪些实现与库内实现重复。
3. **合并会撞上什么**：循环依赖、`package.json` exports、tsdown 打包、tsconfig 工程边界与 face 配置、`pnpm run hygiene`（knip + publint + workspace constraints + NodeNext consumer check）、`test:coverage` 的 per-file 100% 要求。
4. **规模估算**：需移动的文件/loc、需改的测试、snapshot 与 e2e 影响面。
5. **与另一方向的重叠**：另有一张架构票要把 case set 从 runner 里移出、使 runner 与具体 benchmark 无关（benchmark / harness / environment 三分）。合并方案是**为它铺路**还是**与它冲突**。
6. **可行性判定 + 迁移次序**：若可行，给出可分步验收的最小次序；若不可行，指出哪一条约束是硬墙。

## 成功标准

每条结论带 `文件:行号` 或可复现命令；明确区分"已验证"与"未能确定"；不读 `wayfinder/**` 与 `.agents/notes/**`（与既有结论保持独立）。
