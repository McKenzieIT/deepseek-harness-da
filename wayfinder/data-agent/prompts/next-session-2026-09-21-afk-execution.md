# AFK Execution Session — upstream merge 专项收口

> **承接** 2026-09-20 human-gates session（master `e84c34e934`，5 commits ahead of origin）。
>
> **本 session 唯一目标**：把 upstream merge 专项**完美收口**。§3 merge 续完 + 3 个 defect repo fix + §2 schema 扩展 + Q3 report 可见性 + UM4 Scope 3 instrumentation。所有人工闸已在上一 session 清掉，本 session **纯 AFK 执行**，无人工输入。
>
> **核心纪律**：通过 **subagent 并行执行**，最大化吞吐。§3 merge 是 serial（单 worktree），其余 disjoint 可并行 fan-out。

---

## ⚠️ 头号纪律：subagent 并行 + 不信 prompt 里的数字

**每个工作项派 subagent 执行**。主 session 只负责 orchestration + verification + commit。

- §3 merge：**1 个 serial subagent**，独占 `dsh-s3-resync` worktree，按 UM15 票里的 8 步 resume 序列执行。
- 其余（defect fixes / §2 schema / Q3 report / UM4 instrumentation）：**并行 fan-out**，每个一个 subagent，互不干扰（不同文件、不同子系统）。

**本 prompt 里每个 SHA / 行号 / 计数，动手前用工具复核**。上一 session 抓到 4 类 stale fact。

## 0. Preflight（subagent 跑，30 秒）

```sh
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git rev-parse origin/master          # 期望 909f8b508c
git rev-list --left-right --count origin/master...master   # 期望 0 left, 5 right (5 unpushed commits)
git rev-parse HEAD                   # 期望 e84c34e934
git status --short                   # 期望仅 5 个故意 untracked
git worktree list | wc -l            # 期望 8
git -C /Users/mckenzie/workspace/dsh-s3-resync rev-parse MERGE_HEAD  # c291e7961a51
git -C /Users/mckenzie/workspace/dsh-s3-resync status --short | grep -c '^UU\|^AA\|^DD\|^AU\|^UA\|^DU\|^UD'  # 期望 36 unmerged
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md");let n=0;for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;}console.log("U+FFFD:",n)'  # 13
```

## 1. Subagent 结构

### 1A. §3 merge subagent（serial，独占 dsh-s3-resync）

**Worktree**: `/Users/mckenzie/workspace/dsh-s3-resync`（branch `upstream/resync-2026-09-18`，mid-merge，36 unmerged）

**Input**: [UM15 ticket](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 的 `[2026-09-14] §3 第三轮 re-sync 开工` 节的 **§三 Resume 序列（严格按序，前 5 步不可调换）**。

**核心约束**（从该节提取，但 subagent 必须自己复核）：

1. **`tsconfig.base.json` 第一个解** —— 它红着，全仓 vitest 一个测试都跑不起来（`vite-tsconfig-paths` 解析失败 → 全局 setupFiles oxc transform 失败 → 0 tests abort）。2 个纯 additive union hunk / 484 path entries。
2. **`pnpm install --no-frozen-lockfile`** —— upstream 新增 `packages/util/chunked-list`（依赖 zod），无 `node_modules` 会让 `tsc -b` abort 级联 ~28 个幻影 TS 错。**`pnpm-lock.yaml` 是这一步的前置**。
3. **translation-pairing 配对 pass**（16 文件）—— `docs/**` 的 `.md` / `.zh.md` / `.i18n.yaml` 三件套同步解。
4. **manifest / misc union pass**（4 文件）—— 纯 union，无语义判断。
5. **regenerated-artifact pass** —— `packages/typert/generator/src/analyzer.ts` 必须第一个（阻塞后面所有 spec）。其余 regen artifact **take upstream generators + 重跑 fork regen**，不做三方合并。
6. **genuine three-way pass** —— 剩下真正需要读语义的。
7. **build 完成后回头重验 seam-2 的 client face** —— `remote-events.ts(32,5) TS2322` on `goal/activation-changed`。未判 benign，等 build 后看。
8. **然后按 RISK-MAP 顺序推剩余 4 个 seam：seam-5 → seam-1 → seam-3 → seam-6**。

**测试纪律**：
- 用**显式 spec 路径**，不用 `--dir`（会跑全仓 suite，十几分钟 + orphan worker）
- 不用 `--reporter=basic`（vitest 4 不存在）
- 每个 seam 解完就跑该 seam 的 testHotspots

**产出**：逐 seam commit（每 seam 一个 commit，从 `dsh-s3-resync` 推）。**不要 squash**。

### 1B. 并行 fan-out subagents（disjoint，可并行）

每个 subagent 独立 worktree 或主树 disjoint 文件区域。

#### 1B-i. 3 个 defect repo fix

**Tickets**: [UM-DEFECT-PRESENT-TABLE-SPLIT](../tickets/phase-upstream-merge/UM-DEFECT-PRESENT-TABLE-SPLIT.md) · [UM-DEFECT-PRESET-ROOTS](../tickets/phase-upstream-merge/UM-DEFECT-PRESET-ROOTS.md) · [UM-DEFECT-PRESET-DEPS](../tickets/phase-upstream-merge/UM-DEFECT-PRESET-DEPS.md)

**Fixes**（从各 ticket 的 "Repo fix" 节提取，但 subagent 必须自己复核）：

- **PRESENT-TABLE-SPLIT**: Fix tsdown config — `packages/client/ui-present-table/tsdown.config.ts` 加 `noExternal` 或 `split: false` 让 3 个 deps（`@tanstack/react-virtual` / `chart.js` / `react-chartjs-2`）inline。验证：rebuild 后 `lib/` 只有 `client.js`，无 sibling `.cjs` chunks。或者 fix module table（更大改动，风险高）—— 推荐前者。
- **PRESET-ROOTS**: `packages/bundle/data-agent/cordis.patch.yml` 的 agent-presets override 加 `roots:` 配置。验证：`--dump-config` 输出带 roots。
- **PRESET-DEPS**: `packages/bundle/data-agent/package.json` `dependencies` 加 11 个 tool-* deps（1 resolve-term + 10 semantic-layer-management preset 的），全 `workspace:^`。然后 `pnpm install`。验证：`healProfilesModuleFallback` BFS 现在能 reach 所有 11 个 → symlinks 自动出现在 `~/.dsh/profiles/node_modules/@deepseek-ai/`。

**Commit**: 3 个独立 commit（每 defect 一个）。

#### 1B-ii. §2 schema 扩展（knownRed[]）

**Source**: UM15 ticket 的 `[2026-09-13]` decision-doc §2 节 + `[2026-09-20]` calibration Q5。

**实现**：
1. `scripts/gate-coverage.manifest.json` 加 top-level `knownRed` 数组，schema: `{script, state, rationale, ticket, reopenTrigger, reviewBy?}`。两条 entry：
   - `verify-client-ui-i18n`（83 KNOWN-RED，intranet Chinese users）— `reopenTrigger: "product internationalization"`, `reviewBy: "2027-03-14"`
   - `doc-standard-tests`（2 KNOWN-RED，65-package README skeleton gap）— `reopenTrigger: "UM-FORK-README-SKELETON-RETROFIT resolved"`, `reviewBy: "2027-03-14"`
2. `scripts/verify-gate-coverage.ts` 加 **Check 4**：断言每条 `knownRed` entry 的 `script` 对应一个已 enrolled 的门（在 `run-gates.ts` 某个 mode 里通过 `pnpmScript` 调用）。不存在 → failure。
3. Spec test 覆盖 Check 4。

**验证**：`verify-gate-coverage` exit 0，两条 knownRed 都被识别。

#### 1B-iii. Q3 report 可见性改进

**Source**: UM15 ticket `[2026-09-20]` calibration Q3。

**实现**：`scripts/upstream-status.ts` report 加一节 **"Owed remediation (drop waivers)"**，列出所有 `decision:'drop'` 的 waiver：path + direction + ticket。不阻塞 push（report 永不 fail，exit 0），但每次 pre-push 都看到。

**验证**：跑 `pnpm run upstream-status`，output 包含 drop waiver 列表。

#### 1B-iv. UM4 Scope 3 instrumentation（轻量）

**Source**: [UM4 ticket](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) `[2026-09-20]` 节。

**实现**：在 `packages/data/preset-autojoin/src/index.ts` 的 `agent/created` listener（或新增的 `agent/pre-step` guard）加一行日志：`ctx.logger.debug?.('preset-autojoin: pendingSwitch=%s for session %s', ctx.agentPresets?.pendingSwitch?.(sessionId) ? 'in-flight' : 'settled', sessionId)`。这是为下一个 HITL session 的 capture 提供 instrumentation —— 即使 race 不复现，日志也能看到 switch 有没有尝试过。

**前置**：需要先在 `packages/preset/agent-presets/src/index.ts` 加 `pendingSwitch(sessionId)` read-only accessor（additive，不动 `@Remote('select')`）。

**验证**：tsc green，spec test（可选加一个 accessor contract test）。

#### 1B-v. UM-FORK-README-GENERATOR-RESIDUALS（如果时间允许）

纯 AFK，2 项残留。读 ticket 执行。

## 2. 执行顺序

```
preflight (30s)
  ↓
[并行启动]
  ├─ 1A: §3 merge subagent (serial, dsh-s3-resync, 预计 2-4 小时)
  ├─ 1B-i: 3 defect fixes subagent (预计 30-60 min)
  ├─ 1B-ii: §2 schema subagent (预计 20-30 min)
  ├─ 1B-iii: Q3 report subagent (预计 10-15 min)
  └─ 1B-iv: UM4 instrumentation subagent (预计 15-20 min)
  ↓
[subagent 陆续返回，主 session 逐个 verify + commit]
  ↓
push from dsh-resync (§3 merge commits) + push from master (其余)
  ↓
PR + merge
```

## 3. Hands-off 路径（**完全不碰**）

- `.worktrees/{r10,t1,g10}` — 其它 effort 的 worktree
- `wayfinder/evaluation/` — 独立 evaluation effort
- `wayfinder/task-orchestration-dag/` — 独立 effort
- `dsh-s3-resync` 的 `stash@{0}` — 保留勿 drop
- 5 个故意 untracked 文件（docs/adr + session prompt + 3× G13 research）

## 4. 铁律

1. 仅 `mcp__local__*` 工具；**从不 `--no-verify`**；commit `-F` + 显式路径；**永不 `git add -A`/`.`**（5 个 untracked 故意留着）。
2. **每个工作项派 subagent**。主 session 只 orchestrate + verify + commit。subagent 用 `Agent` tool + `isolation: 'worktree'`（如果改文件）。
3. `edit_file` BLOCKED on `map.md` → node Buffer byte-splice；核 **U+FFFD=13** + 字节守恒；**别复制任何 U+FFFD 字节进新文本**。
4. 推非 master ref 从 **`dsh-resync`** 推（主树 pre-push typecheck 会 fail，dsh-root build breakage 仍在，UM12/UM16 tracked）；PR 走 A 路径。
5. 测试用显式 spec 路径；`--dir` 会跑全仓；`--reporter=basic` 在 vitest 4 不存在。
6. **`dsh-s3-resync` 的 mid-merge 状态**：不要 `git merge --abort`、不要 reset、不要 cherry-pick。直接续解冲突。
7. `pnpm install` 在 §3 resume 第 2 步是**强制**的（`packages/util/chunked-list` 是 upstream 新增包，无 `node_modules` 会让 tsc abort）。

## 5. Gotcha 清单（上一 session 踩过的坑，传给 subagents）

| # | Gotcha | 详情 |
|---|---|---|
| 1 | `tsconfig.base.json` 是**所有验证的硬门** | 带冲突标记时，`vite-tsconfig-paths` 解析失败 → 全局 setupFiles oxc transform 失败 → 全仓每次 vitest run 都 0 tests abort。症状是"测试一个都不跑"。每一轮第一个解的文件必须是它。|
| 2 | merge 后 `pnpm install` 是强制步骤 | upstream 新增包 `packages/util/chunked-list` 依赖 zod，无 `node_modules` 会让 `tsc -b` abort 级联 ~28 个幻影 TS2307/TS2339/TS2322。|
| 3 | `vitest run --dir <pkg>` 会跑全仓 | 十几分钟 + orphan worker。用显式 spec 路径。|
| 4 | `--reporter=basic` 在 vitest 4 不存在 | 会报未知 reporter。|
| 5 | `dsh-resync` 缺 `fs_ext.node` | `node-gyp rebuild` 编好（`node_modules/.pnpm/fs-ext@2.1.1/node_modules/fs-ext/`）。session 持久化靠它。|
| 6 | headless "成功" 可能是假阴性 | `preset-autojoin` 对 `agent/created` 用 fire-and-forget 派发，mount 失败被默默吞掉。headless exit 0 不代表 preset mount 工作。|
| 7 | web profile 的 preset mount 从 profile 目录解析 | `ctx.baseUrl = file:///Users/mckenzie/.dsh/profiles/web/`，不是 bundle 目录。`packageInstalled()` 从这里向上 walk `node_modules`。`~/.dsh/profiles/node_modules/@deepseek-ai/` 是共享兜底层，由 `healProfilesModuleFallback` BFS 生成。|
| 8 | 52 个 client 包只有 1 个 code-split | `ui-present-table` 是唯一。module table 每包只服务一个 bundle（`dsh.client` entry），sibling chunks 从不注册。|
| 9 | verify-cordis-config 只查 bundle mount | 不查 preset `agent.cordis.yml` 的行。需要新 gate `verify-preset-rows-resolvable`。|
| 10 | `packages/bundle/data-agent/package.json` 漏声明 11 个 tool-* deps | 其中 `tool-resolve-term` 是 da preset live 行，其余 10 个是 semantic-layer-management preset 的。|

## 6. Push + PR

### §3 merge commits（从 dsh-s3-resync 推）

逐 seam commit，push 到 `upstream/resync-2026-09-18` 分支 → PR to master → `gh pr merge --merge`。

PR 描述写明：
- 36 out-of-seam 冲突 + 4 seam（5/1/3/6）co-adaptation
- 2 个 seam 已在上一 session 解掉（seam-4 自动应用，seam-2 union-resolve）
- `tsconfig.base.json` 门效应 + `pnpm install` 强制步骤
- 5 条 dry-run / RISK-MAP 都没有的发现（UM15 ticket §2.5）

### 其余 commits（从 master 推）

5 个已有 commit（`6852abc723`..`e84c34e934`）+ 本 session 新增的（defect fixes / §2 schema / Q3 report / UM4 instrumentation）→ push master → PR → merge。

PR 描述写明：
- 3 个 gate coverage defect + repo fix
- eval-cli tsconfig.tests.json + 防线转无豁免全绿
- §4 calibration Q1-Q5 + 核心行为变更落地
- §2 knownRed[] schema 扩展

## 7. 完美收口标准

本 session 完成时，upstream merge 专项应达到：

| 项 | 状态 |
|---|---|
| UM15 §3 merge | ✅ 全部 6 seam + 36 out-of-seam 解完，PR merged |
| UM4 Scope 3 | ✅ instrumentation 加好（accessor + log），defer 到下一 HITL session 验证 |
| 3 个 defect | ✅ repo fix 落地，临时 workaround（overlay + symlink）可删 |
| UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS | ✅ 已关闭（上一 session） |
| §2 knownRed[] | ✅ schema 扩展 + Check 4 + 2 entry |
| Q3 report 可见性 | ✅ drop waiver 列表加到 upstream-status report |
| UM-FORK-README-GENERATOR-RESIDUALS | ✅ 2 项清掉（如果时间允许） |
| PR | ✅ 全部 merged |

**专项归零**：本 session 后，upstream merge 专项的 open ticket 应只剩 UM4 Scope 3（等 capture 验证）和 §4 余下实现（Q2 日历字段 / Q3 report 已含）。其余全部 closed 或 deferred-with-plan。

## 8. Reference

- **UM15 ticket**: [UM15-durable-upstream-sync-method.md](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md)（§3 resume 序列 + §4 calibration 决策 + §2 schema 设计）
- **UM4 ticket**: [UM4-apiproxy-rehome-results-rpc-remote.md](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md)（Scope 3 instrumentation plan + capture 协议）
- **3 defect tickets**: `UM-DEFECT-PRESENT-TABLE-SPLIT.md` · `UM-DEFECT-PRESET-ROOTS.md` · `UM-DEFECT-PRESET-DEPS.md`
- **RISK-MAP**: `research/next-session-2026-09-14/um15-s3-seam-analysis/RISK-MAP.md`
- **上一 session prompt**: `prompts/next-session-2026-09-20-human-gates.md`（gotcha 来源）
