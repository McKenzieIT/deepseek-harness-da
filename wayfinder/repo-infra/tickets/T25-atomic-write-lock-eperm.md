# T25 — Windows coverage：`withFileLock` 把 delete-pending 的 EPERM 当成真实权限拒绝

**Type**: research（只有一次观测，需先确认可复现性与 Windows 语义）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)；与 [T19](T19-windows-projection-cache-durability.md) **同域但不同缺陷**（见下方「与 T19 的关系」）。证据取自 `windows node 24 / coverage` job 104633154572（PR #157 head `89279ed55b`）

## Question

`packages/credentials/credentials-local/tests/records.spec.ts` 的 `record mutation` → 「keeps both records when two providers write the same document concurrently」（该用例在 270 行）在 Windows coverage 上失败：

```
Error: EPERM: operation not permitted, open 'C:\Users\RUNNER~1\AppData\Local\Temp\dsh-cred-records-CkAnqJ\.credentials.yaml.lock'
 ❯ withFileLock packages/util/atomic-write/src/index.ts:167:7
    167|       await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600, fla…
```

栈帧行号 `167` 属该 job 的 head `89279ed55b`；在 current `origin/master` 上同一行是 `packages/util/atomic-write/src/index.ts:184`（`withFileLock` 自 174 行起，独占创建锁文件的 `writeFile(lockPath, …, { mode: 0o600, flag: 'wx' })` 在 184 行）。函数与语义未变，只是 #160 的导出改动把行号推后了。

## 机制

失败点是**锁的获取**，判定它是否属于争用的是 `isLockContention`（同文件 112-124 行）：

- `EEXIST` 直接判为争用（115 行）；
- 非 `EPERM` 一律不是争用（116 行）；
- `EPERM` 只有在 `lstat(lockPath)` 成功时才判为争用（117-119 行）；`lstat` 抛出则返回 false（120-123 行），注释是「Keep the original EPERM authoritative when lock existence is unproven.」（121 行）。

Windows 上一个处于 **delete-pending** 状态的锁文件同时满足两件事：独占 `open`（`flag: 'wx'`）得到 `EPERM`，**而且** `lstat` 也失败——目录项仍在，但句柄已标记删除，元数据查询被拒。两者叠加正好走进 122 行的 `return false`，于是 187 行 `if (!await isLockContention(error, lockPath)) throw error` 把原始 `EPERM` 抛出，而这恰恰**就是**它想覆盖的那种争用。文档注释（162-165 行）明确写了这条设计意图是「covering Windows exclusive-create behavior without hiding an unrelated permission failure」——delete-pending 是该意图漏掉的第三种状态。

`withFileLock` 本身已有有界退避（181 行起，`LOCK_RETRY_INITIAL_MS` 指数退避到 `LOCK_RETRY_MAX_MS`，189-191 行以 deadline 收口），所以缺的不是重试机制，而是**把这一种 `EPERM` 归类为争用**。

## 与 T19 的关系：同域，不同缺陷，不共调用路径

必须写清楚，否则下一次会误以为 #160 已经修过：

- [T19](T19-windows-projection-cache-durability.md) 的缺陷是 `storage-json` 的 `writeAtomic` 里**未重试的 `rename`**，已在 #160（`051519b169`）用 `renameAtomicTemp` 修掉。
- 本票的缺陷是 `util/atomic-write` 里的**锁获取**，与 rename 无关。

两者**不共调用路径**（已核实）：T19 的链路是 `Session#append → flushSoft → KvTableImpl.put → per-record-unit.writeDocument → writeAtomic`，而 `packages/storage/storage-json/src/atomic.ts` 的 `writeAtomic`（28 行）只调用 `renameAtomicTemp`（38 行），全程不触碰 `withFileLock`；仓库里 `withFileLock` 的调用方是 `settings-file`、`llm-deepseek/upload-index`、`app-boot/profile`、`scope-registry`、`credentials-keychain-host`、`credentials-local`（`credentials-local/src/index.ts` 的 684/716/768/838 行），其中没有 storage-json 或 session-projection-cache。所以 #160 的绿不构成本票的任何证据。

## 只有一次观测

到目前为止**只在 job 104633154572 见过一次**。在把它当成稳定缺陷之前，需要先确认它在该 lane 上是否复现——若为极低频，仍应修，但优先级与验收次数应据此定。这一点写在这里，是为了避免下一次误把单次观测当作已确诊。

## 下一次尝试必须先解决的设计张力

把「`open` 得到 `EPERM` **且** `lstat` 失败」也判为争用，代价是明确的，不能装作没有：

- **收益**：现有的有界 deadline 能自然吸收 delete-pending 窗口——那本来就是个短暂的瞬时状态。
- **代价一**：真正的 ACL 拒绝（目录不可写、权限被收紧）会被推迟到整个 deadline 用完才报，而不是立刻报。
- **代价二**：报出来的会是 190 行那条通用的 `timed out waiting for the writer lock at …`，**原始 `EPERM` 与它的 errno 就丢了**——这正是 121 行注释要守住的东西。

因此任何修法都必须**在最终重抛时保留原始错误**（例如把最后一次捕获的 errno 作为 `cause` 或并入消息），否则就是把 T19 里刚刚付过学费的「fail-soft 吞掉 errno」换个地方重演。

**不接受的修法**：无条件 catch `EPERM`、无界重试、或把该用例串行化（并发写同一文档正是这条用例的判别力所在，串行化等于删掉断言）。

## Scope

1. 先确认 Windows 上 delete-pending 确实同时产生 `open`-`EPERM` 与 `lstat` 失败——这是本票机制陈述里唯一尚未由本仓证据直接证明的一环（当前依据是 Windows 语义推理 + 失败现场，不是实测）。
2. 据此扩展 `isLockContention` 的争用判定，并按上面的张力保留原始错误用于最终重抛。
3. 补上此前缺失的用例覆盖：delete-pending 形状的 `EPERM` 应被吸收，真实 ACL 拒绝应在 deadline 后带原始 errno 报出。

验收：`windows node 24 / coverage` **连续两次真实运行**对 `records.spec.ts` 全绿，且 Linux/macOS 无回归。本机 macOS 无法复现 Windows 的 delete-pending 语义，因此本地检查只能证明无回归。
