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

## 首个真实 CI 运行的结果（2026-09-15，PR #135）

修复合入前，承载它的 PR 自身就成了验收证据：`ci.yml` 的 job 第一次真的出现——`node 24 / static`、`node 24 / coverage`、`node 24 / benchmarks`、`node 24 / snapshots and artifacts`、`node 22.19` / `24.9` / `26`、`windows node 24 / build|coverage|native tests|observational`、`python runtime / release-shaped matrix / *`、`python 3.10 / keyless SDK`。

**第一条真实失败已就地分诊并修掉**：`node 24 / static` 在 `verify-upstream-sync-record` 上 fail-fast，报

```
history[0]: upstreamTag "dsh-v0.1.3-alpha.1" does not point at d347e703908d; git tags: (none)
```

根因不在记录里，而在门本身：`actions/checkout` **即使 `fetch-depth: 0` 也不拉 tag**，于是 `git tag --points-at` 返回空列表，而 `verifyTag` 把「本地没有这个 tag」和「tag 指向了别的提交」当成同一回事，前者本该像 sha 检查那样报 `skipped`（该门自己的设计原则就是「本 checkout 无法验证的记为 skipped 而非 failed」）。修法：先 `git rev-parse --verify refs/tags/<tag>`，不存在则 `skipped`。**tag 存在但指错**仍然是 failure（有测试钉住两个方向）。验证：owning suite 15/15；本地有 tag 时门仍 exit 0 并照常交叉核对；用 `git clone --no-tags` 复现 CI 条件时 failures 从 1 降到 0。

这条确立了后续分诊的模式：**新暴露的红先判「门的环境假设错了」还是「代码/文档真的坏了」**，前者修门，后者归各自 effort。

## 首次真实 CI 运行的完整清单（run 34918859164，head `c000720b7a`）

17 个 job：**12 success / 5 failure**。这是本 fork 第一次拿到 CI 的真实图景。

| job | 结果 | 归属 |
|---|---|---|
| `node 24 / static` | **success —— 51 门全过** | 阻塞门，已绿 |
| `node 22.19` / `node 24.9` / `node 26` / `node 24 / benchmarks` | success | — |
| `windows node 24 / build` / `native tests` | success | — |
| `python runtime / *`（4）+ `python 3.10 / keyless SDK` | success | — |
| `node 24 / coverage`、`windows node 24 / coverage` | failure | **既有票 [T11](T11-test-coverage-failing.md)** —— `scripts/gen-tsconfig-paths.spec.ts` + `scripts/generator-inputs.manifest.spec.ts`，与 T11 记的「2 failed suites」吻合 |
| `node 24 / snapshots and artifacts` | failure | **`duplication`（jscpd 89 clones）** fail-fast 掐掉后续门。**无票**，见下 |
| `windows node 24 / observational` | failure | 非阻塞清单 lane，一次列全：`duplication` / `publint`（既有票 [T10](T10-publint.md)）/ `node-next types`（**无票**）/ `doc-typecheck:contracts-ready`（既有票 [T15](T15-doc-typecheck-plan-sketches.md)）/ `verify-upstream-sync-record`（**无票**，见下） |
| `all checks passed` | failure | 汇总 job，随上面几条红 |

**逐条已核为 pre-existing、非本 PR 引入**：`duplication` 在 `origin/master`（`793df1c610`）上用同一命令实测同样 **89 clones / exit 1**，且 clone 报告里**没有本分支新增的任何文件**；coverage 两个 suite 与 T11 记载吻合；`publint` / `node-next types` 早于本轮。

### 那两条红的后续（2026-09-15 当日结掉）

1. **`duplication`（jscpd 89 clones）→ 已建票 [T16](T16-duplication-gate-89-clones.md)**（含三个待拍板的口径问题：spec 是否进语料、类型声明重复是否算债、组件样板是否该抽；并记录它 fail-fast 掩盖了 5 道门）。
2. **`verify-upstream-sync-record` 在浅 checkout 下仍红 → 已修**（同日，与 tag 那条同一缺陷类；见下方修法，已有测试钉住两个方向，浅 clone 复现从 3 failures 降到 0） —— 与本票已修的 tag 问题**同一缺陷类**：3 个 `keep` 决定的 waiver 命中数为 0 时被判 failure，而它自己的报错文本就写着「stale, **or its window is not verifiable here**」。Windows lane 是浅 checkout，`history[0]`/`history[1]` 的对象全不在（同一次输出里就有 4 条 `[skipped] … not in this checkout`），此时 0 命中**无法**证明 waiver 陈旧。修法与 tag 那条对称：**本 checkout 里若有任何 window 未能解析，0 命中的 waiver 记 `skipped` 而非 `failed`**；只有全部 window 都解析成功时，0 命中才等于陈旧。Linux static lane 用 `fetch-depth: 0` 所以已绿——这恰好证明它是环境脆弱性而非记录问题。

## Acceptance

- `actionlint` 对两个文件无 syntax 报错。（已满足）
- 承载本修复的 PR 上第一次出现 `ci.yml` 的 job，且它们真的执行（不再是 0 秒 failure）。
- `ci-master.yml` 在 master 上的 push 运行不再是 startup_failure。
- 首批真实失败逐条归票，不与本票混为一谈。
