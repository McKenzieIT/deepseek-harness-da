# T27 — bash-local executor 生命周期测试竞争

**Type**: task  ·  **Status**: open
**Part of**: [repo build and theme infra map](../map.md)
**Mode**: AFK；实现前使用 `dsh-ci-test-reliability` 与 `diagnosing-bugs`

## Question

如何让 `packages/shell/bash-local/tests/executor.spec.ts` 的进程生命周期用例确定性证明“executor fiber 释放后后台进程仍存活，并在 subprocess service 释放时终止”，而不依赖后台进程与 teardown 的调度竞速？

## Evidence

旧 semantic-layer prompt 把该失败与已失效的 change-scope、acp-snapshot 假设混在一起。当前仍存在的有效问题是 `process lifecycle ownership` 用例可能在 service kill 前自然完成，从而把预期 `killed` 观测为 `completed`。

## Acceptance

- 先建立可重复的负向控制并确认测试假设或实现缺陷的真实 owner。
- 使用事件、marker 或受控长生命周期进程同步，不通过延长 sleep、增加 retry、关闭并发或 skip 掩盖竞争。
- focused run 与包含并发压力的复现均稳定通过，并证明 executor 与 subprocess service 的所有权语义未被削弱。
