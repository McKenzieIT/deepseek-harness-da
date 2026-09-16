# T22 — Linux coverage：terminal-bash pwsh 持久会话 motd 为空

**Type**: research
**Phase**: post-discovery
**Status**: root-caused；修复已提交（分支 `fix/repo-infra-pwsh-prompt-readiness`）
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；证据取自 `node 24 / coverage` job 104635347140（PR #158 head `a386b9088c`，该分支只改 `upstream-monitor.spec.ts`，与本 spec 无关）；决策记录见 [Agent Note](../../../.agents/notes/implemented/bug-fix/2026-09-16-pwsh-startup-prompt-evidence.md)

## Question

`packages/terminal/terminal-bash/tests/local.spec.ts:333`「bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: true)」在 Linux coverage 上失败：

```
AssertionError: expected '' to contain 'dsh> '
  packages/terminal/terminal-bash/tests/local.spec.ts:333:28
```

用例 spawn 一个持久 pwsh 会话后，立刻断言 `created.motd` 含受控提示符 `dsh> `。实到空串——PTY 尚未把提示符写出，`spawn` 就已返回。该 suite 通过 `hasPwsh` 探针 gate，只在装有 pwsh 的 runner（CI）上跑，因此这是 CI-only。

## 判定结论：readiness 竞态

**不是 pwsh 启动被争用饿死。** job 104635347140 的两个 case 是：

```
× bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: true) 710ms
✓ bootstraps a persistent pwsh, persists state, and scrubs secrets (hold command: false) 1675ms
```

失败 case 在 `timeoutMs: 8_000` 的启动预算下 710 ms 就结束，比通过的同胞用例更快，是快一个量级的 fail-fast。整份日志里 `did not reach readiness` 与 `PTY shell exited` 均为零命中，因此 `spawn` 是带着 `motd === ''` **成功返回**，而不是耗尽时间。

**机制。** `startupSession`（`packages/terminal/terminal-bash/src/index.ts`）此前在任何 `stdin_read` 等待原因上就跳出 pwsh 启动循环，但 `pollReadiness`（`src/session.ts`）里 `'stdin_read'` 有两个互相独立的生产者，只有其中一个是提示符证据：

1. `promptSeen && promptTextSeen`——私有 OSC `133;D;` marker 加精确可打印尾部，是真正的提示符证据。
2. Linux 精确 stdin 等待探测（`elapsed >= exactProbeAfterMs && acceptsStdinWait`）——只通过 `/proc/<pid>/task/<tid>/syscall` 观测到前台进程组里有进程阻塞在终端读取上，**零提示符证据**。

pwsh/PSReadLine 在渲染提示符之前就会发出光标位置查询并阻塞读取其回复，sanitizer 把这些 CSI/OSC 字节剥成 `text: ''`，于是生产者 (2) 用空 viewport 结算了首个启动发送，`motd` 被赋成空串。

三条支撑事实：

- **pwsh 路径没有首字节闸门。** `initializing` 只在 `session.initialize()` 内设置，而 `startupSession` 只为 bash 调用它；pwsh 直接调用 `session.startSend`，因此 `startupHasOutput` 在 pwsh 引导期间恒为 true。bash 有 `scrollback.length > 0` 保护，pwsh 没有。
- **结构性地只在 Linux 出现。** `isStdinWaiting` 在 macOS（`process-inspector.ts`）与 Windows（`windows-inspector.ts`）硬返回 `false`，只有 `LinuxProcessInspector` 做真实的 `/proc` 扫描，所以生产者 (2) 在 Linux 之外不可达。
- **这是回归。** 提交 `4f3a47d792 fix(terminal-bash): handle terminal protocol replies`（2026-08-23）删掉了提示符检查，改成 `if (result.waitReason === 'stdin_read') break`。被删掉的 `CONTROLLED_PROMPT` 子串检查本身有真实误判——`PWSH_PROMPT_SETUP` 内嵌字面量 `dsh> ` 且 pwsh 会回显它——所以该次替换只是把一种误判换成了另一种会产出空 motd 的误判。

**ticket 原先「只有 true 分支报红」的框定被推翻**：PR #159 的 CI 显示失败的是 `hold command: false` 这一支，因此 `holdCommand` 不是原因（该标志第一次被读取的位置在 `motd` 断言之后），两支都应预期偶发。

## 修复

`LocalPtySession.promptReady` 暴露会话本已跟踪的、回显无法伪造的 marker + 精确尾部证据（marker 的 ESC 由 pwsh 的 `[char]27` 在运行时生成，回显的可打印文本永远不含真 ESC）；pwsh 启动循环只在 `stdin_read` 且 `promptReady` 成立时跳出，绝对截止时间仍是唯一的界并保持原有拒绝消息。同时修掉同一循环里的两处相邻缺陷：空结算不再冲掉已收集的启动文本；以显式状态而非空 viewport 判断首轮，使设置前导只提交一次。

未放宽 timeout、未加 retry、未改断言。

验收：`node 24 / coverage` 连续两次真实运行对该 suite 全绿。本机 macOS 无 pwsh，三个真实 pwsh 用例自跳过，因此本机运行不能证明该修复落地，只能证明没有别的东西回归。
