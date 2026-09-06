---
type: bug
status: closed
blocked_by: []
---

# CB-1b: pwsh 在 PTY 下不 evaluate 表达式（GitHub macOS runner）

**Branch**: `fix/cb1b-pwsh-pty-evaluation`（本票本身未产出代码；同分支只落了 [CB-5](CB5-da-ci-upstream-boundary.md) 的 ②）

**来源**: CB-1a session（2026-09-06）darwin-parity 调查。

## 关闭理由：上游代码，不在 DA 范围

**决策（2026-09-07）**：本票 3 个失败测试**全部位于上游 dsh 代码**，且触发它们的配置值也是上游的。按"dsh-data-agent 的 CI 只检查额外增加的非上游内容、不应影响上游"的原则，**DA 不修**。根因已查清并记录在下，作为**给上游提 issue 的材料**。

归属核实（`git cat-file -e upstream/master:<path>`，upstream = `deepseek-ai/deepseek-harness`）：

| 失败测试 | 归属 |
| --- | --- |
| `packages/terminal/terminal-bash/tests/local.spec.ts`（pwsh ×2） | UPSTREAM |
| `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` | UPSTREAM |
| `idleSilenceMs: 300` 这个值本身 | UPSTREAM（`upstream/master:local.spec.ts` 第 288/320 行原样如此） |

## 根因（已查清，与原票定性相反）

**原票写的"pwsh 在 PTY 下 echo 输入但不 evaluate"是错的。pwsh 求值正常 —— 是 harness 在 300ms 静默后就停止监听。**

`LocalPtySession.pollReadiness`（`packages/terminal/terminal-bash/src/session.ts`）有三条 settle 路径：

1. **prompt marker**：`promptSeen && promptTextSeen && idleFor >= pollIntervalMs && foreground.pgid === shellPgid` → `stdin_read`
2. **exact probe**：`elapsed >= exactProbeAfterMs && acceptsStdinWait` → `stdin_read`
3. **静默兜底**：`idleFor >= idleSilenceMs + handoffGrace` → `inferred_idle`

**关键事实**：`MacProcessInspector.isStdinWaiting()` 在 `packages/subprocess/subprocess-local/src/process-inspector.ts:342` **硬编码 `return false`**（Linux 版走 `/proc/<pid>/task/<tid>/syscall`，macOS 无 `/proc`）。所以**路径 2 在 darwin 上结构性不可达**，只剩路径 1 和 3。

而 `handoffGrace = promptSeen ? handoffGraceMs : 0`（`session.ts:459`）—— pwsh 在 echo 之后还没吐出任何东西时 `promptSeen` 为 false，grace = 0，于是在**平直的 300ms** 后 settle 成 `inferred_idle`，viewport 里只剩被 echo 的输入。

**证据链**（run `34037360903`，#36 的 pip 步骤之前、测试真的跑起来的那一次）：

- test 1 报 `Expected: "stdin_read" / Received: "inferred_idle"` —— 兜底路径吃掉了 prompt 路径。
- test 2 的 viewport 只有 echo，**既没有结果也没有随后的 `dsh> ` 提示符** → 那 300ms 窗口里 pwsh 什么都没吐。
- 3 个失败测试用的是**同一套** `idleSilenceMs: 300 / handoffGraceMs: 300`（`local.spec.ts:288,320` + `loader-composition.spec.ts:93,94`）。
- 同一 runner 上 bash 测试用同样的知识**通过**（bash 快，marker 及时到）。
- Linux 上这些测试过，因为 `isStdinWaiting` 提供了真实就绪信号。
- `loader-composition` 那个跑了 25374ms 才失败，与"慢"一致。

## 旁证：上游同一文件里已有更宽的界

`upstream/master:packages/terminal/terminal-bash/tests/local.spec.ts` 里其它测试用的是 `idleSilenceMs: 5_000`（第 151 行）和 `10_000`（第 244 行），默认值是 `250`（第 69 行）。只有 pwsh 这两处是 `300`。而**把界调大在通过路径上不花时间** —— 路径 1 在 prompt 到达后约一个 `pollIntervalMs` 就 settle，界只决定兜底等多久。所以调大是符合该文件自身惯例的低风险改动。

## 给上游的建议（DA 不落地）

1. 把 pwsh 两处的 `idleSilenceMs` 提到与同文件其它慢测试一致的量级（5_000），保留 `stdin_read` 断言 —— 那才是真正要证的契约（prompt-based 就绪），现在它被兜底路径抢先。
2. 可选、更根本：给 darwin 实现 `isStdinWaiting`。**已排除廉价做法** —— macOS 上 `ps -o wchan=` 返回 `-`（本机实测），需要原生 `libproc`（`proc_pidinfo`）才能拿到线程 wait channel，成本远超收益。

## 未验证的残留风险

无法在本 fork 内验证的一点：**pwsh 的 OSC `133;D` marker 在 darwin 上到底能不能被检测到**。若根本检测不到，则调大界只会让测试变慢且仍挂在 `stdin_read` 断言上。区分这两种情形需要真机 pwsh（本机无 pwsh，`describe.skipIf(!hasPwsh)` 静默跳过整个 pwsh 面）。

**为什么本 fork 验证不了**（决定了这条只能上游做）：

- `sandbox.yml` 只有 `push: branches: [master]`，无 `workflow_dispatch` → PR 上跑不到。
- `ci.yml` 的 `serial-macos` 是 `if: false`（第 575 行）。
- `landlock-run.yml` 的 `darwin` job 不跑这些单测（只做 degradation proof）。

## 关键文件（上游）

- `packages/terminal/terminal-bash/src/session.ts`（`pollReadiness` 三条 settle 路径 + `handoffGrace` 只在 `promptSeen` 时生效）
- `packages/subprocess/subprocess-local/src/process-inspector.ts:342`（`MacProcessInspector.isStdinWaiting` → `return false`）
- `packages/terminal/terminal-bash/src/index.ts:90`（`PWSH_PROMPT_SETUP`，pwsh 的 marker 注入）
- `packages/terminal/terminal-bash/tests/local.spec.ts:288,320`（`idleSilenceMs: 300`）
- `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts:93,94`（同上）

## 关联

- [CB-1a](CB1a-cold-boot-stabilization.md) —— 本票的来源；其 Resolution 里"pwsh 3 deferred to CB-1b（terminal-bash pwsh-in-PTY bug）"的定性需按本票更正。
- [CB-5](CB5-da-ci-upstream-boundary.md) —— 本 session 真正落地的东西：DA 与上游 CI 的边界，以及 darwin 腿上那串安装步骤的由来。
