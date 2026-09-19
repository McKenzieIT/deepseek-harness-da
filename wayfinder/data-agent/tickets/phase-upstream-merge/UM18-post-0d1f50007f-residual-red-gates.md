# UM18 — 0d1f50007f 同步后的残余红门（da 内容债，非上游债）

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: —（UM14/0d1f50007f 合并已 land 于 PR #168）
**Blocks**: fork CI 全绿
**Related**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md)（上一轮 red-gate 总账）、[UM17](UM17-post-merge-latest-upstream-and-monitor-validation.md)、`upstream-sync/da-impact-0d1f50007f.md`（本轮复核报告）、`.tmp/dsh-upstream-sync-progress-2026-09-17.md`（Round 17 归属判定）

## 背景

`upstream/master 0d1f50007f`（666 commit）合并进 fork 后，PR #168 首轮 CI：20 pass / 5 fail。**合并造成的 4 项已在本 PR 修掉并本地验证**（issue-management policy 两处上游新断言 vs fork owner-gate、module-graph/persistence-catalog 陈旧、verify-package-paths 断链、verify-export-jsdoc 参数名、doc-graphs 设计换轨、duplication 的按设计克隆）。

剩下 3 项经逐文件归属判定为 **fork 自有内容债**：`master` 上同样红（最近 5 次 master CI 全红），与本次合并无因果关系。上游侧无债，故不适用「上游债隔离」条款。

## 残余红门与验收

### 1. `node 24 / coverage` — 167 个 da 文件未达逐文件 100%

- 分布：`client/ui-semantic-layer` 21、`client/ui-context-layer` 15、`data/nl2sql-engine` 14、`data/semantic-layer` 12、`eval/eval-cli` 8、`eval/eval-runner` 7、`llm/llm-dashscope` 5、`eval/eval` 5、`eval/retrieval-experiment` 4、`data/tool-scope-routing` 4，其余分散在约 10 个 da 包。
- `scripts/coverage-exempt.ts` 与上游逐字相同、无任何 da 条目；用户已否决「把 da 包加进豁免名单」（会让今后所有 da 代码脱离覆盖率约定）。
- 完成条件：按包逐个补测试；每补完一个包，`pnpm run test:coverage` 的该包不再出现在失败清单。

#### 2026-09-17（第五棒）：前两个包已收口，并更正测量方法与三处数字

**已收口两个包**（PR [#170](https://github.com/McKenzieIT/deepseek-harness-da/pull/170)，纯测试、无生产源码改动、无豁免名单条目）：

| 包 | 补掉的位置 | 文件 |
| --- | --- | --- |
| `packages/preset/agent-presets` | 2 | `src/index.ts:720,721` |
| `packages/client/ui-settings-models` | 9 | `src/client/store.ts:114,249`、`src/client/ProviderEditor.tsx:138,201,202,317,432`、`src/client/CustomProviderCard.tsx:200` |

验收（按包 scoped、串行）：exit 0、22 个 spec / 435 条测试全绿、`Uncovered locations` **0 条**、逐文件阈值 `ERROR` **0 条**。

**归属结论：11 处全是 fork 新增行，没有一处是上游债。** 上一棒把 4 处标为「上游文件待判定」，实测这 4 处（以及后来发现的另外 7 处）全部落在 fork 的 `+` 行上，因此都该覆盖，都不需要按「上游门在 fork 不可达」留档。

**两条测量方法上的更正，比数字本身更重要：**

1. **归属基线必须是 merge-base `0d1f50007f`，不是 `upstream/master`。** 上游已经比 merge-base 前进 **882 个提交**（现为 `ddefc45fbc`，release 0.1.6-alpha.2）。§1 那条硬性前置里写的 `git diff --quiet upstream/master master -- <path>` 是在两者还是同一个提交时写的；照字面跑，会把**上游自己那 882 个提交的改动**报成 fork 分叉，从而错误地放行「可以动这个上游文件」。这正是 Round 31 翻车那一类错误的反向版本。

2. **`git blame` 在这里不可信，权威依据是 diff 新侧行号映射。** blame 会跟随 `packages/client/ui-models/` → `ui-settings-models/` 的改名，把 fork 搬过来的文本算给上游作者。blame 判定 `store.ts:114`、`:249` 属上游（作者 Yichen Jiang、2026-07-30，早于 merge-base）；而 `git diff -U0 <merge-base> master` 显示这两行都是 fork 的 `+` 行 —— fork 把 `load()` 的早退失败路径改成了 try/catch 并新增了 `messageOf`。**先跑 blame 会得到相反且错误的结论。**

**三处数字更正：**

- 上一棒交接文档写 `ui-settings-models` 有 **2** 处未覆盖，实测 **9** 处（另外 7 处在两个 `.tsx` 里，同样全是 fork 新增行）。**因此本节顶部那份「167 个文件」的按包分布是低估的，只能当下限看**，不能当作剩余工作量的依据。
- 本机全量 `pnpm run test:coverage` **不能作为验收依据**：实测 1314 秒（22 分钟）、45 个测试文件 / 105 条用例失败（`lsp-stdio`、`browser-use-runtime` 等环境相关，与本改动无关）、且因失败**根本没输出 coverage 报告**（`Uncovered locations` 一行都没有）。
- **可用的替代方法**：按包 scoped 覆盖率，约 4 分钟一批、结果干净：

  ```sh
  pnpm exec vitest run <pkg dirs> --coverage \
    --coverage.include='<pkg>/src/**/*.ts' --coverage.include='<pkg>/src/**/*.tsx'
  ```

  注意其方向性：scoped 跑出「已覆盖」是确定的结论（覆盖只会叠加）；跑出「未覆盖」有可能是假缺口（该文件可能被别的包的测试覆盖）。本轮那两个包的 22 个 spec 全部在同一次里跑到，故结论成立。另：`--reporter=basic` 在 vitest 4 已移除，加了会以「找不到自定义 reporter」启动失败。

**每条新用例都做了变异校验**（共 9 次变异：返回 `undefined`、忽略 `sessionId` 参数、去掉 `String(error)` 分支、吞掉 rejection、删掉 `llm-dashscope` 分支、把 dashscope placeholder 置空、删掉 rejection handler、`apply()` 吞错、`create()` 吞错），**9 次全部让对应用例变红**，改完即回滚源码。所以这批用例不是「只证明这行跑过」。

**剩余**：按包 scoped 实测顺序继续，不要沿用旧的按包位置数排序。

##### CI 对照证据（PR #170 已合，merge commit `bb1b8e7d7264`）

不是推断，是两次 CI 的 coverage 门自身输出对比：

| 指标 | PR #169（job `105086673918`） | PR #170 |
| --- | --- | --- |
| `Uncovered locations` | **6764** | **6753** |
| `client/ui-settings-models/src` 出现次数 | 有 | **0** |
| `preset/agent-presets/src` 出现次数 | 有 | **0** |

差值 **−11**，与补掉的 11 处精确对应；Windows lane 同为 6753，两条腿一致。

**本 PR 的合入标准据此定为「按包验收」而非「门变绿」**（用户 2026-09-17 裁定「按包分批合」）：门会一直红到 62 个包全部补完，所以每批的验收证据是 ①CI 未覆盖总数下降的**确切数值**与该批位置数吻合、②该包从 CI 未覆盖清单**完全消失**。62 个包压成一个巨型 PR 被否决 —— 中途没有任何可验证的中间态。

`node 24 / static` 本轮**首次全绿**，验证了 §2 那条预期：config catalog 收口后 fail-fast 不再中止整条 lane。

coverage job 里 5 条失败用例的归属：3 条（`app-boot` 的 group-apply 枚举、`excludes vendored sources and frozen Agent Notes`、`registers every non-spec gen-*.ts file`）在 PR #169 那次**同样红**，属原有；另 2 条见下面新增的「两条新暴露的上游预算门」一节。

##### 第二批 6 个包已实测（尚未补测试）

10 个 spec / 257 条测试全绿，实测 **16 处**（交接表合计 9 处，再次低估）：

| 包 | 交接表 | 实测 | 位置 |
| --- | --- | --- | --- |
| `client/ui-present-decomposition` | 1 | **3** | `index.ts:1`（未覆盖函数 `apply`）、`client/DecompositionCard.tsx:18,31` |
| `client/ui-present-table` | 1 | **5** | `index.ts:1`（同）、`client/TableCard.tsx:16,214,762` |
| `code-runtime/code-runtime-python-protocol` | 1 | **1** | `index.ts:682` |
| `data/tool-present-table` | 1 | **1** | `index.ts:103` |
| `data/tool-compute` | 2 | **2** | `index.ts:51,52` |
| `data/tool-retrieve` | 3 | **3** | `index.ts:95,111,282` |

**归属已核：这 8 个文件在 merge-base 上根本不存在 —— 全是 fork 自有文件，16 处全部可覆盖，0 处属上游。**

##### `packages/query/query`：是真缺口，不是假缺口（实测 5 处）

该包 `tests/` 下**一个测试文件都没有**，所以先按「scoped 报未覆盖可能是假缺口」的方向性做了排除：把它的消费者 `query-tool` + `eval` 一起跑（27 个 spec / 324 条测试全绿），`src/index.ts` 仍然是 **lines/functions/statements 全 0%** —— 消费者只用它的类型，从不执行它的运行时代码。**所以是真缺口。**

5 处全在 `src/index.ts`：`:38:3` 未覆盖函数 `constructor` + `:39:5`；`:125:3` 未覆盖函数 `getConventions` + `:126:5`、`:127:5`。`src/conventions.ts` 已全覆盖，`src/types.ts` 按 `packages/*/*/src/types.ts` 规则本就排除在覆盖率之外。

`QueryEngine` 是抽象 Service 基类：`constructor` 只调 `super(ctx, 'query')`；`getConventions` 的默认实现直接 `throw new Error('QueryEngine.getConventions: not implemented; override in a concrete provider subclass')`。因此补法明确 —— 新建 `tests/`，在 cordis `Context` 里实例化一个最小具体子类（覆盖 constructor），再对**未覆写 `getConventions` 的子类**断言它抛出「not implemented」（覆盖那 3 处，且这条断言拒绝的是「抽象 seam 静默返回某个值」这一错误行为）。工作量属小包，不需要从零建整套。

### 2. `verify-config-catalog` — 重生成会新增 901 行 da `Config` 块

- `pnpm run gen-config-catalog` 会把 `dsh-admin` 等 da 包的 `Config` 接口写进 `docs/config-catalog.md`（fork 从未重生成过）；其中文对侧 `docs/config-catalog.zh.md` 是手工维护面，配对门要求两侧同步。
- 因此不是「跑一下生成器」就能收口：需要一次真正的双语补齐（`dsh-translate-docs` 只允许用户显式触发）。本轮已把误跑的英文重生成回滚，配对保持 1016 对一致。
- 完成条件：英文重生成 + 中文对侧补齐 + `verify-translation-pairing --write` 重录 + `verify-config-catalog` 绿。
- **副作用（2026-09-17 实测，把本项排在前面的独立理由）**：这条门红着的时候，`DSH_GATE_FAIL_FAST: 1` 会在它之后立刻中止整条 lane，后面的静态门一个都不跑 —— PR #169 的 job `105086673951` 里 `concrete terms` 就是 `SKIPPED (0.00s, aborted by fail-fast: config catalog failed)`。所以只要本项没收口，`static` / `windows observational` 对其后所有门都不提供任何信号；PR #169 恰好改了 `verify-concrete-terms`（删掉两条例外），CI 根本没跑到它，只能靠本机 + 树内扫描自证（阻断词在排除项之外 0 命中，路径 0 命中）。
- **已收口（2026-09-17，用户显式发起 `dsh-translate-docs`）**：`gen-config-catalog` 重生成新增 42 个包节（900 行，含 admin/audit/ptc 运行时/语义层/eval/客户端 UI 插件）+ 三条尾部清单共 24 条 + 1 条漂移的 source 行。中文对侧按配对契约原地补齐、**未整篇重译**：`ts config-catalog` 围栏含 JSDoc 逐字节一致（163 个围栏 0 漂移），标签沿用该文件既有渲染（`Requires:`→`需要：`、`Depends on:`→`依赖：`、`Source:`→`来源：`、清单关键词→`需要`/`抽象`、尾部链接用全角括号）；`Source` 链接指向 `.ts`，在双语语料之外，保持原路径。验收：`verify-config-catalog` 绿、配对重录且一致、`doc-sync` 43/43、`test:docs` 21/21、`verify-concrete-terms` 干净。提交 `dbb8682541`。
- **随之而来的预期**：本项转绿后，上一条的 fail-fast 不再掩盖其后的静态门 —— `static` / `windows observational` 会**首次**跑完整条 lane，可能暴露此前从未运行过的失败面。下一轮看到新面属正常，不等于回归。
- **已识别的具体候选**：`scripts/doc-standard.spec.ts:343`（`maps package README kinds to their documentation standards`）本机单跑 3.65s、预算 5s，余量仅 ~1.35s；本轮在本机轻度并发下**已实测超时一次**（5.32s > 5s，`Test timed out in 5000ms`），单跑复现即绿。它 `globSync` 并读取全部包 README，属**负载敏感**型 —— 与 sdk 握手超时同一失败模式（预算边缘 + 机器被挤）。若 static lane 在 4 vCPU 上把它与其他门挤在一起，它是最可能先红的一条；**该 spec 与 `upstream/master` 逐字相同** → 属上游测试、上游预算，因此唯一在范围内的手段是 fork 侧并发（`ci.yml` 已分叉）：**不改这条测试的预算、不加 retry、不弱化断言**。若并发也压不住，按「上游门在 fork 不可达」留档，不追。附：`scripts/coverage-exempt.ts` 同样逐字属上游 —— 所以「不把 da 包塞进豁免名单」不只是策略，改它本身就是动上游文件。

### 3. `duplication` — 69 处 da 克隆（当前 0.26%，门槛 0.338%）

- 上游已**取消比例门槛**、改为「有克隆即红」（`.jscpd.json` 去掉 `threshold`、加 `exitCode: 1`、且扫描 spec 文件）；fork 保留比例门槛，本轮把「按设计重复」的正式协议包用 `jscpd:ignore-start/end` 围栏后，比例从 0.49% 降到 0.32%，**门当前是绿的**。
- 但 84 处克隆仍在，且随 da 代码增长会再次顶破门槛。主族：`ui-present-decomposition` ↔ `ui-present-table` ↔ `ui-suggest-followups` 的 card 组件、`ui-semantic-layer` 自身、`ui-semantic-layer` ↔ `schema-gateway`/`evidence-query` 的类型重复、`code-runtime-data-python` ↔ `ptc-runtime-node`/`ptc-runtime-python` 的运行时片段。
- 完成条件：把类型重复抽到共享包、card 组件抽公共壳；比例回落后再把门槛调回上游语义（零容忍）或更紧的比例。
- **2026-09-17：`llm-dashscope` 那 15 对已用围栏解掉**（用户裁定：该包适配阿里内网 AGA 网关，上游 `llm-deepseek` 只讲 OpenAI 兼容 wire，两者刻意独立演进；**否决抽公共基座** —— 那会把内网网关的演进耦合到上游 provider 上）。五个 `src/*.ts` 各加一处 `jscpd:ignore-start/end`，理由指向既有决策 [note](../../../../.agents/notes/implemented/architecture/2026-08-20-llm-dashscope-native-aga-adapter.md)（该 note 本就记着「镜像 llm-deepseek 的结构、wire 层不相交」并已否决 translate shim 方案）。**未上调 `.jscpd.json` 阈值。**
- 实测：84 → 69 处，0.32% → 0.26%，余量从 0.018pp 拉开到 0.078pp。**没有达到当初预估的 0.1%** —— 那个预估把 280 行重复整个算进分子，实际重复行只从 1334 降到 1069。余量仍然薄，剩下 69 处（card 组件壳、`ui-semantic-layer` 自重复、类型重复）依然是顶破门槛的主要风险。

## 已查明归属、不追：两条新暴露的上游预算门（2026-09-17，用户第五棒确认按不可达留档）

`static` lane 首次跑完后，PR #170 的 coverage job 比 PR #169 多出两条红：

| 用例 | 文件 | 耗时 |
| --- | --- | --- |
| `checks and encodes a wide completion value in O(depth), not O(width)` | `packages/experimental/ptc-runtime-python/tests/runtime.spec.ts` | **60088ms**（撞 60s 超时） |
| `signals a foreground command and kills a TERM-ignoring background descendant` | `packages/terminal/terminal-bash/tests/local.spec.ts` | 1729ms |

**两个 spec 都与 merge-base 逐字相同、fork 侧 0 行分叉** → 上游测试、上游预算，与 `scripts/doc-standard.spec.ts:343` 同类。

失败形态是**预算边缘**而非逻辑错：第一条紧邻的兄弟用例 `validates wide binding arguments in O(depth), not O(width)` 以 **48782ms** 通过 —— 同一族用例本就贴着 60s 预算跑；同一时刻 `packages/shell/pwsh-local/tests/executor.spec.ts` 花了 **30750ms**，整台机器被挤。与 sdk 握手超时是同一失败模式（4 vCPU + 上游按 16 核调的预算）。

**处置：按「上游门在 fork 不可达」留档，不追。** 不改这两条测试的预算、不加 retry、不弱化断言。这也是 §2 早已预告过的「新暴露面」—— 看到新面属正常，不等于回归。若后续复现频率上升，唯一在范围内的手段仍是 fork 侧 `ci.yml` 并发（该文件已因 owner gate 与上游分叉），而不是碰测试。

## 已裁定：不做「衍生内容漂移」的新门（2026-09-17，用户第五棒确认）

此前的多选里勾选过「为衍生内容漂移加一个新门」，随后被建议撤掉但一直未表态。**用户已确认撤掉。**

理由：`config-catalog` 的三个文件（`.md` / `.zh.md` / `.i18n.yaml`）、生成器 `scripts/gen-config-catalog.ts`、校验器 `scripts/verify-translation-pairing.ts` **全部属于上游**。一个检查它们**行内内容**的门，第一天就会因上游自己那 29 行既存缺陷变红 —— 其中 9 处是命名了源码里并不存在的服务与类型的真实事实错误（详见下面「四条查明后不追」里的对应条目）。那等于把上游的债接到 fork 头上，与本票最高准则「绝不修、也不管上游的任何问题」直接冲突。

同时，fork 新增的那 42 个 da 包节的中文对侧，**本来就已被现有配对门的哈希机制覆盖**，新门的边际价值很小。若将来仍要做，唯一可接受的形态是「只校验这 42 个 fork 新增节的对侧行」，绝不扫上游既有的 29 行。

## 非目标

- 不修上游内容：上述三项的失败面全在 fork 自有文件内。
- 不放宽门：不加 retry、不吞错、不把 da 包塞进豁免名单（用户已否决）。

## 已修：`snapshots and artifacts` 的 sdk initialize 超时（归属从上游债更正为 fork 自有 CI 配置）

PR #168 三轮 CI 里 `node 24 / snapshots and artifacts` 每轮都命中 `RequestTimeoutError: initialize timed out after 10000ms waiting for dsh profile "sdk"`，且**每轮命中的场景不同**（`subagent-continuable-inheritance` / `bash-tool` / `inline-image-prompt` + `subagent-continuable-inheritance`）—— 典型的预算边缘特征，不是录制内容漂移。

证据与归属：
- 本机：`snapshots/sdk/sdk.snapshot.ts` 单跑 20/20 绿，`pnpm run test:snapshot` 全量 4/4 绿；单个场景（含启动 + 握手 + 回放 + 断言）耗时 1.3–6.0s，握手本身远低于 10s。
- 对比：PR #167（基于合并前 master）同一 job 失败在 `test:expected`，**没有**这个握手超时 → 本现象是合并后才出现的。
- **归属更正（2026-09-17）**：原判定「上游 profile 冷启动变重 → 上游债」**错了**。上游把这条 lane 排在 `dsh-ubuntu-24-04-16core`（16 核）上，fork 因为拿不到那个 runner label 换成了 `ubuntu-latest`（公开仓库 = **4 vCPU**），**却留着上游按 16 核调的并发值**：`DSH_GATE_CONCURRENCY: 10`、`DSH_OXLINT_THREADS: 8`、`DSH_PUBLINT_CONCURRENCY: 8`、`DSH_WEB_SNAPSHOT_WORKERS: 6`。换 runner 是 fork 自己的改动，所以过载也是 fork 的债。
- CI 日志证据（job `105057010245`）：超时发生在 `test:snapshot` 的第 177 秒，而同一台机器上 `doc-typecheck:contracts-ready`（164s）与 `built-bin smoke`（169s）**全程并行**，同 job 还并发跑着 `build` / `lint` / `publint` / `node-next` / `test:expected` 共 8 个 gate。整台机器被拖慢 3–5 倍，不是 sdk 特有：`apps/web/tests/minimal-preset.snapshot.ts` 3 个用例 27.1s、`snapshots/acp/acp.snapshot.ts` 15 个用例 20.1s、单个 ACP 握手用例 13.6s —— 本机同类只要 1.3–6.0s。**同一次运行里 ACP 的握手照样过了**，只有恰好排在最挤时刻的 sdk 场景越界，这正是「每轮换一个场景失败」的原因。
- 修法（fork 侧，不碰上游）：`ci.yml`（该文件已因 owner gate 与上游分叉）把这条 lane 的并发按 4 vCPU 重标 —— gate 10→4、oxlint 8→4、publint 8→4、web snapshot workers 6→2、`DSH_SNAPSHOT_MAX_CONCURRENCY` 的默认支路 8→3；failover 支路（自建 64 核 VM 的 12）不动。**没有改上游的 `initializeTimeoutMs`、没有加 retry、没有弱化断言、没有重录快照。** fork 此前已用同一手法把 `DSH_COVERAGE_MAX_WORKERS` 6→4、`DSH_SNAPSHOT_MAX_CONCURRENCY` 32→8，本次只是把剩下几个漏掉的值补齐。
- 复检条件：下一次 PR 的 `node 24 / snapshots and artifacts` 不再出现 `initialize timed out`。若仍超时，说明 4 vCPU 连串行的 profile 冷启动都撑不住，那时才回到「上游预算 vs 硬件」的讨论，并按 CB-5 的 Q1（DA 要不要建自己的 CI 腿）一并决定。
- **复检已通过（2026-09-17）**：PR #169 的 job `105086673983` 里 `initialize timed out` 与 `RequestTimeoutError` 各出现 **0 次** —— 握手超时消失，按 4 vCPU 重标生效。该 lane 剩下的唯一失败就是下面「新暴露」一节的 web 批次断言（`apps/web/tests/smoke-real.e2e.ts:359`，12 tests | 1 failed | 8 skipped），即失败面已按预期从握手超时换成 fork 自有 web 组成问题。PR #169 已合入 master（merge commit `70a4243b4c`，保留合并拓扑）。

被否决的处置：**「归为上游债、让这条 job 一直红」** —— 一条长期红的 job 会训练所有人忽略 CI，且本节证据表明红的原因在 fork 自己的 runner 替换上，上游无债可交。同样被否决的是「什么都不做等下次同步」。

## 从 PR #42 抢救的两条记录（该 PR 已关，分支已删）

`fix/cb1b-pwsh-pty-evaluation` 的 CI 部分已被 master 更彻底的方案覆盖（整条 `macos-latest / seatbelt` matrix 腿被删）。关 PR 前把其中仍有效的内容搬到当前 master：

- [CB-5：DA 的 CI 寄生在上游 workflow 上](../../../semantic-layer/tickets/CB5-da-ci-upstream-boundary.md) 与 [CB-1b](../../../semantic-layer/tickets/CB1b-pwsh-pty-evaluation-bug.md)、[CB-4 的 follow-up](../../../semantic-layer/tickets/CB4-zod-externals-drift.md) 已入 master。CB-5 记录的原则（「DA 的 CI 只检查额外增加的非上游内容」）与其 Q1「DA 要不要建自己的 CI 腿」正是本票 sdk 握手一节要回答的同一个问题。
- **`code-runtime-data-python` 的 pandas 组仍未按依赖可用性 gate**：`tests/runtime.spec.ts:115` 的 `pandas compute` 组直接 `import pandas as pd`，在没有 pandas 的解释器上必红；CI 目前靠 `DSH_TEST_PYTHON_PATH` 指到装了 pandas 的解释器兜住。PR #42 里的做法是探测**运行时真正会 spawn 的解释器**（`Config.pythonPath`，默认 `python3`），沿用 `terminal-bash/local.spec.ts` 的 `hasPwsh` 惯例后跳过。那 14 行不能直接搬——该包接口已换到 `dsh-ptc-runtime` 且包本身待改名，需在改名后重做。
- 对照：PR #42 的另一半「eval-cli 测试自建隔离 home」**已由 master 用更好的方式落地**——`main.ts` 走 `resolveDshHome()`，`tests/main.spec.ts:13` 用 `mkdtempSync` + `DSH_HOME` 注入，不再依赖宿主 `HOME`。无需再搬。

## 新暴露：`snapshots and artifacts` 的 web keyless smoke 断言（握手修复后 fail-fast 顺序变了才露出来）

把 sdk 握手超时修好后，PR #169 的 `snapshots and artifacts` job 继续往下跑，`web browser snapshot` gate 第一次跑到底，露出一条**此前被 fail-fast 掩盖**的失败：

```
apps/web/tests/smoke-real.e2e.ts:359
AssertionError: expected [ …(3) ] to have a length of 2 but got 3
```

- **归属：fork 自有 web 组成 + 一条未适配的上游测试，不是本 PR 引入的。** 证据：① `apps/web/tests/smoke-real.e2e.ts` 与 `upstream/master` 逐字相同，断言的是上游 `dsh web` 的 2 个插件批次；② PR #169 不碰任何 web/apps/client/bundle 文件；③ 批次数由该测试**自己 spawn 的那一个** `dsh web` 服务器的插件合并逻辑决定，与 `DSH_WEB_SNAPSHOT_WORKERS` 并发度正交；④ 本机（快、无争用）复跑同样失败，排除「CI 负载抖动」。
- **机制**：`packages/bundle/web-app/cordis.patch.yml`（fork-diverged）往基座 web-app bundle 里挂了 da 的客户端 UI 插件（`ui-present-table`、`ui-present-decomposition`、`ui-suggest-followups`、`ui-semantic-layer` 等），这些多出来的 client 插件形成了第 3 个 `/plugins/??…` 批次；而上游那条 perf 提交 `perf(web): defer client combo assembly`（fork 所站的 5 个纯 perf 提交之一）改了 combo 切批方式。两者叠加 → 3 批次，上游测试仍期望 2 批次。
- **为什么以前是绿的**：这条 gate 与 `test:snapshot` 同 job、`DSH_GATE_FAIL_FAST: '1'`。master 上 `test:snapshot` 先因握手超时挂掉、连带中止了 `web browser snapshot`，所以它从未在合并后跑到底 —— 这条失败一直在，只是没机会显形。master 最近三次 CI 该 job 全红即佐证。
- **根因已查清（2026-09-17，只读核对）：这不是「该并进哪个 combo」的问题，而是上游自己的 URL 长度分片在按设计工作。**
  `packages/client/modules/src/index.ts`（**与上游逐字相同**）的 `partitionComboRecords` 会在「投影出的 `.map` 形式 combo URL 」超过 `MAX_COMBO_URL_BYTES = 3 * 1024`（3072 字节）时切下一片；批次数 = bootstrap 分片数 + application 分片数。fork 在 `cordis.patch.yml` 里挂进基座 web-app 的 4 个 da 客户端插件（`result-cache`、`ui-present-decomposition`、`ui-present-table`、`ui-suggest-followups`）给该 URL 增加了 **228 字节**（4 个资源名 224 + 4 个逗号），于是 application 相位从 1 片变 2 片 → 总数 3 批。
  **推论一：fork 的 3 批是正确行为**，代码恰恰是在遵守自己的协议上限，没有任何东西坏掉。
  **推论二：上游 `toHaveLength(2)` 是一个绑定「上游自己插件集大小」的常数**，不是行为不变式 —— 该测试另外两条断言（一条多插件 combo 批 + 一条 `dsh-client-modules` 独立批）在 fork 里**依然成立**，只有数量对不上。
  **推论三：原计划「把断言改成 fork 真实批次」在方向上就错了** —— 它们并不是「没并进 combo」，「并进去」恰恰是越界的原因；分片是贪心自动的，没有 per-plugin 的「选哪个 combo」旋钮。
- **处置（与 ARM64 那条同族）：记为「上游门在 fork 不可达」，不动那条测试。** 能让它变绿的 fork 侧手段都不值得：① 把 4 个 da UI 插件从基座 bundle 摘掉 —— 那 da 的 toolview 就不会在 `dsh web` 里加载，等于取消功能；② 改短包名去抢那 228 字节 —— 为一个上游常数改已发布包名；③ 上调 `MAX_COMBO_URL_BYTES` —— 那是改上游源码且削弱其刻意留的协议余量。三者皆否决。
- **附带观察（上游的脆弱，不是我们的债）**：既然加 228 字节就越界，说明**上游自己的 application combo 已在 3072 的 228 字节之内**，即上游再加一个插件就会跑不过自己这条测试。因此不要指望下次同步这条会自动变好 —— 它更可能变差。

## 新暴露：`CI master` 工作流的 real API preflight —— fork 缺 secret，与 CB-5 同族

本票原先的残余红门清单是**按 PR 的 checks 盘的**，因此漏掉了只在 **master 推送**工作流（`CI master`）里跑的一条常红 job。2026-09-17 §2.4 收口时顺带发现：

```
##[error]DEEPSEEK_API_KEY_EXTERNAL is empty; the installed-wheel real API test cannot self-skip.
```

- **失败面**：`python runtime / macOS and Linux ARM64` 的 `node24-linux-arm64` / `node24-macos-arm64` / `node24-macos-x64` 三条腿，全部挂在同一步 `Preflight installed-wheel real API test (POSIX)`。
- **根因**：该步显式写成「拿不到 key 就红」而非自跳过 —— `if [ -z "${DEEPSEEK_API_KEY:-}" ]; then echo "::error::…cannot self-skip."`。上游仓库有 `DEEPSEEK_API_KEY_EXTERNAL` 这个 secret，**本 fork 没有**（`DEEPSEEK_API_KEY:` 在日志里是空值）。
- **不是本轮引入**：`acd73b0356`（本 session 开工前的 master 头部）、`4000b3ae1f`、`311cd170e4`、`27e60646e5` 四次 `CI master` 运行里，同样是这三条腿、同样是这一步失败，逐字一致。§2.4 的改动只有 `docs/config-catalog.*` 与本票，不可能影响 python wheel 的 ARM64 构建。
- **归属已定：纯上游内容，fork 不动、不配 key、不管。** `.github/workflows/build-exe-for-python-sdk.yml` 与 `upstream/master` **逐字相同**（`git diff upstream/master master --` 输出为空）；这条门测的是**上游的** python SDK wheel（`scripts/smoke-python-runtime.py --scenario sdk-live --installed-wheel`：把构建出的 wheel 装进干净 venv、`env -u PYTHONPATH -u DSH_RUNTIME_MODE` 摘掉仓库影响，然后真打一次 `https://api.deepseek.com/anthropic`），用的是**上游的** secret 名。preflight 之所以写成「缺 key 就硬红」而不是跳过，是上游刻意不允许这条 real API 测试悄悄退化成空跑 —— 那是上游对**上游发布物**的要求。fork 不发布这个 wheel，所以哪一侧的债都不落在 fork。
- 按最高准则（上游内容不修、上游问题不管、只合并上游最新 tag），本节只作**归属留档**：既不给 fork 配 `DEEPSEEK_API_KEY_EXTERNAL`，也不改这一步的跳过逻辑 —— 那两件都是动上游文件。它在 fork 的 master 推送上会一直红，这是「上游门在 fork 不可达」的自然结果，不是 fork 的待办。**唯一的行动价值**：盘残余红门时知道它在这儿且不必处理，以及原先的清单是按 PR checks 盘的，所以整条 master 推送工作流都被漏掉了。

## 上游债留档：`config-catalog` 中文对侧的 9 处事实错误（**不修**）

§2.4 收口时顺手审计了 `docs/config-catalog.zh.md` 的全部标注行与清单项（逐行对照生成侧英文，而不是数标签），查出 29 行漂移。**归属结论：29 行全属上游，fork 侧 0 行** —— `upstream/master:docs/config-catalog.zh.md` 逐字包含全部 29 行。因此按最高准则（上游内容不修、上游问题不管），**这些一律不动**，仅留档。

其中 9 处是**事实错误**，中文对侧写着源码里不存在的服务名／类型名：

| 上游中文对侧原文 | 源码实际 | 证据 |
| --- | --- | --- |
| `dsh-tool-ask-user` 需要 `userInteraction` | `userQuestions` | `inject = ['tools', 'userQuestions']` |
| `dsh-credentials` 抽象 `Credentials` | `CredentialProvider` | `export abstract class CredentialProvider` |
| `dsh-settings` 抽象 `Settings` | `SettingsProvider` | 同处声明 |
| `dsh-command-compact` 需要 `compact` | `compaction` | `inject = ['commands', 'compaction']` |

另有 4 处 `sessionProjections` 依赖一多一少地陈旧、`dsh-client-ui-deliverables` 漏 `workspaceFiles · fs · sandboxPolicy`，以及 20 处排版／标签问题（全角冒号后多空格、未译 `Requires:`、半角括号、`，需要 X 和 Y` 等）。

- **为什么上游的门没抓到**：配对门只查结构（标题深度、清单项数、围栏、链接目标）与记录的 blob 哈希，**从不查行内内容** —— `docs/i18n/README.md` 自己写明了这条限度（绿门只表示「在这两份确切内容上确认过一致」，不表示那次确认是对的）。所以中文对侧可以长期命名不存在的服务而全门皆绿。
- **本轮的处理**：曾误修过一次（`ddc27317d6`），发现归属后已整体回滚（`b1aadd426f`）。教训记在逐轮日志 Round 31。
- **fork 侧真正该做的部分**：只有「因 fork 新增 da 包而必须补的 42 个包节 + 24 条清单项」，即 `dbb8682541` —— 那 42 个锚点在上游对侧中**一个都不存在**，属 fork 自有内容。
- 若日后有渠道上报上游，本节就是证据；在此之前不作为 fork 的待办。

## 2026-09-18（第六棒）：同步到 `dsh-v0.1.6-alpha.2` 已落，归属基线换成 `ddefc45fbc`

merge commit `ce11b3929e4a`（双 parent，拓扑保留），882 提交 / 2548 文件 / +100218 −23242，**25 个冲突**全部解完。复核报告见 `upstream-sync/da-impact-ddefc45fbc.md`。**归属基线自此为 `ddefc45fbc`，不再是 `0d1f50007f`。**

### 本票三项残余红门的现状

1. **coverage（167 个 da 文件 / 62 个包）** —— 本棒未动，第二批那 16 处与 `query/query` 那 5 处的结论**不需要按新基线重算**：实测那 9 个目标文件（含 `query/query/src/index.ts`）在 `ddefc45fbc` 上**依然不存在**，所以仍是 100% fork 自有。上一棒担心的「换基线导致副线结论作废」并未发生。
2. **`verify-config-catalog`** —— 绿。重生成后英文 **173 节**（上游 131 + da 42），中文对侧按机械方式重组（不是重译），两侧 173 节 / 170 锚点、0 处结构不一致、**170 个 `ts config-catalog` 围栏逐字节一致**（上一棒记的是 163 个，上游新增 7 个配置包）。配对重录后 **1104 对**全一致（上一棒 1016 对）。
3. **`duplication`** —— 绿，**69 处 / 0.25%**（门槛 0.338%），与上一棒记录一致；未加围栏、未调阈值。

### 新增一条：上游缺陷 + fork 侧兼容修复（不是「上游不可达」）

这是本票此前没有的一个类别 —— **上游自己碎、但 fork 侧有正当修法**，因此**不按不可达留档**。

上游 `9ddef327a4 feat: resolution mode link to runtime`（提交时间距 tag 只有 1 小时 27 分）把 `apps/cli/src/profile-boot.ts` 非打包分支的默认值从 `?? 'link'` 改成 `?? 'runtime'`。后果：`pnpm run test:snapshot` 从全绿变成 **83 失败 / 77 通过**，全部是同一句
`dsh: UNKNOWN: Cannot read properties of undefined (reading 'prepare')`。

机制（运行时实测，非推断）：tsx 启动会导出 `TSX_TSCONFIG_PATH`，其 `paths` 把 workspace 导入改写到 `src/`；而 `runtime` 模式按 package `exports` 把裸插件名解析到构建产物 `lib/`。两者同时生效时 `@deepseek-ai/dsh-tools` 被**加载两份**，而 `TOOL_RUNTIME_SCHEDULER` 是模块级 `Symbol()`（不是 `Symbol.for()`），于是 ToolRuntime 实例上带着一个描述为 `Symbol(@deepseek-ai/dsh-tools.scheduler)` 的 own symbol，而 `agent-loop` 侧查出来是 `undefined`，所有工具派发都死在 `.prepare` 上。

**归属：上游，有硬证据。** `profile-boot.ts` 里 `resolutionMode` 那 9 行与上游**逐字节相同、行号一致**（该文件其余部分 fork 分叉 99/175，但不在这里），且全仓没有任何地方显式传 `resolutionMode`。在**纯上游 tag** 上建 worktree（`packages/data` 不存在、build 0 error）复现同一条场景，得到**完全相同**的失败：

```
git worktree add --detach .worktrees/upstream-tag-alpha2 ddefc45fbc
pnpm install && pnpm run build:official
npx vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t "agent-instructions"
→ Tests 1 failed | 121 skipped (122)
→ stderr: dsh: UNKNOWN: Cannot read properties of undefined (reading 'prepare')
```

即上游自己的发布在「源码模式 + 已构建 lib」下会弄碎它自己的录制语料 —— 而这恰好就是 CLAUDE.md 强制的 worktree 流程，CI 也一样。

**修法（`240dd0db25`）：让 fallback 后端跟随启动方式。** 两个启动器本来就用同一个信号表示「源码模式」—— `loader-smoke` 的 `src` 模式设 `TSX_TSCONFIG_PATH`，SDK 的 `resolveDshNodeLaunchFromManifests` 只在其 source 分支设它（两个文件都是纯上游、本次合并未改）。上游新的 `runtime` 默认在纯 Node 启动下仍然保留 —— 那种情况下它是对的。

**被否决的两个方案**：①「无条件钉回 `link`」—— 实测会把失败面**反转**：修好 62 条 headless/acp，却弄碎 21 条 sdk（sdk 启动的是构建产物、走纯 Node，本就该用 `runtime`）；②「归为上游不可达、让 83 条一直红」—— 与当初否决 sdk 握手超时「让它一直红」的理由冲突（长期红的 job 会训练所有人忽略 CI）。

验收：`test:snapshot` **4 个文件 / 160 通过 / 2 跳过**，`prepare` 报错 0 次、`failed to import` 0 次。`resolved-profile-boot.spec.ts` 新增的用例做了**变异校验**：把上游那句硬编码 `'runtime'` 放回去，**只有**这条用例变红（1 失败 / 16 通过）。

**后续注意**：这是一层兼容 shim，等上游修好后应当重新评估 —— 将来某个上游版本可能让 `runtime` 对源码启动也成立。

### 一条原有红门的再确认

`packages/boot/app-boot/tests/app-boot.spec.ts` 的 `enumerates every failed entry when a group apply fails with multiple errors (CB-1a S2)` **在合并前 master 上同样失败**（本棒实跑确认），与本票原先「属原有」的记录一致，不是本次合并的回归。

### 上游退役了动态 cordis 工具族（归属：上游内容，整体取上游）

`cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine` / `cordis_inspect_self` 五个工具在 merge-base 上就存在（533 行），**全属上游**；fork 在该文件唯一的改动是 16 行 `ctx.effect()` 包裹。上游把文件砍到 83 行、只留 `cordis_inspect_list` 与 `cordis_inspect_query`，并把插件生命周期挪进新包 `packages/boot/plugin-manager`（对外是 `plugin_manager` 工具，已进工具目录）。**da 生产代码 0 处依赖**这五个工具；只有两处 wayfinder 历史叙述提到它们（`research/harness-plugin-model.md:330-331`、`interpretation-client-rendering/tickets/T5-...md:38`），属描述性文字、不会坏，但若那篇研究笔记要反映当前 harness，需要改写成 `plugin_manager` 的故事 —— 本棒未动。

## 收尾棒（alpha.2 合并后，2026-09-18）

合入 #171 后 master 站在 alpha.2（`ddefc45fbc`），`upstream-status` behind 0 / owed 0 / consistent。本节记录收尾棒对残余项的处置，append-only。

### snapshots and artifacts —— 已转绿（曾是本专项两大红门之一）

两处 fork 自有修法随 #171 合入，`snapshots and artifacts` job 转绿：
- **web keyless smoke 批次断言 2→3**（`apps/web/tests/smoke-real.e2e.ts`）：fork 在基座 web-app 多挂 4 个 da 客户端 UI 插件（`result-cache`/`ui-present-decomposition`/`ui-present-table`/`ui-suggest-followups`），给投影 combo URL 加 228 字节，`partitionComboRecords`（与上游逐字相同、`MAX_COMBO_URL_BYTES` 未动）据此把 application 相位切两片 → 共 3 批。实测捕获真实 3 批后改断言，刻意偏离上游逐字测试并写明理由。**这推翻了 master `c2d7e2fe`「记为不可达上游门」的旧裁定**（用户本棒明确改判：结束红门优先于最小偏离）。
- **lint 未认领程序（UM-LINT-B）**：alpha.2 新增的上游测试 `apps/web/tests/desktop-updates.e2e.ts` 匹配严格 glob 但无 program 认领。它是上游自身缺陷——测试双参调用 `presentDesktopUpdate(state, en)`，而上游实现单参（两文件均与 `ddefc45fbc` 逐字相同，上游从不类型检查该测试）。给它 program 会撞上游类型 bug，禁止改上游。改法：给 `run-oxlint.ts` 新增 `STRICT_OVERRIDE_UPSTREAM_DEBT` 上游债豁免通道，用 `git hash-object` 比对 pin 的上游 blob SHA（`1e30848020…`）才豁免——fork 改一字节即失效、上游下次改动也失效强制复检，机械保证只容上游逐字内容。补正/负/身份三测试。（prompt 原写的「加 UNMATCHED_DISPOSITIONS」在这套 gate 里不可行：fence 不查该表，且 spec 钉死表内样例必须不匹配严格 glob。）

### §2.5.3 两处过时叙述 —— 研究笔记与 skill 已改，票据历史陈述不动

本棒精确核查（Search subagent + 直接读码）确认：`cordis_define`/`cordis_run`/`cordis_stop` 作为 **agent 工具**已退役，`tool-cordis` 只注册 `cordis_inspect_list`/`cordis_inspect_query` 只读工具；`cordis-host-runner` 的 define/run/stop 逻辑仍在，但仅经 `@Remote` 供 UI 面板与程序化调用，**无任何 agent 工具调用它**（该包 README 自述 "no model tool creates dynamic definitions"）。替代路径是 `plugin_manager` 安装持久 bundle，非 in-process 动态定义。据此改了三处 fork 自有文档反映当前 harness：`dsh-plugin-development/SKILL.md`（description + mode 表 + 锚点）、`MODES.md#1`（重写为「Runtime inspection（只读）」）、`research/harness-plugin-model.md:330-331`。`T5-…:38` 的 `cordis_stop` 是历史事件陈述（当时确实这么停的原型），按归档记录原则**不动**。验收：`verify-skill-invocation-metadata`、`verify-doc-refs`、`verify-translation-pairing` 均 exit 0。

### 仍开的三张票（本棒未落地，记归宿）

- **改名 `code-runtime-*` → `ptc-runtime-*`（§2.5.1）**：前置 = #167、#114 落地。二者本棒仍 OPEN（#171 合并后 GitHub 短暂报 mergeable UNKNOWN，随后重算）。**前置不满足则不动**；#167/#114 一落地即开单独「纯改名」PR（不夹带行为改动）。已核实无已发布包身份、无外部消费者，成本仅在仓库内。
- **resolutionMode 兼容 shim（§2.5.2）**：`240dd0db25` 在 master，是上游 `resolutionMode` 默认 link→runtime 缺陷的 fork 侧一表达式修法（已在本票上方「让 fallback 后端跟随启动方式」记录）。**复检票**：待上游修好后重评估、届时删 shim；下次同步重跑 `test:snapshot` 验证。
- **da 是否采用上游 `plugin_manager`（§2.5.4）**：架构级决策票。上游退役动态 cordis 工具族后，`plugin_manager`（`packages/boot/plugin-manager`，动作 list/set/install/remove 插件与 bundle）是其对「持久插件管理」的替代——但它管的是已装插件清单，**不是** in-process 动态定义能力。da 的 headless/默认 profile 当前未挂 `plugin_manager`（仅 `cordis` creator preset 挂了）。是否让 da 采用需用户单独决策，本棒不擅自采用。

### coverage —— 本专项唯一剩余结构性红门（交后续 session）

用户本棒裁定：coverage 暂不动，先做 §2.5。coverage 仍是唯一结构性已知红（`node 24 / coverage` + `windows / coverage`），按包分批补测试到逐文件 100%、每包一个 `test(coverage)` PR、**绝不进** `coverage-exempt.ts`。待清包清单见本票 §1 分布（batch 1 已由 #170 清 `agent-presets`/`ui-settings-models`）。

## 终局棒（2026-09-19）：§1 量级更正（本节最重要）、bubblewrap 归属、batch-2/3 落地

本节 append-only。所有数字在落笔时由 CI 的 `Uncovered locations` 清单机械重导，不沿用上游各棒的交接表。

### 一、§1 的按包数字是「文件数」，不是「位置数」——此前各棒据此排序全是错的

**这是本节最重要的一条，先读它再读其余。**

§1 顶部写「167 个 da 文件未达逐文件 100%」，随后那串 `client/ui-semantic-layer 21、client/ui-context-layer 15、data/nl2sql-engine 14…` 是**文件数**。后续交接文档（含本棒 session prompt §2.1）把它们读成了**位置数**，于是得出「从最小包起：`tool-scope-routing` 4 / `retrieval-experiment` 4 / `llm-dashscope` 5 / `eval` 5 滚动推进」。

**照此排序会一头撞进最重的一批。** CI 实测（`windows node 24 / coverage`，#172 那次，逐条列出并计数，行数与报告头 6746 精确相符）：

| 包 | §1 记（文件数） | 实测位置数 |
| --- | --- | --- |
| `data/tool-scope-routing` | 4 | **139** |
| `llm/llm-dashscope` | 5 | **143** |
| `eval/eval` | 5 | **91** |
| `eval/retrieval-experiment` | 4 | **89** |
| `client/ui-semantic-layer` | 21 | **459** |
| `client/ui-context-layer` | 15 | **648** |
| `data/nl2sql-engine` | 14 | **214** |
| `eval/eval-cli` | 8 | **1499** |

**真实剩余（#172 合入后）：6746 处位置 / 159 文件 / 56 包。** 不是两位数，也不是 167 处。

重量高度集中：`eval/eval-cli` 一个包 1499 处 = 22%；前 5 个包（`eval-cli` 1499、`ui-context-layer` 648、`ui-semantic-layer` 459、`data/semantic-layer` 426、`data/admin` 306）合计 3338 = **49.5%**。

**真正的 smallest-first 顺序**（batch-3 已按此清掉前十）：`query/query` 3、`ui-present-decomposition` 4、`tool-evaluate-sql-quality` 4、`ui-present-table` 5、`embedder/embedder` 6、`preset-autojoin` 9、`scope-registry` 9、`tool-critique-sql` 10、`credentials-keychain` 11、`goal-eval-context` 11 —— 前十合计仅 72 处。

**推论：coverage 不是一棒或几棒的量级。** 实绩参照：#170 清 11 处、#172 清 7 处、#173 清 72 处。按每 PR 数十处算，6746 处是数百个 PR 的长期工程，**不应再作为 upstream-merge 专项的收口条件**。上游合并本身已无残余（见下），建议把 coverage 另列一条长期轨道。

一条尚未验证的观察（留给后续）：`data/tool-*` 一族位置数高得整齐（`tool-get-coverage` 126、`tool-revert-edit` 143、`tool-search-data-sources` 141…），形态上像「整包基本没有测试」而非零散缺口。若属实，这些包更适合「一包一套测试」而非逐位置补，单位成本会低很多。

### 二、`prepare-ci-bubblewrap.sh` 的 404 —— 上游债，不修，但它让 Linux coverage 门变成 0 信号

2026-09-19 新出现。`scripts/prepare-ci-bubblewrap.sh` 把下载地址写死成 Ubuntu pool 里的具体版本 `bubblewrap_0.9.0-1ubuntu0.1_amd64.deb`；pool 只保留当前版本，该文件已被轮换掉，实测返回 **HTTP 404**（pool 现存 0.11.x / 0.12.0）。脚本 `set -euo pipefail` + `curl --fail` → 该步非零退出。

- **归属：上游。** `git diff upstream/master master -- scripts/prepare-ci-bubblewrap.sh` 输出为空（逐字相同），pin 是上游的，触发原因是 Ubuntu 归档轮换，**上游自己同样坏**。按最高准则（上游内容不修、上游问题不管）**不修、不加回退、不换 URL**。
- **发生窗口**：master 最近一次 `CI master`（`f5cf5e9b13`，2026-09-18T17:38）该步仍绿；#172（2026-09-19T01:25）已 404。
- **影响面**：`ci.yml` 里调它的三个 job —— `node-24-coverage`、`node-24-consumers`（显示名 snapshots and artifacts）、`node-compat`（node 22.19 / 24.9 / 26）。#172 上 5 条红 + `all checks passed` 汇总红**全部**由此而来，与补测试无关。`static`、benchmarks、windows build/native/observational、python 各腿均绿。
- **为什么要特别记一笔**：`node 24 / coverage` 是在 step 11「Install dependencies and prepare bubblewrap」失败、step 12「Run exhaustive coverage」**skipped** —— 它**根本没测量 coverage**。所以「补测试让这条 lane 转绿」目前物理上不可达，且这条 lane 现在对 coverage 不提供任何信号。
- **替代测量路径（本棒采用）**：`windows node 24 / coverage` 不调 bubblewrap，跑满 27m30s 并输出完整逐文件报告。**coverage 的验收数字自此从 Windows 腿读。**
- **复检条件**：上游 bump 这个 pin（或改用 apt/其他源）后该步自愈；届时 Linux 腿恢复，可回到两腿对照。

### 三、batch-2 实际是 4 包 / 7 处，不是 6 包 / 16 处（#172 已合）

#172 合入，merge commit `e2298de2b7b2`。原标题写「16 locations, 4 packages」内部不自洽：16 是 §1 记的**六包**整个 batch-2，而该 PR 只含其中四包、共 **7** 处。合并前已改正标题与正文。

验收按 UM18 既有两条标准，且**不用总数相减，而是逐条 diff 两侧位置清单**（基线 = #171 @ `41f879a268`，post-alpha.2 / pre-batch-2）：

| 账目 | 数量 |
| --- | --- |
| 基线总数（`41f879a268`） | 6753 |
| batch-2 真实修掉 | **−7** |
| `code-runtime-data-python/src/index.ts:119:43`（Linux 侧那一臂） | −1 |
| 同上 `:119:55`（Windows 侧那一臂） | +1 |
| **= 观测到的总数** | **6746** ✓ |

**零残余、零回归。** 标准②同样满足：那 4 个包在未覆盖清单里 0 命中。batch-2 剩余两包（`ui-present-decomposition` 实测 **4**、§1 记 3；`ui-present-table` 5）共 9 处，已由 batch-3 清掉；7 + 9 = 16 与 §1 对上。

### 四、新类别：平台互补分支 —— 单条 lane 永远不可能 100%

上表那对 ±1 不是回归。`packages/code-runtime/code-runtime-data-python/src/index.ts:119` 是

```ts
return process.platform === 'win32' ? 'process' : 'process-rlimit'
```

Linux 跑时 `'process'`（col 43）那臂不可达、Windows 跑时 `'process-rlimit'`（col 55）那臂不可达 —— **两条腿互相补足，但任何单条 lane 都到不了该行 100%**。这既不是 fork 内容债（包是 fork 自有：merge-base `ddefc45fbc` 上不存在），也不是「上游门在 fork 不可达」，是**第三类**。

助长它的是一条弱断言：`tests/runtime.spec.ts:31` 的 `expect(runtime.isolation).toMatch(/^process/)` 对两臂都成立，所以从不迫使任何一臂被覆盖。

处置：用对 `process.platform` 做注入/复原的测试在一次运行里覆盖两臂并**按平台断言确切值**（实测 `process.platform` 描述符 `configurable: true`，可 `Object.defineProperty` 改写后复原），而不是加豁免。注意 `vitest.config.ts` 已有 `windowsOnlyCoverageExclusions` 这种平台条件排除机制，但那是给「只在 win32 执行的整文件」用的；本例两臂都可达，**不该用排除**。

### 五、batch-3：10 包 / 72 处（#173，OPEN）

分支 `coverage/da-batch3-2026-09-19`，每包一个 `test(coverage)` 提交，共 10 个提交。10 个包全部 fork 自有（merge-base 上不存在）。

本机独立验收（一次合并 scoped run 覆盖全部 10 包，而非逐包跑 —— 降低窄 scope 的假缺口风险）：exit 0、15 个 spec / 344 通过 / 1 跳过、`Uncovered locations` 输出 **0 行**、阈值 `ERROR` **0 条**、各包 src 均 100/100/100/100。那 1 条跳过是**既有**的 live macOS keychain e2e（`darwin && DSH_KEYCHAIN_LIVE` 门控，本 PR 未动）。pre-push 三门绿（no production src on master、typecheck、upstream-sync record consistency）。

预期 CI 效果：6746 → **6674**（−72）。

### 六、两条方法论教训（比本棒任何数字都更值得带走）

1. **scoped 覆盖率对「从未被 import 的文件」报 `0/0/0/0`，而逐文件门会把这种文件直接跳过 —— 这是一条会产生「假绿」的路径。** 本棒实例：`ui-present-decomposition/src/index.ts` 与 `ui-present-table/src/index.ts` 都只是 `export function apply(): void {}`，CI 明确列出 `src/index.ts:1:17 uncovered function apply`，但空函数体**没有任何可插桩语句**，scoped run 里这两个文件报 `0/0/0/0`、reporter 静默、阈值不报错 —— 也就是说**本机 reporter 静默并不能证明这两处已清**。这类位置只能由 CI 全量清单裁决。UM18 原先只记了 scoped「报未覆盖可能是假缺口」这一个方向，**反方向（scoped 静默 ≠ 已覆盖）此前没记**。
2. **`/* v8 ignore */` 是本仓已认可的机制，不是豁免的变体。** `.agents/notes/implemented/process/2026-06-11-quality-gates.md:20` 明文：「unreachable defensive guards carry `/* v8 ignore */` with stated reasons **instead of deletion**」，master 上 **284 个文件**在用。约束是**仅限不可达臂**且须写明理由 —— `2026-09-04-client-present-table-fetchresult-wiring.md:54` 记过一次 review 正确否决了把 ignore 加在**可达**臂上的做法。所以「绝不进 `coverage-exempt.ts`」这条禁令**不**延伸到 `v8 ignore`；但每一处都必须按控制流核实不可达，不能凭断言。

### 七、三张票的归宿（本棒复核）

- **改名 `code-runtime-*` → `ptc-runtime-*`（§2.5.1）**：**仍阻塞。** #167、#114 在本棒仍未合（2026-09-19 复核：均 OPEN；#172 合并前读到 `CONFLICTING`/`DIRTY`，合并后 GitHub 重算中报 `UNKNOWN`）。前置不满足，本棒未动。
- **resolutionMode 兼容 shim（§2.5.2）**：复检票在册，本棒未动。待上游修好后重评估、届时删 shim；下次同步重跑 `test:snapshot` 验证。
- **da 是否采用上游 `plugin_manager`（§2.5.4）**：仍待用户决策，本棒未擅自采用。

### 八、upstream-merge 专项可否关闭

**上游合并本身已无残余**：master 站 alpha.2（`ddefc45fbc`），`upstream-status` behind 0 / owed 0 / consistent；`snapshots and artifacts` 已于收尾棒转绿；`verify-config-catalog`、`duplication` 均绿。

**唯一挂在本专项名下的未完项是 coverage，而第一节已证明它是数百 PR 的长期工程，量级上不属于一个同步专项。** 因此建议：**把 coverage 从本专项剥离为独立长期轨道后，upstream-merge 专项即可关闭**；本票的 coverage 部分（§1 + 本节第一、三、五节）作为那条轨道的起点账本。此建议待用户确认后再改本票 `Status`。
