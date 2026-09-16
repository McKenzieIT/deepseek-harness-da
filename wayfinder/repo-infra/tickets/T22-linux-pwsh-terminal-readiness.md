# T22 — Linux coverage：terminal-bash pwsh 持久会话 motd 为空

**Type**: research
**Phase**: post-discovery
**Status**: open——root cause 已确认为 readiness 竞态，但**本票原先设想的 remedy 已被 PR #161 自身的 CI 推翻**（见下方「2026-09-16」一节）
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；证据取自 `node 24 / coverage` job 104635347140（PR #158 head `a386b9088c`，该分支只改 `upstream-monitor.spec.ts`，与本 spec 无关）

## Question

`packages/terminal/terminal-bash/tests/local.spec.ts:333`「bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: true)」在 Linux coverage 上失败：

```
AssertionError: expected '' to contain 'dsh> '
  packages/terminal/terminal-bash/tests/local.spec.ts:333:28
```

用例 spawn 一个持久 pwsh 会话后，立刻断言 `created.motd` 含受控提示符 `dsh> `。实到空串——PTY 尚未把提示符写出，`spawn` 就已返回。该 suite 通过 `hasPwsh` 探针 gate，只在装有 pwsh 的 runner（CI）上跑，因此这是 CI-only。

## 需要先判定的分叉

- 是 **readiness 竞态**：`spawn` 未等待可观测的提示符就绪信号（OSC `133;D;` marker 或受控 prompt），在争用 runner 上 PTY 落后于返回。
- 还是 **pwsh 启动被争用饿死**：8_000ms `timeoutMs` 在该 lane 争用峰值下不足以让 pwsh 完成 bootstrap。

判定前不要放宽 timeout。两个 case（`holdCommand` false/true）只有 true 分支报红，说明与 barrier 命令的时序交互可能相关，需在诊断中一并观察。

## Scope

1. 复现：本机若无 pwsh 则先取得 pwsh 环境，或用受控 PTY 延迟复现该竞态。
2. 让 `spawn` 的返回以可观测就绪信号为准（提示符 marker/受控 prompt），而不是靠固定时间或到达顺序推断 motd 已就绪。
3. 不接受放宽 timeout、加 retry 或改断言容忍空 motd。

验收：`node 24 / coverage` 连续两次真实运行对该 suite 全绿。

## 2026-09-16：root cause 已确认，remedy 已被推翻

### 已确认：是 readiness 竞态，不是启动被饿死

上面那条分叉可以合上了，判据是**耗时**：该用例在 job 104635347140 里**710ms** 就死了，而配置的 `timeoutMs` 是 `8_000`（`packages/terminal/terminal-bash/tests/local.spec.ts:330`），并且该 job **没有**任何 `did not reach readiness` 诊断。被饿死的启动会烧完 8 秒并以 readiness 超时报错；710ms 意味着 `spawn` **提前返回成功了**，只是 `motd` 是空串——断言 `expect(created.motd).toContain('dsh> ')`（`local.spec.ts:333`）随即失败。竞态，不是预算。

回归来源是 `4f3a47d792`（`fix(terminal-bash): handle terminal protocol replies`，改了 `src/index.ts` 57 行、`src/session.ts` 163 行）：pwsh 启动循环的跳出条件被换成裸的 `waitReason === 'stdin_read'`（现 `packages/terminal/terminal-bash/src/index.ts:143`），提示符检查被去掉了。

问题在于 `pollReadiness` 有**两个** `stdin_read` 生产者，只有一个带提示符证据：

- `packages/terminal/terminal-bash/src/session.ts:492-495`——要求 `promptSeen && promptTextSeen`，**带**提示符证据。
- `session.ts:501-503`——只要求 `elapsed >= exactProbeAfterMs && acceptsStdinWait`，而 `acceptsStdinWait`（499-500 行）取自 `foreground.inputWaiting`，即 Linux 的 `/proc` stdin 等待探针，**不带**任何提示符证据。

裸跳出条件把两者一视同仁，所以第二个生产者会在提示符写出之前就让启动返回。**这也正是它 Linux-only 的原因**：`isStdinWaiting` 在 macOS（`packages/subprocess/subprocess-local/src/process-inspector.ts:506-508`）与 Windows（`packages/subprocess/subprocess-local/src/windows-inspector.ts:96-98`）都是硬编码 `return false`，只有 Linux 实现（`process-inspector.ts:440`）真去读 `/proc`。

### 同时确认：`holdCommand` 不是成因——这推翻了本票原来的框定

本票原文说「两个 case 只有 true 分支报红，说明与 barrier 命令的时序交互可能相关」。这条框定不成立：PR #159 的 CI 失败的是 **`hold command: false`** 那一支。源码也直接证明它不可能是成因——`holdCommand` 第一次被读到是 `local.spec.ts:337` 的 `const barrier = holdCommand ? … : ''`，**在失败断言（333 行）之后**。两支的差异全部发生在断言已经失败之后，所以哪一支报红纯属调度运气。

### 已被推翻的 remedy：要求 `promptSeen && promptTextSeen` 使情况**严格变坏**

PR #161（现为 draft，head `cde9ef98c6`）把跳出条件改成必须同时具备 marker 与提示符文本证据。`node 24 / coverage` job **104659858116**：

```
× bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: false) 8150ms
× bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: true)  8150ms
× pins UTF-8 output encoding so non-ASCII output survives the byte decode
Error: PTY shell did not reach readiness before startup timeout
 ❯ Timeout.<anonymous> packages/terminal/terminal-bash/src/index.ts:166:23
```

（该栈帧行号属 head `cde9ef98c6`；在 current `origin/master` 上，pwsh 的那条绝对 deadline 拒绝在 `index.ts:158-161`。）

外加一个新的牵连伤亡：`packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` 的「preserves cwd and environment across calls」（78 行）报 `Test timed out in 120000ms`。

对比一下就知道这不是「修了一半」：改动前是**一个**用例在 710ms 快速失败、`pins UTF-8` 通过；改动后是**三个** pwsh 用例各自烧完整个 8 秒 deadline，再拖垮一个 120 秒的组合用例。

**结论：在该 runner 上，pwsh 拿不到被等待的 marker + tail 证据。** 既然那份证据不可达，把它设为跳出前提就等于把 deadline 判为胜者——这条路封闭，不要再走一遍。

### 下一次尝试的首要机制（已核实源码，但尚未由运行时观测证实）

`startSend` 在**每一次**发送时都无条件清空 readiness 证据：`session.ts:270` 的 `this.resetReadinessEvidence()`（该私有方法在 345-350 行，清掉 `promptSeen` / `promptTextSeen` / `promptTail` 并刷新 `lastOutputAt`）。`beginSend` 里那次二度清空（`session.ts:316`）反而是有守卫的，只在 `input.length > 0` 时发生。

而 pwsh 启动循环（`index.ts:132-144`）第一轮写入 `ENCODING_PREAMBLE + PWSH_PROMPT_SETUP`（`submit: true`），**其后每一轮都发 `text: ''`、`submit: false`**——一次什么都不写的跟进发送。于是：第 1 次发送采集到证据，第 2 次发送在 270 行立刻把它清掉，而 316 行因 `input.length === 0` 被跳过，**没有任何东西再把证据生成回来**。这与「要求该证据即必然超时」完全自洽，也解释了 PR #161 为何越修越坏。

标注清楚：以上是**读源码得出的机制**，与观测到的失败自洽，但**尚未**用一次带时序的运行时观测直接证实。

两条候选方向，各自的代价一并记下：

- **(a) 不再为「没有写边界的发送」丢弃 readiness 证据。** 最直指机制，但它改的是与 bash 共享的发送语义：`packages/terminal/terminal-bash/tests/session.spec.ts` 里有 **80 处** `.startSend(` 调用点把现行语义钉住了（本次实测计数；本票早前口头估计的「约 25 处」偏低，以 80 为准）。因此这条路必须先分清哪些钉的是「每次发送都重置」这一行为本身，哪些只是顺带使用。
- **(b) 保留 `stdin_read` 裸跳出，但给 pwsh 路径补上 bash 已有的首字节门。** 依据是 `session.ts:498` 的 `startupHasOutput = !this.initializing || this.scrollback.snapshot().text.length > 0`：`initializing` 只在 `session.initialize()` 内部被置位（`session.ts:236`），而启动路径**只对 bash** 调用 `initialize()`（`index.ts:122-124`；pwsh 走 126-145 行的循环，从不调用它）。所以 pwsh 引导期间 `this.initializing` 恒为 `false`，`startupHasOutput` **恒为 true**，那道首字节门对 pwsh 根本没有生效过。补上它属于把既有保护对齐，而不是新增机制。

验收不变，且因为失败依赖调度运气，这一条尤其不能松：`node 24 / coverage` **连续两次真实运行**对该 suite 全绿。单次绿不足以判定修好——PR #161 的 `pins UTF-8` 在改动前就是「侥幸通过」的那一类。
