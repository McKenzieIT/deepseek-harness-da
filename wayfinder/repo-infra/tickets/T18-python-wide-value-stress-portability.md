# T18 — Python 宽值内存压力用例在 CI 上不可移植

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md) 的 coverage 收口；draft PR #156（`fix/repo-infra-python-wide-budget-t11`，head `71bf17d990`）

## Question

`packages/experimental/code-runtime-python` 的两个 600 万元素用例验证 completion 编码与 binding 参数校验保持 O(depth) 辅助空间。两者都要求子进程在配置的 `maxWallMs` 内完成整个往返，而该往返在 CI runner 上比空闲工作站慢 4 倍以上，因此 `node 24 / coverage` 稳定报运行时自身的 timeout。

## 已排除的假设

**「V8 插桩税是根因」——已被 PR #156 自身的 CI 推翻。** 该分支把两个用例移入独立 suite 并挂到 `coverage-exempt-heavy`，真实 `node 24 / coverage` 仍报：

```
AssertionError: expected { kind: 'timeout', …(1) } to be undefined
+ Received: { "kind": "timeout", "message": "wall-clock ceiling reached (80000ms)" }
  packages/experimental/code-runtime-python/tests/wide-values.spec.ts:46
```

原因：`check:ci:coverage` 在**同一个 job** 内同时调度插桩分区与 `coverage-exempt-heavy`（`DSH_COVERAGE_PARTITIONS: 4`、`DSH_COVERAGE_MAX_WORKERS: 4`、`DSH_GATE_CONCURRENCY: 3`），所以去掉插桩后用例仍在同一台争用主机上。实测：空闲工作站约 19.5 秒，该 runner 超过 80 秒。

## 约束

- 抬高数字这条路已封闭：lane 的 case 上限是 90 秒（`DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`），`maxWallMs` 已经是 80 秒。
- 用例的判别力来自内存形状，不是宽度绝对值：修复前的按元素遍历帧约 56 字节/元素，必须仍然超过配置的 `addressSpaceMb` 才能证伪。
- 该判别失败是 Linux-only（Darwin 跳过 `RLIMIT_AS`）。

## Scope

按比例缩小 fixture 并同步下调 `addressSpaceMb`，使「修复前分配超出地址空间」这一判别关系保持成立：

1. 选定候选宽度，用 `tracemalloc` 在修复前/修复后两种 walk 形状上实测峰值（现注释里的 459.1 MiB / 0.0 MiB 是 600 万元素下的数据，缩小后必须重测）。
2. 同步校验两条 load-time 约束仍成立：`maxValueBytes × 12 < addressSpaceMb − 解释器基线`，以及 host heap 派生的 frame 上限。
3. 用负向控制证明缩小后的 fixture 仍会在修复前的 walk 形状下变红。
4. 复核是否仍需 `coverage-exempt-heavy` 豁免——若缩小后成本已可忽略，PR #156 的豁免与 suite 拆分应一并撤回，避免留下无理由的豁免条目。

验收：`node 24 / coverage` 与 `windows node 24 / coverage` 在连续两次真实运行中对该 suite 全绿。
