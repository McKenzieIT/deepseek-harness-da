# T16 — duplication 门 89 clones：fail-fast 掐掉整条 snapshots-and-artifacts lane

**Type**: grilling（含决策点：降噪 vs 真去重）→ 之后才是 task
**Phase**: post-discovery
**Status**: open（frontier —— 无阻塞，但需先拍板口径）
**Assignee**: unclaimed
**Severity**: medium —— 门本身不改行为，但它 fail-fast，**后面 7 道门一条都跑不到**
**Related**: [T14](T14-ci-workflow-startup-failure.md)（CI 首次真跑后才可见，清单见其「首次真实 CI 运行的完整清单」一节）；[T10](T10-publint.md) / [T11](T11-test-coverage-failing.md)（同批 pre-existing 红门）

## Question

`pnpm run duplication`（jscpd）报 **89 clones** 并 exit 1。这是真该去重的代码，还是这道门的阈值/取材对本仓库不合适？在拍板之前不要动代码。

## 实测事实

```
$ pnpm run duplication          # jscpd --config .jscpd.json packages scripts
│ tsx        │ 218 files  │  43173 lines │  52 clones (0.12%) │
│ typescript │ 1769 files │ 379804 lines │  85 clones (0.35%) │
│ Total:     │ 1987 files │ 422977 lines │  89 clones (0.33%) │
Found 89 clones.   exit 1
```

**pre-existing，与 upstream 合并无关**：在 `origin/master`（`793df1c610`）上用同一命令实测同样 **89 clones / exit 1**；且当日新增的 `scripts/upstream-monitor.ts` / `.spec.ts` **未出现在 clone 报告里**。

**门的位置**：`node 24 / snapshots and artifacts` 里 `lint and duplication` 组的一员，fail-fast ⇒ 它一红，`test:expected`、`web browser snapshot`、`doc-typecheck:contracts-ready`、`node-next types`、`built-bin smoke` 全部 SKIPPED。也就是说这一条红实际掩盖了 5 道门的真实状态。

**当前配置**（`.jscpd.json`）：`minTokens: 60`、`minLines: 6`、`mode: "mild"`、扫 `packages scripts`、`ignore` 只有 `**/tests/**` 与 `**/tsdown.config.ts`、`exitCode: 1`。

**克隆的形态（抽样，说明为什么这是决策而不是纯 bug）**：

- `client/ui-semantic-layer/src/client/schemaGatewayBridge.ts [5:1 - 59:17]`（55 行 / 185 token）与 `client/ui-semantic-layer/src/client/types.ts [19:1 - 71:26]`（53 行 / 167 token）—— 大段**类型/契约声明**重复，去重要动跨包契约。
- `client/ui-present-decomposition/src/client/DecompositionCard.tsx` 内部多处 10-13 行的 JSX/props 重复 —— 典型的组件样板。
- `code-runtime/code-runtime-data-python/src/index.ts` 12 行 / 88 token —— 同文件内相邻分支。
- `scripts/oxlint-contract.spec.ts [163:55 - 172:6]` 与 `[205:73 - 214:6]`（10 行 / 87 token）—— **spec 自己的表驱动断言**重复；注意 `ignore` 里写的是 `**/tests/**`，而根 `scripts/*.spec.ts` 不在 `tests/` 目录下，所以 spec 也被扫。

## 决策点（先答这三条，再动手）

1. **spec 文件要不要进 duplication 语料？** 现有 `ignore: ["**/tests/**"]` 的意图明显是「测试不算重复」，但根级 `scripts/**/*.spec.ts` 因不在 `tests/` 下而漏进语料。若认为意图一致，就补 `**/*.spec.ts`（或 `scripts/**/*.spec.ts`）到 ignore——这是**口径修正**，不是放水。
2. **类型/契约声明的重复算不算债？** 55 行的类型块重复在 TS 里常见且未必该抽公共包。若不算，考虑提高 `minTokens`、或对这类文件用 `/* jscpd:ignore-start */`。
3. **组件样板呢？** 若认为该抽，那就是真去重任务，需逐个评估，规模由本票统计给出（89 clones / 1379 duplicated lines / 0.33%）。

## Acceptance

- 上述三个口径问题各有明确答复并落在本票里（谁拍的、理由）。
- 按答复执行：改配置 / 加局部 ignore / 真去重，任一路径都要让 `pnpm run duplication` exit 0。
- `node 24 / snapshots and artifacts` 不再因本门 fail-fast，被它掩盖的 5 道门（含 `doc-typecheck:contracts-ready` → [T15](T15-doc-typecheck-plan-sketches.md)、`node-next types`）暴露出各自真实状态并各自归票。
- **不接受**把 `exitCode` 改成 0 或直接删门——那只是把红变成隐形。
