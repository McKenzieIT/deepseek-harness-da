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
| tool-family batch 2+3 | [#175](https://github.com/McKenzieIT/deepseek-harness-da/pull/175)（同 PR，已合并 `778ce34934`） | 12 包 / 886 处 | 6197 → **5310**（消失 886 unique、新增 0，零回归；含 `nl2sql-engine` +1 附带） | B 档 8 + C 档 4；家族 16/16 全清 |

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

---

## 归属核实（2026-09-20，回答"da 该不该管这 6000+ 处"）

**问：这 6674 处是给上游 dsh 补测试，还是给 da 自己的东西补？**

**答：全是 da 自有。** 对 46 个有未覆盖位置的包逐个判：在 merge-base `0d1f50007f`（UM18 §1.1 指定的归属基线）下 `git ls-tree` —— **46 个包在该基线时一个都不存在**，全部是 fork 在合并之后新建的生产包。零处落在上游 dsh 产品代码上。准则"绝不修改上游产品代码"未被违反，也无需为上游补任何测试。

这与建设历史一致：[P1](../phase-0/P1-data-agent-scaffold.md)–[P13b](../phase-3/P13b-nl2sql-engine-prod-hardening.md) 系列 prototype 票反复写「真 packages/data/xxx 落地」「生产 packages/eval/xxx」「生产 packages/query/xxx」—— da 在 fork 里**从零新建了一整套数据代理能力**（语义层、NL2SQL 引擎、查询引擎、检索/向量化、审计、admin、credentials、eval、十几个 model-facing tool 包、client UI 层、code-runtime 等），规模上与上游 dsh 这个 harness 本体相当甚至更重。

**为什么会有这么大的测试债？** 建设模式是 prototype-driven：每张 P 票先验可行性（prototype + 几个场景绿）再落生产包，**重功能验证、轻逐文件覆盖**。少数包从一开始就带 100% 覆盖（如 [P11b](../phase-4/P11b-eval-harness-hardening.md) 「201 tests + coverage 100%」），但大多数包是「prototype 落地 + 后续补覆盖」的模式，后续补覆盖这步一直没系统做 —— 直到覆盖率门把它们全暴露出来。

**所以"数百 PR 的长期工程"这个规模判断成立且诚实**：它是 da 自有代码的测试债，不是上游债，也不是规模误判。6674 处对应的是 da 在 fork 里建的那一整套产品，补完它们 = 给 da 自己的产品补齐测试。这个量级反映的是 da 建设速度远快于补测速度 —— 是 fork 的选择，不是上游的负担。
