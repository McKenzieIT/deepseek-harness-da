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

## 观察项：sdk 快照的 initialize 超时（CI 负载敏感，不是内容失配）

PR #168 两轮 CI 里 `node 24 / snapshots and artifacts` 各出现一次 `RequestTimeoutError: initialize timed out after 10000ms waiting for dsh profile "sdk"`，两次命中的场景不同（`subagent-continuable-inheritance`、`bash-tool`）。本机验证：`snapshots/sdk/sdk.snapshot.ts` 单跑 20/20 绿，`pnpm run test:snapshot` 全量 4/4 绿 —— 说明是 runner 负载下冷启动 `dsh --profile sdk` 超过 `packages/sdk/client` 固定的 10s initialize 超时，并非录制内容漂移。

处置：**先只观察**，不加 retry、不放宽超时（合并本身也让 profile 多挂了插件，若持续复发应先量 boot 成本再谈超时语义）。若后续 CI 反复命中，按 `dsh-ci-test-reliability` 的判据先定位「在等什么」，再决定是分档超时还是缩减 sdk profile 的冷启动工作量。
