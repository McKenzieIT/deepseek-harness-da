# T14 — ci.yml / ci-master.yml startup_failure：fork 的 CI 静态与覆盖门从未真正执行过

**Type**: bug（workflow syntax；根因已定位 + 已修）
**Phase**: post-discovery
**Status**: fixed 2026-09-15（与本票同一 PR 落地；验收证据 = 该 PR 自身首次出现 `ci.yml` 的 job）
**Assignee**: codex-session-2026-09-15
**Severity**: high —— 不是某个门红，而是**整条 CI 静态/覆盖链从未运行**，本地 `pnpm run check:ci:*` 是唯一真实证据来源
**Related**: 发现于 data-agent 的 [UM17](../../data-agent/tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md) 收口审计（查 PR #130 门禁清单时发现应有的 CI job 一个都不在）；[T6](T6-ci-checkout-issue-policy.md)（同为 CI workflow 域）；upstream `61f910d ci: split master-only jobs into ci-master.yml` 引入的 `ci-master.yml`

## Question

为什么 fork 的 PR 门禁清单里只有 Release / Node Addon / Matrix 这几项，而 `ci.yml` 声明的 12 个 job（含跑 `check:ci:static` 的 `node-24`、`node-24-coverage`、`all-checks-passed`）一个都不出现？

## 症状（实测，非推断）

`gh run list` 里 `ci.yml` 与 `ci-master.yml` 的运行长期是这个形状：

```
completed  failure  .github/workflows/ci.yml         push  0s   run 34856018515
completed  failure  .github/workflows/ci-master.yml  push  0s   run 34856019977
```

三个特征合起来就是 GitHub 的 **startup_failure**：耗时 **0 秒**、`jobs: []`（API 查询为空数组）、显示标题是**工作流文件路径**而不是 `name:` 字段的值（GitHub 读不到 `name` 时才这样）。因此没有任何 job 被创建，也没有任何门被执行。

## 根因（两个文件、三处语法破损，actionlint 逐一确认）

**① `ci.yml`：重复的顶层 `concurrency:` 键**

```
.github/workflows/ci.yml:35:1: key "concurrency" is duplicated in workflow. previously defined at line:18,col:1 [syntax-check]
```

两处内容并不相同：第 18 行那块 `cancel-in-progress: ${{ github.event_name != 'push' }}`，上方注释明确说明 push 运行携带 self-hosted standby drill、**不能**被取消，并引用 `.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md`；第 35 行那块是 `cancel-in-progress: true`，会取消 push 运行，与上一条的结论直接冲突。GitHub 对重复顶层键**直接拒绝整个文件**。本地 PyYAML 默认允许重复键（后者静默覆盖前者），所以任何本地 YAML 解析都看不出问题——这正是它能存活这么久的原因。

**② `ci-master.yml`：两个 job 级 `if:` 被顶格写在第 0 列**

`larger-runner-benchmark`（原 283 行）与 `consolidated-runner-benchmark`（原 394 行）的 `if:` 缩进为 0，YAML 因此把它当作新的顶层键，而它出现在 block mapping 内部 → 结构错误：

```
.github/workflows/ci-master.yml:287:0: could not parse as YAML: yaml: line 287: did not find expected key [syntax-check]
```

**③ `ci-master.yml`：`timeout-minutes` 被粘在折叠标量末尾（2 处）**

```yaml
    runs-on: >-
      ${{ ... && matrix.blacksmith
          || matrix.runner }}    timeout-minutes: 15
```

`timeout-minutes: 15` 缺一个换行，被吞进 `runs-on:` 的折叠标量里。②③ 同时存在，修掉 ② 之后 ③ 才会暴露。

## 修复

① 删掉第二块 `concurrency:`，保留第 18 行那块（它是有文档依据的那一个），并在原位留注释说明这里曾有一个重复键以及它造成的后果。② 两处 `if:` 缩进回 4 空格。③ 两处 `timeout-minutes: 15` 换到独立行。**不改任何 job 的语义**：触发条件、并发组、runner 选择表达式、超时值全部保持原值。

## 验证

```sh
actionlint .github/workflows/ci.yml .github/workflows/ci-master.yml   # 无 syntax-check 报错
```

修复后两个文件的 job 清单第一次可读（此前 YAML 根本解析不了）：

- `ci.yml`（trigger `pull_request`，12 job）：`node-24`、`node-24-coverage`、`node-24-bench`、`node-24-consumers`、`node-compat`、`python-sdk`、`python-runtime`、`windows-build`、`windows-coverage`、`windows-native-tests`、`windows-observational`、`all-checks-passed`
- `ci-master.yml`（trigger `push` + `workflow_dispatch`，7 job）：`python-runtime`、`windows`、`serial-linux-selfhosted`、`serial-macos`、`serial-windows`、`larger-runner-benchmark`、`consolidated-runner-benchmark`

actionlint 剩余提示只有自建 runner 标签未知（`vm-backup`、`dsh-win-ci` 等），属预期，需要 `actionlint.yaml` 才能消除，与本票无关。

## 影响与后续

此前所有「CI 绿」的说法都只覆盖 Release / Node Addon / Matrix 这几条**独立** workflow；`check:ci:static`、`check:ci:coverage`、Windows 门在 CI 里**一次都没跑过**。修复后它们会第一次真实执行，**很可能立刻暴露一批既有红门**（本地全量 `check:ci:static` 的历史基线是 37 passed / 11 failed，2026-09-14 在 resync 树上是 51/51；两者都不是在 CI 环境里测的）。这不是回归，是第一次看见真相；逐条分诊归各自 effort，不要因此把本票重开。

## Acceptance

- `actionlint` 对两个文件无 syntax 报错。（已满足）
- 承载本修复的 PR 上第一次出现 `ci.yml` 的 job，且它们真的执行（不再是 0 秒 failure）。
- `ci-master.yml` 在 master 上的 push 运行不再是 startup_failure。
- 首批真实失败逐条归票，不与本票混为一谈。
