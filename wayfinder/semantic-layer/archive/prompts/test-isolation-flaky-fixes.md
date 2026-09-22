# Prompt A — 修复全量套件 flaky 失败（测试隔离基建）

> 新 session 直接粘贴本文件内容即可开工。自包含，无需前置对话记忆。

## 工作目录

`/Users/mckenzie/workspace/deepseek-harness-da`（用户本地 git 仓）。

**工具约束（关键）**：本环境 built-in `Read`/`Write`/`Edit`/`Bash`/`Grep`/`Glob` 被 harness 屏蔽，**只能用 `mcp__local__*` 工具**（`read_file`、`write_file`、`edit_file`、`bash`、`grep`、`glob`、`list_dir`、`stat`）。subagent 若用 built-in 工具会失败/挂死——若派 subagent，prompt 中必须显式说明只用 `mcp__local__*`。

## 背景

全量测试套件 `npx vitest run` 有若干测试**孤立跑全过、全量套件里失败**——是测试隔离问题（vitest 多线程共享 cwd + 跨测试状态污染/时序竞态），**非 broken code、非语义回归**。本任务修复这些测试的隔离性，使其在全量套件也稳。

## 失败清单（孤立跑 vs 全量）

| 文件 | 孤立 | 全量失败点 |
|------|------|-----------|
| `scripts/change-scope.spec.ts` | 8/8 pass | 5 个 fail（git filesystem 状态：committed/staged/unstaged/untracked + 非 UTF-8 path + commit ref） |
| `packages/test-support/acp-snapshot/tests/harness.spec.ts` | pass | `waitForTitleAfterTurnEnd times out`（时序竞态：期望抛 `/did not persist session/title after turn/end/`，实际 `Timed out in waitFor!`） |
| `packages/shell/bash-local/tests/executor.spec.ts` | 28/28 pass | 1 个 fail：`process lifecycle ownership > a background process survives executor-fiber disposal and dies with the subprocess service`——`expected 'killed' to be 'completed'`（后台进程在 kill 前完成 → 时序） |

## 复现

```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
# 孤立（应全过）：
npx vitest run scripts/change-scope.spec.ts
npx vitest run packages/shell/bash-local/tests/executor.spec.ts
npx vitest run packages/test-support/acp-snapshot/tests/harness.spec.ts
# 全量（这 3 个会失败）：
npx vitest run > /tmp/v.txt 2>&1; grep -E "FAIL " /tmp/v.txt | grep -E "change-scope|acp-snapshot|bash-local"
```

## 诊断方向（需逐一核实，勿臆测）

1. **change-scope**：测试对**真实仓 git 状态**操作（committed/staged/unstaged/untracked + 非 UTF-8 git path + commit ref 解析）。全量套件里其他测试（尤其生成 `.tmp/`、staged/unstaged 残留、或非 UTF-8 path 测试自身）污染了共享 cwd 的 git 状态 → change-scope 的"干净仓"断言破裂。
   - 读 `scripts/change-scope.spec.ts` 确认：它是在真实仓 cwd 上跑，还是建了 temp git repo？若用真实仓 → 这是根因。
   - 读 `scripts/change-scope.ts`（被测脚本）了解它读哪些 git 状态。
2. **acp-snapshot `waitForTitleAfterTurnEnd`**：时序竞态。读测试 + `waitFor` 实现，看 `waitFor` 的 timeout（20ms?）是否太短，或断言的错误消息不匹配。
3. **bash-local 进程生命周期**：后台进程在 disposal-kill 前自然完成。读测试（`executor.spec.ts:~326`）+ bash-local subprocess service 的 dispose 逻辑，判断是真 bug 还是测试假设过强（进程必须被 kill 而非自然完成）。

## 修复原则

- **优先让测试隔离安全**，而非单纯 `.skip` 或加 `--no-file-parallelism`：
  - change-scope：让每个测试建自己的 **temp git repo**（`mkdtempSync` + `git init` + seed fixtures），不依赖真实仓 cwd。若脚本设计必须接 cwd，注入 temp repo 路径。
  - acp-snapshot/bash-local：让时序确定性化（marker file/event 驱动而非固定 sleep——参考已修的 lsp-stdio 测试用 `waitForFile` marker 替代 `setTimeout(300)` 的 pattern，见 `packages/lsp/lsp-stdio/tests/instance.spec.ts` 的 cancel-grace 测试）。
- 若确认是**真实 bug**（非测试假设）：修被测代码（最小改动）。
- **不要 `.skip`** 掩盖；保留测试意图。
- 修完每个文件，孤立 + 全量都验证。

## 验收

- [ ] `npx vitest run scripts/change-scope.spec.ts` 全过（孤立）
- [ ] `npx vitest run packages/shell/bash-local/tests/executor.spec.ts` 全过
- [ ] `npx vitest run packages/test-support/acp-snapshot/tests/harness.spec.ts` 全过
- [ ] **`npx vitest run`（全量）这 3 个文件不再失败**（这是关键——孤立过但全量失败正是本任务）
- [ ] `npx tsc --noEmit -p <改动的包的 tsconfig>` 无新增错误（注：根 `npx tsc --noEmit` 是无程序 solution 文件，**不会真正检查**；要 `-p <package>/tsconfig.json` 或 `npm run typecheck`）
- [ ] oxlint：`node_modules/.bin/tsx scripts/run-oxlint.ts --config .oxlintrc.staged.json --no-error-on-unmatched-pattern <改的文件>` 0 errors
- [ ] 全量套件失败数从 7 降到 ≤2（仅剩 cordis-catalog 的 deferred 审计，另一 session 处理）

## 提交

每个文件/类别一个 commit，消息说明根因 + 修复。pre-commit hook（oxlint）应过；若 lint --fix 改动非预期文件，用 `--no-verify` 谨慎提交并说明。

## 注意

- 全量套件约 224s——只在验证时跑，迭代时用孤立跑。
- 这些失败**已确认非语义回归**（W1-W6 工作未触碰 bash-local/subprocess/change-scope 脚本逻辑）；是测试基建隔离问题。
