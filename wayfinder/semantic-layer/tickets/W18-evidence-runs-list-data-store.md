---
type: task
status: open
blocked_by: []
---

# W18: evidence-query runs-list/delta data-store 对齐 — evalRunCount ≠ runs-list

**Branch**: `fix/w18-evidence-runs-list-data-store` <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

## 背景（W16 浏览器测试发现，2026-09-05）

W16 PR #14 浏览器实测发现：`evalRunCount`（`getEvalRunCount`）= 3（auto-flip 触发 → DashboardView A 渲染），但证据面板的 runs-list（`evalResultQuery`）显示 "No eval runs recorded" + "No delta available (needs at least two runs)"。**count 与 runs-list 不一致**。

测试条件：把主 worktree 的 3 个 eval JSONL（`.tmp/eval-results/`，2026-08-25 的 3 个 runId）复制到 dsh-W16 worktree 的 `.tmp/eval-results/`，重启 `dsh web`（让 FileBackedEvalResultStore 重读）。

## 问题

- `getEvalRunCount` 读 `.tmp/eval-results/`（W3 JSONL）→ 3（数文件）→ auto-flip（阈值 3）触发。
- `evalResultQuery`（runs-list）+ `beforeAfterDelta(runIdA, runIdB)`（delta）返回空。
- 可能根因（待 trace）：
  1. runs-list 读**另一个 store**（如 `eval-results/` .json，而非 `.tmp/eval-results/` JSONL）—— count 与 runs-list 读不同 store。
  2. 或 count 数**文件**（3），runs-list **解析 JSONL 内容**成 runs（3 个 JSONL 内容未被解析 → 空）—— 解析配置/格式问题。
  3. 或 runs-list 的查询参数（filters）默认过滤掉这些 run。

## Task

1. trace `FileBackedEvalResultStore`（W4，`packages/data/evidence-query/src/`）的 `evalResultQuery` + `beforeAfterDelta` + `getEvalRunCount`——各自读哪个 store、怎么解析 JSONL。
2. 对齐 `getEvalRunCount` 与 `evalResultQuery`（同一 store + 同一解析），让 count=3 时 runs-list 也显示 3 runs + delta 可算。
3. 验证：3 个 eval JSONL → runs-list 显示 3 runs + `beforeAfterDelta(runIdA, runIdB)` 返回真实 delta。
4. 浏览器实测：EvalTrajectory 显示 runs + EvalDeltaView 显示 delta。

## 不是 W16

W16（客户端 remote）已验证：`evidenceClient` 非 null → 证据面板能渲染 + auto-flip 能触发。本票是 service/data-store 配置（W4 域），不是客户端 remote。

## 验收

- 3 个 eval JSONL → `evalResultQuery`（runs-list）返回 3 runs。
- `beforeAfterDelta(runIdA, runIdB)` 返回真实 delta（非空）。
- 浏览器实测：EvalTrajectory 显示 runs + EvalDeltaView 显示 delta（不再 "No eval runs recorded"）。
