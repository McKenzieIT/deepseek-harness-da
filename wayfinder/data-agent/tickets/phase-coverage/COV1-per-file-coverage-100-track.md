# COV1 — 逐文件 100% 覆盖率门：da 自有包的长期收口轨道

**Type**: task（执行轨道，非单一决策；见下「为什么它是 task 而不是 grilling」） · **Status**: open · **Phase**: coverage
**Assignee**: unclaimed
**Blocked by**: nothing —— 每一批都可独立取用
**Serves**: 让 `windows node 24 / coverage` 这道逐文件 100% 门在 da 自有包上真正转绿，且不靠豁免、不靠下调阈值
**Related**: [UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md)（起点账本：其 §1 + 「终局棒（2026-09-19）」§一/§三/§五 + 「coverage 独立轨道【第一棒】（2026-09-20）」节）；`.agents/notes/implemented/process/2026-06-11-quality-gates.md:20`（`/* v8 ignore */` 的授权与边界）

> **Provenance（2026-09-20）**：本轨道从 [UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md) 毕业而来。UM18 是 `0d1f50007f` 同步后的残余红门总账；到 2026-09-19 为止，上游合并部分已无残余（`upstream-status` behind 0 / owed 0 / consistent，`snapshots and artifacts`、`verify-config-catalog`、`duplication` 均绿），**唯一挂在该专项名下的未完项就是 coverage**。而 coverage 是 6000+ 处位置、数百个 PR 的长期工程 —— 量级上不属于一个同步专项。用户 2026-09-20 确认采纳该建议：**coverage 剥离为独立轨道（本票），UM18 `Status` 改为 closed**。这是**专项边界**判定，不是 map 级 out-of-scope：该工作仍在 data-agent map 的 destination 内。
>
> **命名警告：`UM18` 是复用过的编号。** map 的 2026-09-15 条目里写的「UM18 → 归位为 B-DA7」指的是**另一张**更早的 UM18（phase-gate 基础设施故障无终止态），它已改名为 [B-DA7](../phase-misc/B-DA7-phase-gate-infrastructure-failure-terminal-state.md)。那次归位把 upstream-merge 的 open 计数清零之后，**又新建了一张复用 `UM18` 编号的票**（`UM18-post-0d1f50007f-residual-red-gates.md`），就是本轨道的起点账本。读 map 的 upstream-merge 段时若看到「专项前沿为空 / 0 open」，那是针对**旧** UM18 的账，不覆盖新 UM18 及其后的五个 session。

## Question

这道门要求 da 自有包**逐文件** 100% statements/branches/functions/lines。剩余量是数千处位置，一次 session 装不下。问题不是「怎么补一个包」，而是**按什么顺序、用什么单位成本的补法，能在不放宽门的前提下收敛**。

## 为什么它是 task 而不是 grilling

wayfinder 默认「出决策不出交付物」。本票是显式例外：排序口径与补法已由用户拍板（见下），剩下的是纯执行 —— 按批补测试、走 PR、按两条标准验收。**它之所以需要一张票而不是散在 session prompt 里**，是因为它跨数十个 session，而每个 session 都需要同一套起点数字、同一套验收标准、同一套测量陷阱清单。把这些留在交接 prompt 里，已经导致过一次量级误判 40 倍（见下「测量陷阱」§1）。

## 当前状态（2026-09-20）

| | 值 |
| --- | --- |
| master（`78f53287d1`）上的剩余 | **6673 处 / 46 包** |
| PR [#175](https://github.com/McKenzieIT/deepseek-harness-da/pull/175) 合入后 | **6197 处 / 42 包**（已由 CI 实测，非推算） |

**唯一可信的测量腿是 `windows node 24 / coverage`。** Linux 的 `node 24 / coverage` 目前是 **0 信号**而不是「覆盖率红」：`scripts/prepare-ci-bubblewrap.sh`（与上游逐字相同）把下载地址写死到 Ubuntu pool 的 `bubblewrap_0.9.0-1ubuntu0.1_amd64.deb`，pool 只保留当前版本、该文件已被轮换掉 → HTTP 404 → 该 job 在「Install dependencies and prepare bubblewrap」失败、「Run exhaustive coverage」**skipped**。**它根本没测量 coverage，补多少测试都不会让它转绿。** 归属上游（上游自己同样坏），不修。同批被打死的还有 `node-24-consumers`（显示名 `snapshots and artifacts`）与 `node-compat`（node 22.19 / 24.9 / 26）。复检条件：上游 bump 这个 pin 后自愈，届时可恢复两腿对照。

## 排序口径（用户 2026-09-20 拍板）

**按 `data/tool-*` 家族推进** —— 不走「清包数（尾部优先）」，也不走「清位置数 → `eval-cli`」。

| 方案 | 位置数 | 包数 | harness 复用 |
| --- | --- | --- | --- |
| **`data/tool-*` 家族（选定）** | 1353（**20.3%**） | 16（**35%**） | 1 套复用 16 次 |
| `eval/eval-cli` | 1499（22.5%） | 1（2.2%） | 无（CLI 形态，定制活） |
| 尾部优先 | 最小 14 包约 250（约 3.7%） | 最快 | 无 |

选定理由：家族方案在**两个指标上同时动**，且 16 个包里 **15 个是单文件 `src/index.ts`**，形态同构 → 一套 agent-tool 契约 harness 摊到 16 个包。`eval-cli` 单包位置产出略高但只清 1 个包且无法复用；尾部优先包数好看但位置几乎不动（2026-09-19 那一棒实测：清掉 14 个包只占位置总量 **1.2%**）。

## 补法：三档分治，共用一套契约 harness

判据是 CI 清单里的**未覆盖函数名**，不是形态猜测。`execute` 在 11 个包未覆盖、`presentCall` 10 个、`presentResult` 9 个 —— 缺的是 Cordis 工具接线那一层。

- **A 档 —— 模块实际完全没被测到**：从零建套件（先跑通 `apply()` 注册 → `execute` → `presentCall`/`presentResult` 契约骨架，再铺行为用例）。
- **B 档 —— 纯逻辑已测、契约外壳未测**：**只补外壳，不重测已覆盖的纯逻辑。** 重测既浪费，又会把真实缺口埋进噪音、让 reviewer 看不出 PR 补了什么。
- **C 档 —— 真正的零散残余**：沿用逐位置补，不强行套 harness（形态各异，复用收益为负）。

**「一包一套测试」这个更早的提法是不准的**：对 B 档包而言「整包」大部分已经测过了，从零建套件反而是浪费。见 UM18「第一棒」节 §一。

harness 模板从 `packages/data/tool-search-data-sources/tests/search-data-sources.spec.ts` 提炼（该包的契约面在 CI 清单里 0 命中，证明这套写法确实能覆盖外壳）。**`.jscpd.json` 已 ignore `**/tests/**` 与 `**/*.spec.ts`**，所以每包各放一份模板不触发 duplication 门（已核实，不是假设）。

## 验收标准（每个 PR 两条都要满足）

1. **CI 未覆盖总数的下降值与该批位置数吻合 —— 用逐条 diff 清单，不要用总数相减。**
2. **该包从清单里完全消失（0 命中）。**

第 1 条的措辞是刻意的。2026-09-20 的 batch 1 实测：预测 −467、实际 −477。总数相减只会看到一个对不上的 9；逐条 diff 能指出那 9 行是 `data/semantic-layer` 的 `loadConceptDefinition` 与 4 个 `io.ts` 分支，**因为新 spec 用真实 `mkdtemp` semantic root 而顺带覆盖到了**。把「对不上」当成回归去查，或当成噪音忽略，都是错的。

## 批次账（append-only）

| 批 | PR | 包/位置 | CI 实测 | 备注 |
| --- | --- | --- | --- | --- |
| （前史）batch-1 | [#170](https://github.com/McKenzieIT/deepseek-harness-da/pull/170) | 2 包 / 11 处 | 已合 | UM18 §1 下的第五棒 |
| （前史）batch-2 | [#172](https://github.com/McKenzieIT/deepseek-harness-da/pull/172) | 4 包 / 7 处 | 6753 → 6746 | 原标题记 16 处不自洽，合并前改正 |
| （前史）batch-3 | [#173](https://github.com/McKenzieIT/deepseek-harness-da/pull/173) | 10 包 / 72 处 | 6746 → 6674 | |
| （前史）平台互补 | [#174](https://github.com/McKenzieIT/deepseek-harness-da/pull/174) | 1 处 | 6674 → 6673 | 见下「第三类位置」 |
| tool-family batch 1 | [#175](https://github.com/McKenzieIT/deepseek-harness-da/pull/175) | 4 包 / 467 处 | 6674 → **6197**（−477，零回归） | A 档；含替换一处假测试 |

## 家族剩余（batch 1 之后）

| 包 | 位置 | 档 |
| --- | --- | --- |
| `tool-search-data-sources` | 141 | C |
| `tool-scope-routing` | 139 | A 112（`list-scopes` 61 + `switch-scope` 36 + `aliases` 15）+ C 27（`scope-hint`） |
| `tool-trigger-eval` | 110 | B |
| `tool-edit-definition` | 106 | B |
| `tool-discover-relations` | 102 | B |
| `tool-search-schema` | 73 | B |
| `tool-load-event-definition` | 69 | B |
| `tool-discover-alt-labels` | 44 | B |
| `tool-reachability-delta` | 33 | B |
| `tool-update-table-config` | 27 | B |
| `tool-resolve-term` | 22 | C |
| `tool-load-table-definition` | 20 | C |
| **合计** | **886** | |

家族清完后，下一个决策点是：继续按「最重单包」推进（`eval/eval-cli` 1499、`client/ui-context-layer` 648），还是转向清包数。**那时需要重新拍板，不要默认沿用家族口径。**

## 测量陷阱（每条都真的骗过人，按踩坑代价排序）

1. **§1 的按包数字是「文件数」不是「位置数」。** UM18 §1 顶部写「167 个 da 文件未达逐文件 100%」，后面那串 `ui-semantic-layer 21、ui-context-layer 15…` 是**文件数**。后续交接文档把它们读成位置数，于是「从最小包起」的排序一头撞进最重的一批（`tool-scope-routing` 记 4、实测 **139**；`eval-cli` 记 8、实测 **1499**）。量级被低估约 **40 倍**。
2. **scoped 覆盖率「静默」≠「已覆盖」。** 对**从未被 import 的文件**，scoped run 报 `0/0/0/0`，逐文件门直接跳过 → 假绿。实例：`ui-present-*/src/index.ts` 都只是 `export function apply(): void {}`，CI 明确列出 `:1:17 uncovered function apply`，但空函数体没有可插桩语句，本机 reporter 静默**证明不了**它已清。**本机只能证伪，最终口径永远是 CI 的 Windows 清单。** 反方向（scoped 报未覆盖可能是假缺口）同样存在。
3. **带通配符的 git pathspec 必须带尾段。** `packages/*/*/src` 在 `git grep` **和** `git ls-tree` 下**都返回 0** —— 这是静默零，不报错。原因是带通配符时 git 用 wildmatch 匹配**完整文件路径**，`packages/a/b/src` 作为目录前缀匹配不上 `packages/a/b/src/index.ts`。能用的形式是 `packages/*/*/src/*` 或 `packages/*/*/src/**`；无通配符的字面量 `packages` 按目录前缀正常工作。**UM18 曾把药方开成 `packages/*/*/src`（两层），那个形式本身就是坏的。** 纪律：拿「零命中」当证据前，先用一个已知必然命中的样本验证 pathspec。
4. **「有 spec 文件」不能当覆盖证据。** `tool-revert-edit` 挂着一个以 `validateAssetName` 命名的 spec，而该函数在清单里未覆盖 —— 因为那个用例把 `apply` 导入成 `_apply` 后从不调用，然后在测试里重写一遍校验正则再断言自己写的表达式（同义反复）。文件其余部分测的是**另一个包** `data/audit`。已在 #175 替换。两个特征（`: _xxx }` 丢弃式导入、`expect(<局部变量>).toBe(true/false)`）扫过全部 `packages/*/*/tests/*`，**命中仅此一处** —— 但这只是两个特征的扫描，不构成「不存在其他假测试」的证明。
5. **Windows 日志是 CRLF。** 做清单 diff 前必须 `tr -d '\r'` + 去 ANSI + 去时间戳前缀，否则每行都算不同（「消失」和「新增」会列出同样的行）。
6. **`gh run view --job <id> --log` 在本机 gh 2.73 静默返回 0 字节。** 可靠取法：`gh api repos/McKenzieIT/deepseek-harness-da/actions/jobs/<id>/logs`。找 job id：`gh api repos/.../commits/<sha>/check-runs?per_page=100`。
7. **失败的 coverage job 会产出一个看起来正常但没有清单的日志。** #174 那次（job `105874541449`）13 分钟即失败，日志 514 KB（正常约 2.7 MB），抓位置行 **0 命中**。拿到空清单时先看 job 时长与字节数，不要以为是自己 grep 写错了。
8. **coverage 只在 PR 上跑，master 的 `CI master` 没有这个 job。** 想要 master 的数字，要读最近一个 PR 的 job，并注意它的 base 是否落后。

## 硬约束（这些是禁令，不是偏好）

- **不放宽门**：不加 retry、不吞错、不弱断言、不重录快照、**不把 da 包塞进 `scripts/coverage-exempt.ts`**（用户已明确否决 —— 那会让今后所有 da 代码脱离覆盖率约定）、不下调阈值、不用 `--passWithNoTests`、不窄化 `--coverage.include` 掩盖未覆盖文件。
- **绝不修改上游产品代码。** 只处理 fork 自有额外开发。归属判定：`git diff <merge-base> master -- <path>` 为空即上游文件。注意基线必须是 merge-base，不是 `upstream/master`（上游已远远前进）。
- **`/* v8 ignore */` 可用，但仅限按控制流确实不可达的臂 + 写明理由。** 这是本仓已授权机制（`quality-gates.md:20` 明文「unreachable defensive guards carry `/* v8 ignore */` with stated reasons **instead of deletion**」，master 上 **283 文件 / 903 处**在用），**不是** `coverage-exempt.ts` 的变体，所以「绝不进豁免名单」那条禁令不延伸到它。但每一处都要按控制流核实，不能凭断言；`2026-09-04-client-present-table-fetchresult-wiring.md:54` 记过一次 review 正确否决「加在可达臂上」。**本轨道的优先顺序始终是「把它测到」，ignore 是最后手段。**
- **生产 src/tests/脚本/workflow 一律走分支 + PR**（`verify-no-production-src-on-master` pre-push 会拒）。纯文档可直推 master。

## 第三类位置：平台互补分支（不是内容债，也不是上游债）

`packages/code-runtime/code-runtime-data-python/src/index.ts:119` 是

```ts
return process.platform === 'win32' ? 'process' : 'process-rlimit'
```

Linux 跑时 `'process'`（col 43）那臂不可达、Windows 跑时 `'process-rlimit'`（col 55）不可达 —— **两条腿互相补足，任何单条 lane 都到不了该行 100%**。助长它的是一条弱断言：`tests/runtime.spec.ts:31` 的 `toMatch(/^process/)` 对两臂都成立。处置（#174 已落地）：对 `process.platform` 做注入/复原，在一次运行里覆盖两臂并**按平台断言确切值**（实测该描述符 `configurable: true`）。**不要用 `vitest.config.ts` 的 `windowsOnlyCoverageExclusions` 排除** —— 那是给「只在 win32 执行的整文件」用的，本例两臂都可达。

## 编排（2026-09-19 与 2026-09-20 两轮都奏效，建议沿用）

复用已 `pnpm install` + `build:official` 的 worktree（换分支不丢 `node_modules`，直接 `git checkout -b <新分支> origin/master`，省一次 install + 全量 build）→ 在**同一个** worktree 上开分支 → 起 N 个 agent 各领 **disjoint 包**、**明令不许跑任何 git 写命令**（避免并发 index 竞争；只读 git 允许）→ 每个 agent 用独立 `--coverage.reportsDirectory` → 各写一个小 JSON 回执并只回一行 → **主进程自己重跑合并验收、自己逐包提交**。

2026-09-20 的改进：**先把 harness 模板写成一份共享参考文件**，让所有 agent 用同一套已验证惯例，而不是各自发明。

**subagent 的输出是未验证断言**（CLAUDE.md）。主进程必须自己：① 合并 scoped run 重跑（多包一起跑比逐包跑更接近真相）；② 确认每个 src 文件与 `origin/master` **shasum 相同**（agent 做变异测试会临时改源码，#175 那轮 4 个 agent 合计跑了 199 次单行变异）；③ 扫一遍新 spec 有没有弱断言/同义反复。

## 本机验收命令

`--reporter=basic` 在 vitest 4 已移除，加了会启动失败。

```sh
pnpm exec vitest run <pkg>/tests --coverage \
  --coverage.include='<pkg>/src/**/*.ts' --coverage.include='<pkg>/src/**/*.tsx' \
  --coverage.reportsDirectory=.tmp/cov-run/<slug>
```

目标：`Uncovered locations` 0 行、阈值 `ERROR` 0 条、该包 src 100/100/100/100，**且不是 `0/0/0/0`**（见陷阱 §2）。

## 重建逐包目标清单

把 `<jobid>` 换成最新的 Windows coverage job：

```sh
gh api repos/McKenzieIT/deepseek-harness-da/actions/jobs/<jobid>/logs > /tmp/cov.log
grep -aoE "packages/[^ ]+:[0-9]+:[0-9]+ uncovered .*$" /tmp/cov.log \
  | sed 's/\x1b\[[0-9;]*m//g' | tr -d '\r' | sed -E 's/^[0-9T:.\-]+Z +//' | sort > /tmp/cur.loc
wc -l /tmp/cur.loc                                             # 应等于报告头那个数
sed -E 's#^packages/([^/]+/[^/]+)/.*#\1#' /tmp/cur.loc | sort | uniq -c | sort -rn   # 按包分布
```

## 并发注意

`client/ui-semantic-layer`（459）、`data/evidence-query`（37）、`data/patrol-mode`（58）在 2026-09-19/20 期间有**另一个 session 在改其生产 `src/`**。取这几个包前先 `git status` 辨明归属，**绝不 `git add .` / `git add -A`**。
