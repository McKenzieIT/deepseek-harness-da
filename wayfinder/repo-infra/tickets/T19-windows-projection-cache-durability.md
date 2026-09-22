# T19 — Windows coverage：session-projection-cache 归档恢复与 checkpoint 读回失败

**Type**: research（需先定 root cause：产品 bug vs 测试同步）
**Phase**: post-discovery
**Status**: root cause 已判定 = **写失败**；修复在分支 `fix/repo-infra-storage-json-windows-rename`（见下方「判定结果」）
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

## 判定结果：写失败（不是可见性延迟）

判定证据是 `windows node 24 / coverage` 的**单测耗时呈双峰分布**：同一个 helper 要么 141–147 ms 完成，要么烧完 `vi.waitFor` 的整个 5000 ms 预算，中间没有取值。迟到的写入会落在中间；只有「抛出后不再重试」才产生这种全有全无的分布。四项失败耗时 5332 / 5148 / 5162 / 5061 ms，而同一文件内相同 helper 的兄弟用例是 141 ms / 147 ms（job 104635347170，PR #158；job 104534944084，PR #155）。每一例都是「较早的写入落盘、较晚的替换写入没落盘」，磁盘上留下的始终是完整且格式正确的旧文档，从不是半截文件——这正是 `rename` 抛出后留下的状态，因为 `writeAtomic` 在 rename 之前从不触碰目标文件。`flushSoft` 是 fire-and-forget，任何一层都没有重试，所以一次抛出即永久丢写。

之所以「加大轮询预算」不是修法：已归档笔记 `.agents/notes/archived/process/2026-08-31-windows-coverage-flaky-test-budgets.md` 把同一批用例诊断为「写入未在 40 ms 内排空」，把 `settle(40)` 放宽成 `vi.waitFor(…, {timeout: 5_000})` 并宣布该 lane 已修好。它们现在在 **125 倍**的预算下依然失败，而相同 helper 的兄弟调用 141 ms 完成——那次诊断是错的。

errno 之所以不在 CI 日志里：`flushSoft` 捕获后只调 `ctx.logger.warn`（`session-projection-cache/src/index.ts:361`），而 `vendor/cordis` 的 `LoggerService` 只注册环形缓冲 exporter，这些 spec 挂载的插件都不注册 console exporter（仓库唯一的 `ctx.logger.exporter(...)` 调用点是 `packages/experimental/webworker-runtime/src/worker-host.ts:322`）。这条 warn 在结构上不可见，缺失的可观测性本身就是缺陷的一半。

## 修法

1. **产品缺陷**：`@deepseek-ai/dsh-atomic-write` 把原本模块私有的 `renameAtomicTemp` 变为公开导出（Windows 上对 `EACCES`/`EBUSY`/`EPERM` 有界重试 8 次、20→200 ms，总预算 ≤ ~1.1 s，远在测试现有 5 s 轮询之内），`storage-json` 的 `writeAtomic` 用它替换裸 `await rename(tmp, path)`。只共享 rename 这一步：`writeFileAtomic` 刻意不 fsync 文件与父目录（`TODO(settings-atomic-durability)`），而 `writeAtomic` 两者都做，属于 storage-json 的崩溃持久性约定。git 历史证明这是遗漏而非决策——`storage-json/src/atomic.ts` 只有一次提交（`1529be6fd4`，2026-07-24），从未收到重试；`util/atomic-write` 在 `3e56eaaa0f`（2026-08-29）拿到，其归档笔记写明所有权规则「`writeFileAtomic` owns replacement retry because every file-backed store needs the same guarantee」，而 storage-json 正是从未迁移的文件型存储。
2. **可观测性**：`tests/durable-write.ts` 提供直通式 `ctx.logger.warn` 侦听，把它与四处原有的读回轮询竞速。读回断言与 5 s 超时逐字不变；写抛出时测试立刻带 errno 失败，而不是 5 s 后给出误导性的陈旧值 diff。

决策记录：`.agents/notes/implemented/bug-fix/2026-09-16-storage-json-windows-atomic-replace-retry.md`。

验收仍是上面那条：`windows node 24 / coverage` **连续两次真实运行**对 `cache.spec.ts` 与 `fixtures.spec.ts` 全绿，且 Linux 无回归。本机 macOS 无法复现 Windows 的 rename 拒绝，因此本地检查只能证明无回归。
