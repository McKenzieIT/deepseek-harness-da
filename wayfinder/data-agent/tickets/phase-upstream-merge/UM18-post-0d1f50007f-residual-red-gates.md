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
