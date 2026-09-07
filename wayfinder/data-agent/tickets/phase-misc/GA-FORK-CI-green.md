# GA-FORK-CI — fork (McKenzieIT) CI 跑不了 node 24 + master 一堆 gate 挂

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: PR #15 (GA-GT3 item 5/6) CI debug, 2026-09-06
**Size**: L  ·  **Risk**: Med（部分要 GitHub admin / 付费）

## 问题

fork（`McKenzieIT/deepseek-harness-da`）的 CI 没法跑绿，fork PR 拿不到 `all-checks-passed` 绿。三类根因（PR #15 CI debug 2026-09-06 确认）：

### 1. node 24 job 永远 queued（runner 问题）
`ci.yml` 的 `node-24`/`node-24-coverage`/`node-24-consumers` 用 `runs-on: ... || 'dsh-ubuntu-24-04-16core'`（custom larger runner，**org-restricted 到 upstream `deepseek-ai`**），fork 没这个 runner → queued forever。`windows-native` 同理（`dsh-windows-2025-16core`）。fork 也无 self-hosted runner（`gh api repos/.../actions/runners` 空）+ 无 secret（`gh secret list -R ...` 空）。fetch refspec 只 `+refs/heads/master:refs/remotes/origin/master`（不 fetch 其他 branch → `origin/fix/*` tracking ref 永远建不上，`--force-with-lease` 要用显式 OID）。

### 2. pre-existing master gate 失败（即使 runner 到位，CI 仍红）
PR #15 rebased 到 `origin/master` `24f954afa8` 后，临时改 standard runner（commit `a2345c5f95`，已 revert）让 node 24 跑起来，暴露 master 本身的 gate 失败：
- **`node 24 / static` FAIL**：`verify-runtime-closure`（python/sdk-runtime 缺 preset plugins/peers）、`DSH package licenses`、`Cordis config`、`constraints`、`gen-config-catalog: 6 violation(s)`、`client catalog`、`export jsdoc`（`fadeIn` missing @param graph/elementIds，`packages/client/ui-context-layer/src/client/graph-animations.ts:58`，来自并发 client fix `c26eada21b`）。
- **`node 24 / snapshots` FAIL**：`built-package-invariants`（examples `lib/bin.js` 没构建——`packages/examples/acp-demo`、`jsonrpc-demo`）、`publint`。`test:snapshot` + `web browser snapshot` 被 SKIPPED（依赖 built-package-invariants 失败）。
- **`node 24 / coverage` FAIL（7/16062；16006 pass）**：cordis lib resolution ×2（`lib/` 没构建）、`Cannot find package '@deepseek-ai/dsh-commands/remote'`、Windows console encoding、Windows pwsh loader（`cwd=/tmp/dsh-persistent-pwsh-loader-...`）、+ 平台相关 unclear（`inferred_idle` to be `stdin_read`、`{kind:'exception'}` to be undefined ×2、`1` to be `+0`）。
- **`Issue lifecycle`/`policy` FAIL**：fork 缺 token/secret（separate workflow，不在 `all-checks-passed.needs`，非 blocking）。

### 3. ci.yml 改 standard runner 会破 guardrail 测试
临时把 `node-24`→`ubuntu-latest`、`windows-native`→`windows-latest`（commit `a2345c5f95`，已 revert）能让 node 24 跑起来，但破了一个 guardrail 测试（`AssertionError: expected 'windows-latest' to contain 'DSH_CI_FAILOVER_WINDOWS'`——pin 了 failover 表达式）。且 master gate 失败（#2）仍在 → PR 还是红。故 PR #15 revert 了 ci.yml 改动，基于 `node 22.19`+`node 26`+`python`+`Pack npm` CI pass + 本地 266 测试 + subagent review merge（见 PR #15 comment）。

## 方案（grilling：选哪条）

| 方案 | 内容 | 代价 |
|---|---|---|
| (A) fork 配 larger runner | fork Settings → Actions → Runners → larger runners（16-core，label 对上 `dsh-ubuntu-24-04-16core` 或改 workflow runs-on）+ 补 secret | 付费（超免费额度）；master gate 失败（#2）仍在，要单独修 |
| (B) Linux self-hosted runner | 注册一台 Linux self-hosted runner（label `self-hosted/linux/x64/vm-backup` 或改 workflow label）+ `gh variable set DSH_CI_FAILOVER_LINUX=selfhosted -R ...` + 补 secret | 要一台 Linux 机器；master gate 失败仍在 |
| (C) standard runner + 修 guardrail + 修 master gate | ci.yml 改 `ubuntu-latest`/`windows-latest`（去 failover 表达式）+ 更新 guardrail 测试（接受 standard runner）+ 修 master gate 失败（#2） | 免费；coverage 在 2-core 可能慢/OOM（降 `DSH_COVERAGE_MAX_WORKERS` 等 parallelism）；master gate 修是重活 |
| (D) PR 重指 upstream | fork PR → upstream `deepseek-ai/deepseek-harness`（upstream CI 有 larger runner + secret + master gate 在 upstream 是过的） | cross-fork PR；不修 fork CI（fork PR 仍无绿 CI，但 upstream 有） |

任一方案，**master gate 失败（#2）是 agent 可查修的主体**：jsdoc `fadeIn` @param、`gen-config-catalog` 6 violations、`constraints`、`verify-runtime-closure`（python/sdk-runtime deps）、`built-package-invariants`（examples build）、`publint`——逐个查修。runner/secret（#1）是 GitHub admin（user）。

## 不在本票

- GA-GT3 item 5/6（已落地 PR #15）。
- upstream 的 CI（upstream 有 larger runner + secret；本票只关 fork）。
- GA-EXP1-gated items 1/2/3/4（GA-GT3 剩余）。

## Upstream merge 2026-09-07（merge-impact）

upstream CI 结构已变：`61f910d ci: split master-only jobs into ci-master.yml`（master-only job 拆进 `ci-master.yml`）+ 新增 `build-preview-cloudflare.yml`/`release-publish.yml`/`release-vendor-publish.yml`。本票的三根因分析（runner/master-gate/ci.yml guardrail）针对**老 ci.yml 结构**——merge 后须针对新结构（ci-master.yml + ci.yml + 新 workflow）重评。重落 fork #48/#52 + 评估 3 新 workflow 追踪 → [UM2](../phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md)；verify → [UM10](../phase-upstream-merge/UM10-verify-typecheck-lint-ci-gates.md)。Status 维持 Open，merge 后更新。
