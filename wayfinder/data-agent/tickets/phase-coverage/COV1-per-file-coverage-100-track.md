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

## 当前状态（2026-09-21）

| | 值 |
| --- | --- |
| master（`78f53287d1`）上的剩余 | **6673 处 / 46 包** |
| PR [#175](https://github.com/McKenzieIT/deepseek-harness-da/pull/175) 合入后 | **6197 处 / 42 包**（已由 CI 实测，非推算） |
| #175 全部合入后（master `3f6ad7a308`） | **5310 处 / 30 包**（raw 5310 / unique 5307；3 条重复行见下） |
| PR [#176](https://github.com/McKenzieIT/deepseek-harness-da/pull/176)（eval-cli batch 1，已合并 `fecd5b7fe1`） | **4577 处**（CI 实测，非推算；unique 4575） |
| PR [#178](https://github.com/McKenzieIT/deepseek-harness-da/pull/178)（p15-probe 移 `dev/`，已合并 `dbe703f153`） | **4444 处**（移位收益，非覆盖；unique 4442。消失 133 全是 `src/p15-probe.ts`，新增 0） |

**计数口径注意：CI 清单有重复行，raw ≠ unique。** master `3f6ad7a308` 的 Windows 清单抓出 **5310 行**但只有 **5307 条 unique**：`ui-context-layer/src/client/graph-animations.ts:384:20`、同文件 `:81:12`、`eval-cli/src/compare.ts:79:10` 各出现两次。eval-cli 因此 raw 1499 / unique **1498**。Round 49 的家族收尾账用的是 unique 口径，逐条 diff 也必须先 `sort -u` 再 `comm`，否则重复行会同时算进「消失」和「新增」。

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
| tool-family batch 2+3 | [#175](https://github.com/McKenzieIT/deepseek-harness-da/pull/175)（同 PR，已合并 `778ce34934`） | 12 包 / 886 处 | 6197 → **5310**（消失 886 unique、新增 0，零回归；含 `nl2sql-engine` +1 附带） | B 档 8 + C 档 4；家族 16/16 全清 |
| eval-cli batch 1 | [#176](https://github.com/McKenzieIT/deepseek-harness-da/pull/176) | 1 包 / 5 文件 / 639 处 | 5310 → **4577**（raw；unique 5307 → 4575。消失 733 = 639 目标 + 93 附带 + 1 列号互换；真新增 **0**） | 口径 A 首批；含一处 Windows 真 bug 修复（见下）。已合并 `fecd5b7fe1` |
| p15-probe 移位 | [#178](https://github.com/McKenzieIT/deepseek-harness-da/pull/178) | 1 文件 / 133 处 | 4577 → **4444**（raw；unique 4575 → 4442。消失 133 全是 `src/p15-probe.ts`；新增 **0**） | **移位非覆盖**：`src/p15-probe.ts` → `dev/`（既有申报归属）。已合并 `dbe703f153` |

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
9. **代码注释里写的「这做不到」不是证据，是待验证断言 —— 而且它会把工作面直接砍掉。** eval-cli 的 `scope-id.spec.ts:20-23` 与 `harness-responder.spec.ts:8-14` 都言之凿凿地说：本包没有 `src/invariant.ts` companion，所以 in-process `ctx.plugin()` 的测试**做不了**，于是 `bootContext()` 只在子进程测（而子进程 coverage 归不到本进程）。读一眼 `scripts/test-invariants.ts:118` 就知道 companion 缺席时返回 `[]`、**缺席不是错误**；全仓约 20 个包这么干。一个 7ms 的 probe spec 就能证伪。**代价是 761 处（`harness-responder` 219 + `context` 542，占 eval-cli 的 51%）被长期判成「结构上做不到」。** 纪律：拿「做不到」当规划前提之前，先花五分钟写个 probe 证伪它；注释的作者当时可能只是没试过。同理，**自己新写的注释也别乱下「不可能」的断言**——本批就有一条 agent 新写的注释把不可达路径描述错了，已就地改正。
10. **本机 100% ≠ CI 100%，而差额可能小到只有 2 行 —— 这正是「不许用总数相减」的理由。** Round 50 本机 `harness-responder.ts` 报 `100|100|100|100`，Windows CI 上却还剩 2 处（`374:7`、`374:79`）。总数相减得 731、预期 639，差 92 —— 而那 92 其实是附带覆盖（好事），真正的问题藏在另一个方向，两者互相抵消后**总数看上去只差一点点**，极易被判成噪音。逐条 diff 直接指到具体两行，根因是 `new URL(...).pathname` 在 Windows 上产出 `/C:/…`（详见 batch 1 节）。**推论：跨平台分歧只有 CI 能发现，而发现它的唯一手段是逐条 diff。**
11. **改了被测代码所依赖的 seam，必须重跑变异验证。** Round 50 把 `URL.pathname` 换成 `fileURLToPath` 后，原先靠子类化 `globalThis.URL` 的测试替身**静默失效**——而其中一个用例断言的值恰好等于「替身失效后的真实返回值」，于是**继续绿、理由全错**。只有把 seam 关掉看是否变红，才能区分「真覆盖」和「恰好相等」。同理，**加行会位移未覆盖清单的行号**，逐条 diff 前要先把基线按映射前推，否则纯位移会显示成等量的「消失 + 新增」。

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

---

## 追加：batch 2（2026-09-20，同一 PR #175）

**B 档八包 / 564 处**，目标是各包的 Cordis 契约外壳（`execute` / `presentCall` / `presentResult` / `output.render` / `presentationMeta`），**不重测已被现有 spec 覆盖的纯逻辑** —— 每个 agent 只拿到自己那份逐条目标清单，并被明令「清单外的不要碰」。

| 包 | 位置 | 缺的是什么 |
| --- | --- | --- |
| `tool-trigger-eval` | 110 | `projectMeta` / `execute` / 两个 presenter（`formatTriggerEval` 已覆盖） |
| `tool-edit-definition` | 106 | `execute` / presenter（`computeEdit` 已覆盖） |
| `tool-discover-relations` | 102 | `sanitizeError` / presenter（`execute` 已覆盖） |
| `tool-search-schema` | 73 | `formatSearchSchema` / `execute` / presenter |
| `tool-load-event-definition` | 69 | 仅 `formatEventView` |
| `tool-discover-alt-labels` | 44 | `presentCall` / `sanitizeError` + 若干未达臂 |
| `tool-reachability-delta` | 33 | `presentCall` / `presentResult` |
| `tool-update-table-config` | 27 | `presentCall` / `presentResult` |

本机合并验收（12 包一起跑）：**13 spec / 398 测试全绿**、`Uncovered locations` 0 行、阈值 ERROR 0 条、12 个 `index.ts` 全 100/100/100/100 且非 `0/0/0/0`。oxlint 八包各 0/0；`tsc -b tsconfig.host.json` exit 0。预期 CI（batch 2 单独）6197 → 5633；因与 batch 3 同 PR head，CI 只测组合值（见下「家族收尾账」，Round 49 已裁决）。

**现有用例一律未改** —— batch 2 是纯 append（外加加宽的 import 行）。

### 本批新增的两条经验

1. **首次动用 `/* v8 ignore */`，共 4 处，且是在「先证明不可达」之后。** `tool-edit-definition` 有 2 处、`tool-discover-relations` 有 2 处。两处证明都由主进程**独立从源码重导**，不采信 subagent 断言：
   - `tool-edit-definition`：`execute` 在 `merged === undefined` 时早返回，而 `computeEdit` **每个带顶层 `merged` 的 return 都成对带字面量 `kind` ∈ {'table','event','concept'}**，带 `'metric'`/`'unknown'` 的 return 都不带 `merged`。故 `else if (kind === 'concept')` 的隐式 else 与 catch 里 `kind ?? 'unknown'` 的 nullish 臂均不可达。
   - `tool-discover-relations`：`dimension_refs ?? []` 与 `ref.derivation ?? ''` 读的是 `TableDefinitionSchema` 已解析的数据，而该 schema 对两个字段都声明了 zod `.default()`（`semantic-layer/src/types.ts:288` / `:193`）—— 实跑 `safeParse` 省略 `dimension_refs` 的表，确认回来是 `[]`。故两个回退不可达。
   - **语法细节**：concept 那处必须用 `/* v8 ignore start */` … `/* v8 ignore stop */` 区间，**不能用 `else` 提示** —— TypeScript transform 会把写在 `else` 与 `if` 之间的注释丢掉。
2. **驳回了一种「用 mock 强行走到不可达臂」的做法。** `tool-discover-relations` 的初版用 `vi.doMock` 把 `TableDefinitionSchema` 换成直通替身，以此触达上面那两个 `??`。已删除并改为 `v8 ignore`。**理由**：伪造依赖的校验契约去进入一个生产上不可能进入的分支，等于让测试断言一个不存在的行为，还会让后来的读者以为那两个字段可能缺失。本仓对不可达防御臂的答案是 `v8 ignore` + 写明理由，**而不是**想办法强行走到 —— 这与「不弱断言」是同一条纪律的两面。

### 本批暴露的一处 brief 缺陷（我自己的）

派给 `tool-discover-alt-labels` 的 brief 写「`presentResult` 与 `execute` 都不在清单里（＝已覆盖），不要重测」，**这是错的**：清单里确实有 7 处落在这两个函数内部（`171:7`、`172:9`、`190:7`、`190:27`、`192:53`、`192:58`、`196:60`），只不过「uncovered **function**」那类条目里没有它们。agent 正确地以逐条清单为准、而非以我的 brief 为准。**教训：给 agent 划范围时，只能拿逐条 `file:line:col` 清单当权威，不能拿「未覆盖函数名」这个摘要去反推「整个函数已覆盖」。** 函数入口被覆盖 ≠ 函数内部所有臂都被覆盖。

---

## 追加：batch 3（2026-09-20，C 档四包 / 322 处，家族收尾）

C 档是零散残余 —— 这些包的函数入口都已被覆盖，剩下的是分支边缘。**没有重建骨架、没有重测已覆盖主路径**，纯逐位置补。唯一例外是 `tool-scope-routing`：它的 `list-scopes.ts` / `switch-scope.ts` / `aliases.ts` 三个文件**零覆盖**（A 档），各建了一个新 spec；`scope-hint.ts` 的 27 处是 C 档，追加到现有 spec。

| 包 | 位置 | 性质 |
| --- | --- | --- |
| `tool-scope-routing` | 139 | A 档 112（3 个零覆盖文件各建 spec）+ C 档 27（scope-hint 追加） |
| `tool-search-data-sources` | 141 | C 档（家族里测得最好的，S1–S21 已覆盖主路径，补 residue） |
| `tool-resolve-term` | 22 | C 档（所有函数入口已覆盖，纯分支边缘） |
| `tool-load-table-definition` | 20 | C 档（同上） |

本机合并验收（16 包一起跑）：**13 spec / 398 测试全绿**、全 100/100/100/100、`Uncovered locations` 0 行、阈值 ERROR 0 条。oxlint 四包各 0/0；`tsc -b tsconfig.host.json` exit 0。预期 CI（batch 3 单独）5633 → 5311；组合 CI 实测见下「家族收尾账」（Round 49 已裁决）。

### 本批首次出现「agent 中途因 API 配额耗尽而死」

派出的 4 个 agent 里，**两个最大的（scope-routing 139、search-data-sources 141）在写完测试、复原 src 后、于后续 API 调用时因 402 配额耗尽而死**。但它们的工作产物已落盘：
- scope-routing 的 JSON 回执（9186 字节）完整写出了 —— 3 处 `v8 ignore` 每处带控制流证明 + 变异控制 + 负控，还诚实 flag 了 3 处"已执行但不可观测"的位置 + 1 个超范围 spec（plugin.spec.ts）。
- search-data-sources 的 JSON **没写出来**（死在写回执之前）—— 7 处 `v8 ignore` 没有任何 agent 证明。

主进程因此**逐条独立从源码核实了全部 10 处 `v8 ignore` 的不可达性**，不采信死前 agent 的断言：

- **5 处铁证**（search-data-sources 的 medianBm25 / medianBm25Norm 的 `?? fallback` ×2，ids/path 的 `undefined` 守卫 ×3）：前提是 `SearchHit.score` 为 required `number`（已验 :80）+ `Math.floor(len/2) < len` 对 `len>=1` 成立 + `findJoinPath` 返回 `string[]|null`（已验 :240，null/len<2 已过滤）。运行时不可达。
- **2 处防御守卫**（search-data-sources 的 re-throw :720、join_constraints spread :777）：re-throw 依赖 expandQuery 的 catch（expand-query.ts:124）**无条件吞所有非 wiring 错误 return question**（已验源码），唯一传播的是 try 之前的 `resolveEnrichmentLlmConfig` wiring 错误，已被上面 arm 处理；join_constraints spread 依赖 SemanticLayerService 同时实现 `getRelationGraph`（semantic-layer/src/index.ts:435）和 `loadRetrievalCorpus`（:91），故"graph 在但 corpus 缺"不可能共存。合理不可达（依赖 Cordis `ctx.get` 不抛 + 唯一 schema provider 的事实，非铁证，但理由清晰且是防御守卫）。
- **3 处**（scope-routing 的 isCjk `?? 0`、buildScopeAwarenessSection 的 length 臂、buildAliasHint 的 `: id` 回退）：回执有详细证明，前提（`for..of` 不 yield undefined、sole caller 的 `<=1` 守卫、同源 `scopes.list`）可从源码推。

### 主进程的变异抽查

因 agent 已死、变异校验是自报，主进程做了端到端变异抽查：改 `tool-scope-routing/src/list-scopes.ts` 的 `extractName`（`? name : id` → `? id : id`），**2 个用例变红**，证明新测试断言真实行为而非形状。复原后 `git diff` 干净。

### 一条本批暴露的方法论

C 档最容易遇到「不可达防御臂」。**正确处置是 `v8 ignore` + 写明理由，不是用 mock 伪造依赖的契约去强行走到。** 本批 10 处 ignore 全部按此处置。但有一处 agent（search-data-sources）在死前**没有写回执证明**，主进程靠独立核实补上了这一步 —— 这是额度耗尽时的必要补救，正常情况应让 agent 自己在回执里给出证明。

### 家族收尾账

| 批 | 包 | 位置 | CI 实测 |
| --- | --- | --- | --- |
| batch 1（A） | 4 | 467 | 6674 → **6197** ✓ |
| batch 2+3（B+C） | 12 | 886 | 6197 → **5310** ✓（Round 49 逐条 diff：消失 886、新增 0；家族 16 包全 0 命中；+1 `nl2sql-engine` 附带，故 5311→5310） |
| **合计** | **16** | **1353** | **20.3% of 6674** |

家族 16/16 全清且 **CI 已裁决**（batch 2+3 同 PR head，CI 只测组合值 6197→5310，Round 49 逐条 diff 零回归）。**PR #175 已合并**（2026-09-20，master → `778ce34934`，merge commit）。`v8 ignore` 共 **14 处**（batch 2 的 4 + batch 3 的 10），每处不可达性均从源码核实。**家族清完后 coverage 轨道口径已重新拍板**（见下）。

## 家族清完后的口径决策（用户 2026-09-20 拍板：A —— 啃 eval-cli）

1353 处清完，剩余约 **5311 处 / 30 包**。分布：

| 包 | 位置 | 占比 |
| --- | --- | --- |
| `eval/eval-cli` | 1499 | 22.5%（之前核实：并不比尾部 30 包加起来多，1692 > 1499） |
| `client/ui-context-layer` | 648 | 9.7% |
| `client/ui-semantic-layer` | 459 | 6.9%（**另一 session 在改**） |
| `data/semantic-layer` | 417 | 6.2% |
| `data/admin` | 306 | 4.6% |

三条路：
1. **啃 `eval-cli` 1499**：单包最大，但 CLI 形态、无 harness 复用。
2. **清包数（尾部优先）**：最小 14 包约 250 处，包数掉得快、位置几乎不动。
3. **第二家族**：找另一组形态同构的包（如 `eval/eval-*` 一族 4 包 1837 处？或 `data/semantic-layer` + `admin` + `nl2sql-engine` 一组）。

**用户 2026-09-20（Round 49）拍板：走 A（啃 `eval/eval-cli`）。**

- **C（第二家族）已机械核实否决**：剩余 30 包里没有与 `data/tool-*` 同规模的同构家族。大债全在大的多文件包（eval-cli 8 文件、`client/ui-context-layer` 15、`client/ui-semantic-layer` 21、`data/semantic-layer` 12、`data/nl2sql-engine` 14）。真正同形状的只有两小组：`query/*`（3 包 268 处，且 query-maxcompute 多文件）、`embedder/*`（2 包 72 处）——复用红利远不及家族，不足以撑一条 C 轨。
- **B（清包数）否决**：位置几乎不动（本票测量陷阱 §1：包数是误导性指标，曾致 40× 误判）。
- **A 选定理由**：eval-cli 1498 处 = 剩余 5310 的 28%，是门真正在乎的「位置」上唯一有分量的单目标。代价：CLI 形态、8 文件、无 harness 复用，须当独立多-session 子轨（像家族一样分批推进）。

### eval-cli 子轨种子（下一棒起点）

eval-cli 1498 处散在 **8 个 src 文件**（非单文件，与家族不同）。下一棒开工：① 先确认 API 额度（Round 48 两个 agent 死于 402）；② 用上文「重建逐包目标清单」命令抓 master 最新 PR 的 Windows job，按文件切分 1498 处；③ 因是 CLI（参数解析 / 子命令 / 输出格式化），逐文件建套件、无共享 harness 复用。

### 追加：eval-cli batch 1（2026-09-21，Round 50，PR [#176](https://github.com/McKenzieIT/deepseek-harness-da/pull/176)）

**639 处 / 5 文件**，四个 agent 各领 disjoint 文件。本机逐条 diff（基线 = job `106005017563`）：**消失 639、批内残留 0、新增 0、附带 0** —— 逐文件数与分配数完全吻合。99 tests / 10 files 全绿；五个文件各 `100|100|100|100` 且非 `0|0|0|0`；阈值 ERROR 全部只指向 `context.ts`/`main.ts`/`p15-probe.ts`（下一批）；oxlint 全 90 规则 0/0；`tsc -b tsconfig.host.json` exit 0。

| 文件 | 处 | 形态 |
| --- | --- | --- |
| `compare.ts` | 265 | 私有 helper 全部经 `compareRuns` 驱动，temp dir 喂 fixture |
| `harness-responder.ts` | 219 | **in-process 真 boot**（16 插件 / 次，约 0.4s），真 AgentLoop 会话 |
| `event-detect.ts` | 109 | 纯函数 + `DetectEventDeps` 注入缝，零 mock |
| `exp2-prompts-en.ts` | 40 | 纯 prompt builder |
| `report.ts` | 6 | 纯格式化 |

#### 本批推翻了一条一直在压制工作面的错误断言

`scope-id.spec.ts:20-23` 与 `harness-responder.spec.ts:8-14` 都写着：**eval-cli 没有 `src/invariant.ts` companion，所以任何 in-process `ctx.plugin()` 的测试都做不了** —— 并以此为由把 `bootContext()` 只放在子进程里测（子进程 coverage 归不到本进程）。

**该断言是错的。** `scripts/test-invariants.ts:118` 的 `testInvariantCompanionPaths` 在 companion 缺席时返回 `[]`，缺席**不是错误**；全仓约 20 个包在测试里挂插件而没有 companion。主进程写了一个 probe spec 在 eval-cli/tests 下 `new Context()` + `await ctx.plugin(...)`，**7ms 通过**。

代价是实打实的：这条错误断言把 `harness-responder.ts` 的 219 处和 `context.ts` 的 542 处（合计 761，占 eval-cli 的 51%）判成了"结构上做不到"。本批据此改走 in-process 真 boot，219 处全清。**两处 header 已就地更正，避免再被继承。**

#### 三处生产源码改动（每处的不可达性都由主进程独立从源码重导，不采信 agent 断言）

| 位置 | 处置 | 依据 |
| --- | --- | --- |
| `compare.ts` `pad()` | 改 `s.padEnd(w)`，**删死分支而非标注** | 两个调用点均 `w=18`，最宽输入是 `CATEGORY_ORDER` 的 `'Voice DELIVERY'`(14)；`Category` 类型只含那 5 个字面量。`padEnd` 逐字等价且零分支。`rpad` 不动 —— 它 `w=16` 的调用点吃动态 label，两臂都真能走到，已被测 |
| `report.ts:38` | `/* v8 ignore next */` | `buildIntentBreakdown` 在唯一的 `intentMap.set` 前无条件 `entry.total++`，故每个 `IntentRow` 的 `total >= 1`。**保留**：这是除零守卫，按 quality-gates「不可达防御臂标注而非删除」 |
| `harness-responder.ts:483` | `/* v8 ignore start\|stop */` | `raceTimeout` 的 `if (timer !== undefined)` 隐式 else。Promise executor 同步执行、在 `new Promise` 返回前就赋了 `timer`；唯一调用点传函数字面量 + 数值 `CASE_TIMEOUT_MS`，`setTimeout` 既不会抛也不会返回 undefined |

**一条区分**：`pad` 那处不是「防御守卫」，而是手搓 `padEnd` 的常规分支 —— 用标准库替掉手搓实现是**消除**死代码，与「不可达防御臂标注而非删除」不冲突。两类要分开判，不要一律 ignore。

#### 主进程独立复核抓到的、agent 回执没报的问题

- **`tsc -b tsconfig.host.json` 5 个 TS2339**（`Property 'schema'/'agents'/'loader' does not exist on type 'Context'`）。agent 2 的回执列了 vitest/oxlint 但**没跑 host typecheck**。根因：harness 用动态 import 挂插件，spec 自己的 program 里没有那些包的 `declare module` 增强。修法用本仓既有 idiom（13+ 处先例）：`import type {} from '<pkg>'`。
- 修掉 TS2339 后**暴露出第 6 个被掩盖的真错**：`ctx.agents` 一旦被正确定型，`sessionId: string` 就对不上 branded 的 `SessionId` 了。这是「类型错误会掩盖类型错误」的典型 —— 修完一轮要重跑，不能只看条数变少。
- agent 2 写的一条注释把 `String(err)` 臂的生产路径描述成「Cordis plugin 可能 reject 任意值」，而它自己的调查证明 Cordis 会把非 Error **重新包装**成 Error。已就地改成真实路径（动态 `import()` 自身以非 Error 拒绝）。**新写的错注释和继承的错注释一样有害**，本棒刚花了力气推翻一条，不能同时又种一条。

#### CI 裁决抓到一处本机测不出来的 Windows 真 bug（本批最重要的技术发现）

**第一轮 CI（job `106193224865` → 报告头 4579）下来，本机 100% 的 `harness-responder.ts` 在 Windows 上还剩 2 处**：`374:7 branch(if, path 1/2)` 与 `374:79 statement`。按总数相减（5310 − 4579 = 731）会得到一个对不上的数、极易当噪音放过；**只有逐条 diff 才能定位到具体两行**。

根因不是平台互补分支（第三类位置），是**真 bug**：`resolveRepoRoot()` 用 `dirname(new URL(import.meta.url).pathname)` 取起点，Windows 上 `.pathname` 产出 `/C:/a/repo/.../src`（盘符前多一个斜杠、`C:` 降级成普通路径段），`join(dir,'packages')` 变成 `\C:\a\...\packages` 这种非法路径，`existsSync` **恒 false** → 模块相对向上走在 Windows 上**从来没成功过**，一直静默退化到 cwd 兜底。

CI 清单自己就是铁证：结构完全对称的 cwd 兜底 `:382` **全覆盖**，包括与那两条一一对应的 `382:7 path 1/2` 和 `382:79`。

处置：改用 `fileURLToPath`。这是本仓压倒性惯例——**425 处 `fileURLToPath` vs 仅 4 处 `new URL(...).pathname`，而那 4 处里有 2 处正是 eval-cli 这两个文件**（`context.ts:765` 同源缺陷，COV1 此前已独立标注为 Windows-hostile，本批一并修；它在 `withQuery` 块内、整块尚未覆盖，故属纯正确性修复，coverage 上看不出来）。

#### 改完源码顺带炸出的测试假绿（比 CI 那两行更值得记）

原测试靠**子类化 `globalThis.URL` 改写 `pathname`** 来伪造浅安装路径。换成 `fileURLToPath` 后，它走 Node 内部 URL 解析、**根本不看全局 `URL`**，替身直接失效。

**危险的是它不会响**：两个兜底用例里有一个断言的是「返回真实仓根」，而替身失效后模块相对走法**直接成功、返回的正是真实仓根** —— 用例继续绿，理由却完全错了。是变异验证（把 seam 关掉看是否变红）把它揪出来的：**测试 3 变红、测试 2 不变红**，说明测试 2 空转。

修法：① seam 换成 `vi.mock('node:url')` 只重定向本模块自己的路径、其余全部委托真实现（与 `harness-responder-degraded.spec.ts` 的 `node:module` 同型）；② 测试 2 改成 `chdir` 进**第二个合成 checkout**（temp dir 里造 `packages/`+`apps/`），断言落在它上面而非真实仓根——这样两条走法答案不同，断言才有鉴别力。再次变异验证：**两个用例都变红**。

**可复用纪律：改了被测代码用的那个 seam，必须重跑变异验证。** 断言值恰好与「seam 失效后的真实值」相同时，测试会安静地退化成同义反复。

#### 行号位移必须预先算清，否则会被误报成回归

给 `context.ts` 加了 3 行（1 import + 2 注释），它 542 处未覆盖位置的行号整体位移（老行 13 起 +1、老行 765 起 +3）。**naive diff 会显示 542 消失 + 542 新增，看着像大回归。** 做法是把基线清单按映射前推再 diff：前推后与实测**逐条完全一致，只剩 1 条**——被我改的那一行 `768` 上 `??` 的 binary-expr 从 col 45 重报到 col 30（`?? new URL(…)` → `?? fileURLToPath(new URL(…))`）。故 context.ts 是 **542 → 542 零覆盖变化**。

最终账：`5307 − 733 + 1 = 4575`（unique），消失 733 = **639 批次目标 + 93 附带 + 1 列号互换**，**真新增 0**。五个批次文件在 CI 清单全部 **0 命中**，验收标准②满足。

#### p15-probe 移位已落地（PR [#178](https://github.com/McKenzieIT/deepseek-harness-da/pull/178)，单独 PR，已合并 `dbe703f153`）

`src/p15-probe.ts` → `dev/p15-probe.ts`（git 识别为 94% rename）。`{bin,dev}` disposition 的 `count` 3 → 4、`counted('waive')` 34 → 35，**两数都用 `OXC_LOG=debug oxlint .` 在移动前后各跑一次实测得到**，不推算。CI 裁决（job `106221379805`）：报告头 **4444**，逐条 diff **消失 133（全是 `src/p15-probe.ts`）、新增 0**，账 `4577 − 133 + 0 = 4444` 闭合；`p15-probe` 在清单命中 133 → **0**，彻底移出分母。

#### 复现顺带暴露：lint tally 早已漂移，且门发现不了（单开票，不在本棒修）

复现 `{bin,dev}` 计数时**顺带**发现 `UNMATCHED_DISPOSITIONS` 这张表已经漂了，与 p15-probe 移位**无关**：实测 **65** 个 unmatched（1 个落 strict override 内、已豁免、违规 0；64 个在外面）。8 条 `waive` glob **精确**（34/35），但 `keep` 侧声明 15、实测覆盖 28——`apps/desktop` 的 d.mts glob 实测 18（声明 7）、`snapshots` 实测 7（声明 5）；另有 **2 个文件从未被任何 disposition 覆盖**（`packages/tsdown.worker.ts`、`packages/util/lazy-require/tests/fixtures/value.cjs`）。

**为什么一直没人发现**：`scripts/oxlint-contract.spec.ts:263` 只把各条 `count` **求和**跟硬编码总数比，**从不与文件系统核对**——所以这张表可以一直烂下去而门一直是绿的。这是 COV1 陷阱 §2（scoped 覆盖率「静默」≠「已覆盖」）在 lint 契约上的同构：**声明式计数 + 不核对真相 = 假绿。**

本棒**不偷偷修**：两处 keep 计数修正是机械的，但那 2 个未分类文件需要的是一次真实裁定（归哪个桶、为什么），不该由「移一个文件」的 PR 替 lint 契约的维护者发明理由。已在 `run-oxlint.ts` docstring 与 spec 注释里**如实记录**漂移现状与未裁定文件，留待单开票处理。

#### 编排复盘

- **4 agent 并发、各领 disjoint 文件、明令零 git 写** —— 沿用有效。两个撞上不可达臂的 agent **都正确拒绝改源码**（brief 未授权）并附证明上交，证明本身经复核**都成立**。这比让 agent 自行决定改源码好。
- **brief 内部有一处自相矛盾**：shared §3 规定不可达臂用 `v8 ignore`，而 per-agent brief 写「不要改 src」。agent 2 判定 §3 优先并如实披露；agent 1、agent 4 判定不改并上报。**三者都合理，但这是 brief 的缺陷**：下一批要把「谁有权改 src、改什么」写成单一来源。
- 中途本机 runner 断连约 10 分钟，4 个 agent 全部存活并自行恢复（agent 2 还清掉了自己的临时 probe 文件）。

#### 剩余 726（下一批）

`context.ts` 542 + `main.ts` 184 = **726**（`p15-probe.ts` 133 已由 #178 移出分母）。`context.ts` 补法已拍板：**给 17 个 module-private 符号加 `@internal` 导出**（本仓先例：`packages/core/tools/src/index.ts` 多处、`packages/subagent/subagent/src/internal.ts`）。`main.ts` 的 in-process 化形态待定（见下）。

`p15-probe.ts` 已落地：见上「p15-probe 移位已落地」节（PR #178，已合并）。

---

## 归属核实（2026-09-20，回答"da 该不该管这 6000+ 处"）

**问：这 6674 处是给上游 dsh 补测试，还是给 da 自己的东西补？**

**答：全是 da 自有。** 对 46 个有未覆盖位置的包逐个判：在 merge-base `0d1f50007f`（UM18 §1.1 指定的归属基线）下 `git ls-tree` —— **46 个包在该基线时一个都不存在**，全部是 fork 在合并之后新建的生产包。零处落在上游 dsh 产品代码上。准则"绝不修改上游产品代码"未被违反，也无需为上游补任何测试。

这与建设历史一致：[P1](../phase-0/P1-data-agent-scaffold.md)–[P13b](../phase-3/P13b-nl2sql-engine-prod-hardening.md) 系列 prototype 票反复写「真 packages/data/xxx 落地」「生产 packages/eval/xxx」「生产 packages/query/xxx」—— da 在 fork 里**从零新建了一整套数据代理能力**（语义层、NL2SQL 引擎、查询引擎、检索/向量化、审计、admin、credentials、eval、十几个 model-facing tool 包、client UI 层、code-runtime 等），规模上与上游 dsh 这个 harness 本体相当甚至更重。

**为什么会有这么大的测试债？** 建设模式是 prototype-driven：每张 P 票先验可行性（prototype + 几个场景绿）再落生产包，**重功能验证、轻逐文件覆盖**。少数包从一开始就带 100% 覆盖（如 [P11b](../phase-4/P11b-eval-harness-hardening.md) 「201 tests + coverage 100%」），但大多数包是「prototype 落地 + 后续补覆盖」的模式，后续补覆盖这步一直没系统做 —— 直到覆盖率门把它们全暴露出来。

**所以"数百 PR 的长期工程"这个规模判断成立且诚实**：它是 da 自有代码的测试债，不是上游债，也不是规模误判。6674 处对应的是 da 在 fork 里建的那一整套产品，补完它们 = 给 da 自己的产品补齐测试。这个量级反映的是 da 建设速度远快于补测速度 —— 是 fork 的选择，不是上游的负担。
