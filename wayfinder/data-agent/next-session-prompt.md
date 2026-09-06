## 1. 环境/分支契约（session 启动第一步，必填）

前置：PR #15（GA-GT3 item 5/6）须已 merge / abandon（wayfinder 契约：下一并行批不得在本批 PR 未 merge 前启动）。确认后再起 worktree。

```sh
git worktree add ../dsh-FORK-CI -b fix/fork-ci-green master
cd ../dsh-FORK-CI
node scripts/install-lefthook.mjs
```

- worktree：`../dsh-FORK-CI`
- 分支：`fix/fork-ci-green`
- 基线：`master`（PR #15 merge 后的 HEAD）
- **禁止直推 master。** 本 session 触 `packages/client/ui-context-layer/src`（jsdoc fadeIn）+ `.github/workflows/ci.yml` + 测试，走分支 + PR。

## 2. 直推 master 白名单（commit 前自检）

- [ ] diff 不触及 `packages/*/src`、`apps/`、`examples/`、`native/`、`python/`、`scripts/` ← 本 session 触 src（jsdoc 等），不满足，走分支 + PR
- [ ] 仅 `wayfinder/` 文档或实验 probe 脚本 + audit-log 条目

## 3. 任务正文

### 票
[GA-FORK-CI-green](tickets/phase-misc/GA-FORK-CI-green.md)——fork（McKenzieIT）CI 跑不了 node 24 + master 一堆 gate 挂。本 session 驱动它（方案 C：standard runner + 修 guardrail + 修 master gate）。

### 仓库状态（2026-09-06 PR #15 CI debug 确认）
fork CI 三类根因（详见票）：
1. **node 24 永远 queued**：`ci.yml` 的 `node-24`/`coverage`/`consumers` 用 `runs-on: ... || 'dsh-ubuntu-24-04-16core'`（larger runner，org-restricted 到 upstream `deepseek-ai`），fork 没有；`windows-native` 同理（`dsh-windows-2025-16core`）。fork 无 self-hosted runner + 无 secret。
2. **pre-existing master gate 失败**（即使 runner 到位 CI 仍红）：PR #15 rebased 到 `origin/master` `24f954afa8` + 临时改 standard runner（commit `a2345c5f95`，已 revert）暴露——
   - `node 24 / static` FAIL：`verify-runtime-closure`（python/sdk-runtime 缺 preset plugins/peers）、`DSH package licenses`、`Cordis config`、`constraints`、`gen-config-catalog: 6 violation(s)`、`client catalog`、`export jsdoc`（`fadeIn` missing @param graph/elementIds，`packages/client/ui-context-layer/src/client/graph-animations.ts:58`，来自并发 client fix `c26eada21b`）。
   - `node 24 / snapshots` FAIL：`built-package-invariants`（examples `lib/bin.js` 没构建）、`publint`（`test:snapshot` 被 SKIPPED）。
   - `node 24 / coverage` FAIL（7/16062；16006 pass）：cordis lib resolution ×2、`Cannot find package '@deepseek-ai/dsh-commands/remote'`、Windows console/pwsh、+ unclear（`inferred_idle`/`{kind:'exception'}`/`1 to be +0`）。
   - `Issue lifecycle`/`policy` FAIL：fork 缺 token/secret（非 blocking，不在 `all-checks-passed.needs`）。
3. **ci.yml 改 standard runner 破 guardrail 测试**：`AssertionError: expected 'windows-latest' to contain 'DSH_CI_FAILOVER_WINDOWS'`（pin 了 failover 表达式）。

用户已表态：**不该需要 larger runners、无额外额度付费、无其他机器、去除相关的设定** → 走方案 (C) standard runner（不走 A 付费 larger runner / B self-hosted / D 重指 upstream）。

### 本 session 做（方案 C）

**第一步：grill 确认 + 排序**（`/grilling`，一次一问）
- 确认走 standard runner（`ubuntu-latest`/`windows-latest`），不 provision larger runner / self-hosted。
- master gate 失败（#2）逐个排优先级：code-fixable（jsdoc `fadeIn` @param、`gen-config-catalog` violations、`constraints`）vs CI-setup（`built-package-invariants` 缺 build 步骤、cordis lib 没构建——可能 ci.yml 加 build）vs deps（`verify-runtime-closure` python/sdk-runtime、`dsh-commands/remote`）。Windows console/pwsh + unclear 先放（平台相关，非阻塞主线）。
- 并发 session 的 code（`fadeIn` from `c26eada21b`）：改前先 `git status` / 重读，别踩并发；绝不 `git add -A`。

**第二步：实施（`/tdd`，先红后绿）**
- (a) ci.yml：`node-24`/`node-24-coverage`/`node-24-consumers`/`all-checks-passed` → `ubuntu-latest`；`windows-native` → `windows-latest`（去 `DSH_CI_FAILOVER_LINUX/WINDOWS` failover 表达式）。
- (b) guardrail 测试：`grep -rn 'DSH_CI_FAILOVER' packages/` 找 pin failover 表达式的测试，更新接受 standard runner（fork-specific；upstream 仍要 larger runner——测试里条件化 OR 标 fork-only）。
- (c) master gate 逐个修（先红后绿）：jsdoc `fadeIn` @param、`gen-config-catalog` 6 violations（`pnpm run` 看输出）、`constraints`、`verify-runtime-closure`（python/sdk-runtime deps）、`built-package-invariants`（examples build——ci.yml 加 build 步骤 OR 修 invariants）、`publint`、cordis lib build、`dsh-commands/remote`。
- (d) coverage parallelism：`node-24-coverage` 的 `DSH_COVERAGE_MAX_WORKERS=6`/`PARTITIONS=4`/`GATE_CONCURRENCY=3` 在 2-core 可能 OOM——降 `2`/`2`/`1`（若 coverage OOM）。

**第三步：验证 + PR**
- `pnpm run typecheck` 绿；`pnpm run check:ci:static` + `check:ci:coverage`（本地 subset）绿。
- push → CI 跑（node 24 在 ubuntu-latest 真跑）。目标：`all-checks-passed` 绿。
- `gh pr create` 走 dsh-pre-push-checks。
- 更新 GA-FORK-CI 票（修了哪些 gate + 剩余）+ map（Decisions so far 一行，若 resolved）。

### 不在本 session 做
- GA-EXP1-gated items 1/2/3/4（GA-GT3 剩余，等 EXP1）。
- GA-EVAL-EXPAND/EXP5（研究支线）。
- provision larger runner / self-hosted runner / 补 secret（用户已说无预算/无机器；若 master gate 修不完，再议 D 重指 upstream）。
- 别改 `runner.ts` 判分语义。
- 别碰 upstream 的 CI 配置语义（fork-specific 改动要可逆；upstream 仍用 larger runner + failover 表达式）。

## 4. 收尾（Lead integration boundary）

- [ ] `pnpm run typecheck` 绿
- [ ] 受影响包测试绿（`packages/client/ui-context-layer` 等）
- [ ] `gh pr create`，通过 dsh-pre-push-checks
- [ ] 更新 GA-FORK-CI 票 + map（若 resolved）
- [ ] **下一并行批不得在本批 PR 未 merge / 未 abandon 前启动。**

### 悬空项
- PR #15（GA-GT3 item 5/6）merge 前，本 session 不启动。
- fork fetch refspec 只 `+refs/heads/master:refs/remotes/origin/master`——`origin/fix/*` tracking ref 建不上；`git push --force-with-lease` 要 `git ls-remote origin <branch>` 拿显式 OID（见 PR #15 push 经验）。
