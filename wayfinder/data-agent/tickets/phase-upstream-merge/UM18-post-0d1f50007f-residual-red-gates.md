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

### 3. `duplication` — 84 处 da 克隆（当前 0.32%，门槛 0.338%）

- 上游已**取消比例门槛**、改为「有克隆即红」（`.jscpd.json` 去掉 `threshold`、加 `exitCode: 1`、且扫描 spec 文件）；fork 保留比例门槛，本轮把「按设计重复」的正式协议包用 `jscpd:ignore-start/end` 围栏后，比例从 0.49% 降到 0.32%，**门当前是绿的**。
- 但 84 处克隆仍在，且随 da 代码增长会再次顶破门槛。主族：`ui-present-decomposition` ↔ `ui-present-table` ↔ `ui-suggest-followups` 的 card 组件、`ui-semantic-layer` 自身、`ui-semantic-layer` ↔ `schema-gateway`/`evidence-query` 的类型重复、`code-runtime-data-python` ↔ `ptc-runtime-node`/`ptc-runtime-python` 的运行时片段。
- 完成条件：把类型重复抽到共享包、card 组件抽公共壳；比例回落后再把门槛调回上游语义（零容忍）或更紧的比例。

## 非目标

- 不修上游内容：上述三项的失败面全在 fork 自有文件内。
- 不放宽门：不加 retry、不吞错、不把 da 包塞进豁免名单（用户已否决）。

## 观察项：sdk 快照的 initialize 超时（上游 profile 冷启动变慢，CI 硬件下越界）

PR #168 三轮 CI 里 `node 24 / snapshots and artifacts` 每轮都命中 `RequestTimeoutError: initialize timed out after 10000ms waiting for dsh profile "sdk"`，且**每轮命中的场景不同**（`subagent-continuable-inheritance` / `bash-tool` / `inline-image-prompt` + `subagent-continuable-inheritance`）—— 典型的预算边缘特征，不是录制内容漂移。

证据与归属：
- 本机：`snapshots/sdk/sdk.snapshot.ts` 单跑 20/20 绿，`pnpm run test:snapshot` 全量 4/4 绿；单个场景（含启动 + 握手 + 回放 + 断言）耗时 1.3–6.0s，握手本身远低于 10s。
- 对比：PR #167（基于合并前 master）同一 job 失败在 `test:expected`，**没有**这个握手超时 → 本现象是合并后才出现的。
- 归属：`sdk` profile、其插件名单、`packages/sdk/client` 的 `DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000`、以及 `snapshots/sdk/sdk.snapshot.ts`（已把 `requestTimeoutMs` 设为 110s、却没设 `initializeTimeoutMs`）**全部属上游**；fork 未向 `sdk` profile 挂任何 da 插件。666 个上游 commit 把该 profile 的冷启动变重，在 CI runner 上超过了上游自己的 10s 握手预算。

处置（按本 effort 准则）：**归为上游债，不在 fork 修** —— 不改上游的 `initializeTimeoutMs`、不加 retry、不降并行度、不重录快照。`node 24 / snapshots and artifacts` 因此在 fork CI 保持红，直到上游要么降低 profile 冷启动成本、要么把握手预算交给 lane 声明（如同它已经对 `requestTimeoutMs` 做的那样）。若要上报上游，证据就是本节。

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
- **待决策（fork 自有，非上游债）**：正解是把 `smoke-real.e2e.ts` 的断言改成 fork 真实的批次组成（3 批，含 da UI 那一组），并按「改废弃行为要连同其测试一起改、并在 PR 里说明理由」的准则记账；这属于 fork 刻意偏离上游测试，需单独一处 web 组成的核对（哪些 da UI 插件应进基座 web-app、是否该并进既有 combo 而非单起一批）。**本轮未改**：改上游逐字测试的断言超出 sdk 握手任务「不动断言」的约束，且它有独立根因，值得单独一条。
