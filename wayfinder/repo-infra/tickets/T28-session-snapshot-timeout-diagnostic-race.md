# T28 — session-snapshot title timeout 诊断竞争

**Type**: task  ·  **Status**: open
**Part of**: [repo build and theme infra map](../map.md)
**Mode**: AFK；实现前使用 `dsh-ci-test-reliability` 与 `diagnosing-bugs`

## Question

如何让 `packages/test-support/session-snapshot/tests/harness.spec.ts` 的 `waitForTitleAfterTurnEnd` timeout 用例在并发负载下稳定观察 harness 自己的超时诊断，而不是先被外围 `waitFor` 或测试预算截断？

## Evidence

旧 semantic-layer prompt 使用了已经失效的 `acp-snapshot` 包名。当前 owner 是 `packages/test-support/session-snapshot/`；有效问题是诊断路径在套件并发时可能先得到通用 timeout，而不是 `did not persist session/title after turn/end within …ms`。

## Acceptance

- 先建立可重复的并发负向控制并区分 harness timeout、测试框架 timeout 和应用未静默三种结果。
- 通过显式同步与分层预算保证目标诊断先发生，不仅放宽 timeout 或重写错误匹配。
- focused run 和并发复现稳定通过，且成功路径的 durable-title 等待语义不变。
