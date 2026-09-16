# T20 — Windows coverage：codex 真实产品用例与 client-catalog 预算

**Type**: research
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；证据取自 `windows node 24 / coverage` job 104534944084（PR #155 head `7f1365dfb6`）与 job 104542100296（PR #156 head `d0112f4657`）

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

「collects every declared slot with a teachable contract」在 Windows coverage 上 `Test timed out in 30000ms`，Linux 同一提交通过。该用例扫描真实 workspace 面，属编译密集型；30 秒是它自带的 case 预算，低于 lane 授予的 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`。

按 lane 预算规则：case 上的字面量会**覆盖**而非让位于 runner 预算，所以这里 30 秒是主动收窄了 CI 已经授予的额度。需要判定它是否有收窄的理由；若无，应让它取用 lane 预算。

## Scope

1. codex 项：先把断言改成能自证的形状——分别断言 captured `arguments` 里的命令与实际写入路径，使失败直接指出不匹配的字段，再据此定 root cause。
2. client-catalog 项：确认 30 秒字面量无独立理由后取用 lane 预算；若有理由则把理由写在旁边。
3. 两项都不接受 `retry` 或跳过。

验收：`windows node 24 / coverage` 连续两次真实运行对这两项全绿。
