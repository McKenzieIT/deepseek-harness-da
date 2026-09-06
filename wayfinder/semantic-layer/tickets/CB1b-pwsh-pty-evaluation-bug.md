---
type: bug
status: open
blocked_by: []
---

# CB-1b: pwsh in PTY doesn'''t evaluate expressions on GitHub macOS runners

**Branch**: TBD

**来源**: CB-1a session（2026-09-06）darwin-parity 调查。Sandbox seatbelt (macos-14) 的 3 个 pwsh 测试挂——根因不是 macOS 版本（#28 pin macos-14 没修），是 terminal-bash 的 pwsh-in-PTY 调用 bug。

## 问题

`packages/terminal/terminal-bash/tests/local.spec.ts:318-341` + `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts:142` 在 GitHub macOS runner（macos-14 + macos-26 都一样）上挂。在用户本地 Mac（macOS 14.4.1，无 pwsh -> skip）无法复现。

## 根因（已查到）

terminal-bash `session.ts:279` 将 `text:` + `\r` 写入 PTY。pwsh 在交互（PTY）模式下应该：echo 输入 -> evaluate 表达式 -> 输出结果。但 CI 的 `viewport` **只有** literal 表达式（echoed input）——**evaluate 结果缺失**。

两种可能：
1. GitHub macOS pwsh 在 PTY 模式下 echo 输入但**不 evaluate**（macOS-pwsh 行为）。
2. `done` 在 pwsh finish evaluate 前就 resolve——**timing issue**。

## 非 macOS 版本特有

#28 pin macos-14（从 macos-latest/macOS-26 改）没修——macos-14 + macos-26 都一样。是 GitHub macOS runner 的 pwsh-in-PTY 行为。

## 落点（修复方向）

- `packages/terminal/terminal-bash/src/session.ts`：查 `done` resolve 逻辑——是否在 pwsh prompt 返回后才 resolve（含 evaluate 结果）。
- 如果是 timing：等 pwsh finish evaluate 再 resolve `done`。
- 如果是 pwsh-in-PTY 行为：改 pwsh invocation（用 `-Command` evaluate 而非 PTY stdin echo）。

## 不做

- 不改 CI workflow（sandbox.yml）——这是 terminal-bash 源码 bug。
- 不 skip pwsh 试 on macOS（会降低 darwin parity 覆盖）。

## 关键文件

- `packages/terminal/terminal-bash/src/session.ts`（PTY write/read + done resolve）
- `packages/terminal/terminal-bash/tests/local.spec.ts:318-341`（failing test）
- `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts:142`（failing test）
