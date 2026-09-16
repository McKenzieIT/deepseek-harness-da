# T20 — Windows coverage：codex 真实产品用例与 client-catalog 预算

**Type**: research
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；证据取自 `windows node 24 / coverage` job 104534944084（PR #155 head `7f1365dfb6`）与 `node 24 / coverage` job 104542100296（PR #156 head `d0112f4657`，**ubuntu-latest**——本票初稿误标为 Windows job，已更正；PR #156 的 Windows job 是 104542099968，codex 项在那里是通过的）

## Question

两项 Windows-only 失败，root cause 尚未定：

### 1. `subagent-codex/tests/real-product.spec.ts:510`

「executes an explicitly selected dangerous bypass write in the isolated workspace」失败。该断言只检查 `existsSync(target)`，把 captured request 塞进失败消息，因此注解里是一整段被截断的 `exec_command` arguments，看不出真正的不匹配点。

fixture 给 `@openai/codex` 两个候选 function call（`exec_command` / `shell_command`），Windows 分支的命令是：

```
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "Set-Content -LiteralPath '<target>' -Value 'bypass' -NoNewline"
```

`<target>` 由 `join(workspace, sideEffect)` 生成，并做 `replaceAll("'", "''")` 单引号转义。注解中的路径呈 `C:\Users\RUNNER~1\...` 8.3 短名形式，与 `mkdtempSync` 返回的长名不一致——**待验证的首要嫌疑**是短名/长名不匹配导致文件落在另一路径，而非命令转义。

未决：产品行为变化、路径规范化、还是命令长度。定 root cause 前不要改测试。

### 2. `scripts/gen-client-catalog.spec.ts:200`

「collects every declared slot with a teachable contract」报 `Test timed out in 30000ms`。该用例扫描真实 workspace 面，属编译密集型；30 秒是它自带的 case 预算，低于 lane 授予的 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`。

按 lane 预算规则：case 上的字面量会**覆盖**而非让位于 runner 预算，所以这里 30 秒是主动收窄了 CI 已经授予的额度。需要判定它是否有收窄的理由；若无，应让它取用 lane 预算。

**resolved 2026-09-16——30 秒字面量无独立理由，改取 lane 预算。**

先纠正本票原来的两处错误判断：

1. **不是 Windows-only。** 原文「Linux 同一提交通过」不成立：PR #156 的 Linux job `104542100296` 就报了同一项 `Test timed out in 30000ms`（且该 job 是 `ubuntu-latest`，本票原先把它标成 `windows node 24 / coverage`——evidence 指针错了）；PR #159 的 Linux coverage 也报红。PR #155 的 Linux job `104534944130` 是以 **29536ms** 通过的，只剩 464ms 余量——即「Linux 通过」是擦线通过，不是有余量。
2. **30 秒从来不是深思过的上限。** `git log -S "30_000"` 对该文件只有一个提交：`a7d4cd8e1b "fix: ci"`（2026-08-13，31 文件的清扫），其对本文件的全部改动就是把 `it(...)` 加上 `{ timeout: 30_000 }`——那是从 Vitest 默认 5 秒**上调**，而当日 lane 只授予 15 秒（`DSH_COVERAGE_TEST_TIMEOUT_MS` 在 `f3bfcf33bb` 引入时是 `'15000'`）。它从未被复核，也没有任何注释或笔记为它辩护。

实测成本（跨 PR #155–#159 真实 CI）：Linux 13.1–19.2s、Windows 24.3–37.4s。30 秒正好横穿这个区间，所以两个平台都会间歇性撞线。

修法按本仓既有 idiom：把预算提到 `describe` 层并等于 lane 值，旁边写明它匹配 `DSH_COVERAGE_TEST_TIMEOUT_MS`（范式见 `scripts/translation-pairing-merge.spec.ts:262-272` 与 `scripts/install-lefthook.spec.ts:213-221`，决策记录在 `.agents/notes/archived/testing/2026-08-27-translation-pairing-merge-budget.md`）。**不能直接删掉字面量**：`vitest.config.ts` 与 `vitest.shared.ts` 都不设仓库级 `testTimeout`，删掉会让该用例在本地 `pnpm test` 和任何未设该 env 的 lane 上掉回 Vitest 内置的 5 秒，立即变成回归。

这不属于「放宽 timeout」：lane 已经授予 90 秒，case 字面量是**覆盖**而非让位，所以 30 秒是主动收窄 CI 已给的额度；本改动只是把它交还。该用例是同步编译工作（`ts.createSourceFile` 逐文件），不存在可等待的状态，因此「命名被等待的状态」在此不适用。

**遗留（未纳入本次 focused 改动）**：37 秒的扫描成本本身没有变小。真正的深层修法是让 slot 扫描不必对每个文件建完整 SourceFile（或缓存/增量化），属独立票。

## Scope

1. codex 项：先把断言改成能自证的形状——分别断言 captured `arguments` 里的命令与实际写入路径，使失败直接指出不匹配的字段，再据此定 root cause。
2. client-catalog 项：确认 30 秒字面量无独立理由后取用 lane 预算；若有理由则把理由写在旁边。
3. 两项都不接受 `retry` 或跳过。

验收：`windows node 24 / coverage` 连续两次真实运行对这两项全绿。
