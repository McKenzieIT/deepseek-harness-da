# T22 — Linux coverage：terminal-bash pwsh 持久会话 motd 为空

**Type**: research
**Phase**: post-discovery
**Status**: open
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
