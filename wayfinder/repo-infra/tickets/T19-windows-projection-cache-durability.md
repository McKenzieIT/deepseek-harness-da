# T19 — Windows coverage：session-projection-cache 归档恢复与 checkpoint 读回失败

**Type**: research（需先定 root cause：产品 bug vs 测试同步）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；证据取自 `windows node 24 / coverage` job 104534944084（PR #155 head `7f1365dfb6`）与 job 104635347170（PR #158 head `a386b9088c`）

## Question

`packages/session/session-projection-cache` 有四项断言只在 Windows coverage 上失败，Linux 同一提交全绿：

1. `fixtures.spec.ts:133`「recovers the v3 whole-unit archive through the legacy bootstrap」——重写后读回的 `record.identity` 得到 `{createdAt, cwd}`（fixture 原始形状），而非当前世代应写入的 `{formatVersion, inheritedEventCount, isSeeded}`。
2. `fixtures.spec.ts:138`「opens v4-session-doc.json ... then rewrites it current」——`rows['title'].val` 为 `null`，而非 `重写标题`。
3. `cache.spec.ts:202`「writes a durable checkpoint at turn/end」——读回仍是创建时的 `{ver:1, seq:-1, val:null}`，而非 `turn/end` 的 cut。
4. `cache.spec.ts:247`「flushes when the in-turn event count reaches the configured threshold」——计数阀值触发后读回 `null`，而非 `{marks:['3']}`。

四项都在 `vi.waitFor(..., { timeout: 5_000 })` 内轮询读文件。第 3、4 项同属 `cache.spec.ts` 的 write policy，且均为「写入后读不到」，因此四项很可能共一个根因。

## 需要先判定的分叉

写路径全程 fail-soft：`flushSoft` 捕获异常只记 `ctx.logger.warn`，因此测试无法区分「写成功但尚不可见」与「写失败」。判定 root cause 前必须先把这两者分开，否则任何修法都是猜测。

- 若是**写失败**：`storage-json` 的 `writeAtomic` 在 Windows 上 `rename` 可能撞 `EACCES`/`EBUSY`/`EPERM`。注意 `packages/storage/storage-json/src/atomic.ts` 的 `writeAtomic` **没有** `@deepseek-ai/dsh-atomic-write` 里那套有界重试（`renameAtomicTemp`，8 次指数退避至 200ms），两个原子替换实现在这一点上不对称——这是首要嫌疑，且属产品缺陷而非测试问题。
- 若是**可见性延迟**：需要一个确定性的读回屏障，而不是放宽 `vi.waitFor` 超时。

## Scope

1. 先让失败可归因：在这四项上捕获 `ctx.logger.warn`，断言「无 warn」与「读回到期望值」两件事分开报告。这一步本身就是修复的一部分——fail-soft 写路径缺少可观测性。
2. 按判定结果二选一：为 `storage-json` 的 `writeAtomic` 补上与 `dsh-atomic-write` 对称的有界 Windows 重试（并说明两处为何应当一致）；或为测试提供由写链导出的确定性屏障。
3. 不接受的修法：放宽 `vi.waitFor` 超时、增加 `retry`、或改断言容忍 `null`。

验收：`windows node 24 / coverage` 连续两次真实运行对这两个 spec 全绿，且 Linux 无回归。
