# T23 — run-gates 的进程树枚举在 Windows 上溢出，把全绿的 lane 报成红

**Type**: task
**Phase**: post-discovery
**Status**: resolved（2026-09-16；等真实 CI 确认）
**Assignee**: —
**Related**: [T11](T11-test-coverage-failing.md) 的 coverage 收口；证据取自 `windows node 24 / coverage` job 104648904870（PR #157 head `392cd1a19e`）

## Question

PR #157 的 `windows node 24 / coverage` 被判 failure，但该 job 的日志里**一条测试失败也没有**——`FAIL` 零命中，keychain 与 eval persistence 两项已转绿。job 反而死在 gate runner 自己身上：

```
D:\a\deepseek-harness-da\deepseek-harness-da\scripts\run-gates.ts:1543
    queue.push(...(byParent.get(pid) ?? []))
          ^
RangeError: Maximum call stack size exceeded
    at collectDescendants (scripts\run-gates.ts:1543:11)
    at ChildProcess.<anonymous> (scripts\run-gates.ts:1488:36)
    at ChildProcess.emit (node:events:514:28)
```

日志只有 2009 行（正常一轮约 19000 行），因为 `DSH_GATE_FAIL_FAST: 1` 让整轮在此中止。**这是一个把已经全绿的 lane 报成红的门禁自身缺陷**，会掩盖真实结论——它出现在 gate 结束后清理子进程树的 `child.on('close')` 回调里。

## 根因（两处叠加，已用本地负控证明）

```ts
const queue = byParent.get(root) ?? []            // 别名，不是拷贝
for (let index = 0; index < queue.length; index += 1) {
  const pid = queue[index]
  if (pid === undefined) continue
  result.push(pid)
  queue.push(...(byParent.get(pid) ?? []))         // line 1543
}
```

1. **进程表快照不保证是树。** 操作系统会复用 pid，因此一行可以指向一个编号已被回收、且在同一份 dump 里位于其下方的「父进程」；`Get-CimInstance Win32_Process` 报这种行与报任何其他行一样自然。原walk 没有任何「已访问」记录，遇到环就无限增长 queue。
2. **`queue` 别名了 map 里的子数组**，所以 `queue.push(...)` 会就地改写 walk 正在读的快照。当环回到 `root` 时 `byParent.get(pid)` 与 `queue` 是同一个数组对象，`queue.push(...queue)` 每轮翻倍——指数增长。
3. **`push(...array)` 每个元素占一个实参**，队列一旦变宽就超出引擎实参上限，V8 把这种实参溢出报成 `RangeError: Maximum call stack size exceeded`——与 CI 里的字样完全一致。

本地负控（忠实复制修复前的函数）：两行输入 `[[200,100],[100,200]]`（root=100）即抛 `RangeError: Maximum call stack size exceeded`；单亲 20 万子进程的宽扇出同样抛出。两者都复现了 CI 的原文。

## 修法

`collectDescendants` 改为：queue 用拷贝而非别名；用 `queued` Set 记录已入队的 pid 并拒绝二次入队，使 walk 由行数而非快照形状定界（环形 dump 每个 pid 只产出一次）；子进程逐个 append 而不 spread，彻底消除实参上限这一路。函数同时导出以便直接测试——它此前未导出、未被任何用例覆盖，这正是缺陷得以长期存在的原因。

不接受的修法：加大栈、`try/catch` 吞掉 RangeError、或把清理整体跳过——三者都会让门禁在进程树未清理时静默通过。

验收：`windows node 24 / coverage` 连续两次真实运行不再出现该 `RangeError`，且该 job 的红/绿判定与其测试结论一致。
