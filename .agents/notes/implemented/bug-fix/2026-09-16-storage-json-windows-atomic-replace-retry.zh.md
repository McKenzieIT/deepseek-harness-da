# Agent Note: 让 storage-json 共享有界的 Windows 原子替换

Status: implemented

[English](2026-09-16-storage-json-windows-atomic-replace-retry.md) | 中文

## 问题

JSON 存储后端用裸 `rename()` 发布每一份文档。在 Windows 上，当另一个组件持有目标文件时，该替换可能被拒绝并报出 `EACCES`、`EBUSY` 或 `EPERM`，而 `@deepseek-ai/dsh-atomic-write` 早已为自己的替换重试这三个错误码。`packages/storage/storage-json/src/atomic.ts` 从未收到那份重试：它只有一次提交（`1529be6fd4`，2026-07-24），早于重试在 `3e56eaaa0f`（2026-08-29）落地；后者的归档[重试决策记录](../../archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md)写明 `writeFileAtomic` 拥有替换重试，因为每个文件型存储都需要同一条保证。JSON 后端正是一个从未迁移的文件型存储，于是两份原子替换实现在这一步上不一致，且没有任何记录说明原因。

`packages/session/session-projection-cache` 有四项断言只在 `windows node 24 / coverage` lane 上失败——job 104534944084（PR #155）与 job 104635347170（PR #158）——而同一提交的 Linux 全绿。单测耗时呈双峰分布：同一个 helper 的调用要么在 141–147 ms 完成，要么烧完整个 5000 ms `vi.waitFor` 预算，中间没有任何取值。仅仅迟到的写入会落在中间。每一例失败中，较早的写入已落盘而较晚的替换写入没有，磁盘上留下的是完整且格式正确的旧文档而非半截文件——这正是 `rename` 抛出后留下的状态，因为发布协议在 rename 之前从不触碰目标文件。每次 checkpoint 写入都经 `flushSoft` fire-and-forget，任何一层都不重试，所以一次拒绝即永久丢写。

这些失败同时无法归因。`flushSoft` 捕获错误后通过 `ctx.logger.warn` 上报；`LoggerService` 只注册环形缓冲 exporter，而这些组合不再注册任何 exporter，于是 errno 到不了任何输出。仅靠读回轮询无法区分「写入抛出」与「写入尚未落盘」，归档的 [Windows coverage 预算笔记](../../archived/process/2026-08-31-windows-coverage-flaky-test-budgets.md) 正是因此把同一批断言读成排空慢于 40 ms 的 settle，并把它们放宽为 `vi.waitFor(…, { timeout: 5_000 })`。它们在 125 倍预算下依然失败，而同一 helper 的兄弟调用 141 ms 完成。

## 决策

`renameAtomicTemp` 是 [`@deepseek-ai/dsh-atomic-write`](../../../../packages/util/atomic-write/src/index.ts) 的公开导出：那一步有界重试的替换，面向自行渲染并 fsync 临时兄弟文件的文件型存储发布。[`writeAtomic`](../../../../packages/storage/storage-json/src/atomic.ts) 改用它提交，不再直接调用 `rename`，于是 Windows 上的 `EACCES`、`EBUSY`、`EPERM` 会重试至多八次，延迟从 20 ms 增长到 200 ms——总计约 1.1 秒——期间同一份完整的临时文件始终是 rename 源。其他错误码与其他平台仍在首次尝试即失败。

只共享 rename 这一步。`writeFileAtomic` 刻意既不 fsync 文件也不 fsync 父目录（`TODO(settings-atomic-durability)`），而 `writeAtomic` 两者都做，这是 storage-json 的崩溃持久性约定；因此 JSON 后端保留自己的临时写入与 fsync 包裹在共享提交两侧，而不是整体改用 `writeFileAtomic`。

四处读回现在会归因 fail-soft 写入。[`tests/durable-write.ts`](../../../../packages/session/session-projection-cache/tests/durable-write.ts) 安装直通式 `ctx.logger.warn` 侦听，并让第一条上报与原有的读回轮询竞速，于是抛出的持久写会立刻带 errno 失败，而不是五秒后给出陈旧值差异。读回断言与其五秒预算保持不变；两个刻意制造写入失败的 spec 保留各自静默的侦听，它们用作阻塞物的目录产生非瞬时错误码，仍然快速失败。

## 已考虑的替代方案

**再次放宽轮询预算。** 被它自己的记录否决：上一次从 40 ms 放宽到 5 s，理由正是把这批断言读成排空延迟，而它们现在在 125 倍预算下失败，同一 helper 的兄弟调用 141 ms 完成。任何进一步放宽都是用更慢的 lane 换掉一次真实的丢写。

**给测试一个由写入链导出的确定性读回屏障。** 这是「可见性延迟」的正确修法，而双峰耗时排除了这种可能。屏障会让失败分支等待同样长，并报出同样的陈旧值，因为写入根本没有完成。

**用 `writeFileAtomic` 替换 `writeAtomic`。** 拒绝：`writeFileAtomic` 按设计省略两次 fsync，采用它等于为复用一个本可单独共享的步骤，而悄悄放弃 storage-json 的崩溃持久性约定。

**在 storage-json 内复制那份重试。** 拒绝：Windows 错误码集合与退避时序的两份拷贝会漂移，而造成本缺陷的不对称正是一份实现缺了另一份已有的东西。把这一步发布出来可以保持单一所有者。

**在 `flushSoft` 里重试。** 拒绝：投影缓存会为一个自己无法观测的文件系统状况重放整次 checkpoint 渲染，而其他每个文件型存储仍然暴露在同一问题下。替换重试属于替换本身。

## 后果

Windows 上短暂持有单元文档或记录文档的组件，只会把一次 JSON 发布延迟至多约 1.1 秒，而不是丢掉它，且该延迟落在这些 spec 已有的 5 s 读回预算之内。整个过程中读取方看到的都是完整的旧文档，成功仍然是一次原子 rename。预算耗尽会在移除临时兄弟文件后重抛最后那个文件系统错误，因此永久被占用的目标仍然失败，而 `flushSoft` 依旧把该失败挡在事件路径之外。

`dsh-atomic-write` 的接口增加一个函数，`storage-json` 把它作为 workspace peer 依赖并新增一条 tsconfig 项目引用。现有覆盖已经足够：[`atomic-write.spec.ts`](../../../../packages/util/atomic-write/tests/atomic-write.spec.ts) 已经用 mock 的 `platform` 与假定时器钉住了被重试的错误码、重试耗尽、非瞬时错误码以及非 Windows 行为，因为在 macOS 或 Linux 上无法制造真实的瞬时 rename 拒绝。

Windows 分支本身只能由 CI 验证。[T19](../../../../wayfinder/repo-infra/tickets/T19-windows-projection-cache-durability.md) 的验收标准是连续两次真实的 `windows node 24 / coverage` 运行、两个 spec 全绿且 Linux 无回归；本地 macOS 运行只能证明没有回归。
