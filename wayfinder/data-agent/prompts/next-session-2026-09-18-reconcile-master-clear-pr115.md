# Next-session prompt — UM-flow Phase C：reconcile fork master 清 PR #115（5 wayfinder doc 冲突，doc-only）→ merge + UM11 post-cleanup

> 承接 `next-session-2026-09-17-um15-slice5-pr.md`（本 session 已执行）。第五轮收尾：UM15 §5 全落 resync（`f8c0e3abca` seam-6 + `0301586bed` lefthook pre-push）+ **推 PR #115（OPEN，CONFLICTING 5 wayfinder doc，代码零冲突）** + 文档全更新（master `f0038f63e4`：第五轮 update + 遗留快照 + PR-status）。**本 session 未 push local master、未 force-push、未自动解冲突**（皆会丢 wayfinder 内容）。下 session 首要 = **reconcile fork master 清 PR #115**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **UM15 首片（§1-§5 + lefthook）durable method 实现完**（resync `0301586bed`，7 grilling 全收口）：staleness（local pre-push 门 `verify-upstream-sync-record` + `upstream-status` report）+ regen 清单（§3 generator-inputs manifest）+ meta-gate（§2 gate-coverage）+ 三道完整性门（§4 upstream-sync-record）+ impact report（§4 stage2）。仅剩 PR merge + 未来自动化 slice。
- **B 类 4 真回归**：markdown-links ✅ GREEN / agent-note-format ✅ GREEN / type-equivalence 🅿 known-red→UM-QODER-SUBAGENT-RETIRE / package-invariants 🅿 known-red→UM-INVARIANT-COMPANION-CLEANUP。作 known-red 进 PR #115 清单。
- **大原则**（用户 2026-09-15 锁定）：upstream 内容不改、上游最新是什么用什么；fork 自有按需重构。
- **pre-merge 基线**：`65bf3cddc9`（真 fork parent）。`558e6f4f66` 是 M1 后代不是 parent。
- **UM-MERGE-INTEGRITY**：M1 复活 100/丢 2/回退 27（ui-settings 整包）、M2 全 0。三道完整性门 + 第四类（merge 侧擅动 fork 自有，`--diff-merges` 才可见）。waivers 已录 `upstream-sync.json`（10 条覆盖 129 M1 finding）。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip `0301586bed`，**已 push origin**（`origin/upstream/resync-2026-09-08` = `0301586bed`），工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip `f0038f63e4`，**local ahead `origin/master` 15+ commit（unpushed）**，工作树干净 |
| **PR #115** | **OPEN** https://github.com/McKenzieIT/deepseek-harness-da/pull/115（base `master` ← head `upstream/resync-2026-09-08`，4 点 body）；GitHub **CONFLICTING/DIRTY** |
| 冲突文件 | **5 个 wayfinder doc**：`wayfinder/data-agent/map.md`(content) + `tickets/phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md` / `UM-flow-2026-09-08.md` / `UM14-resync-to-upstream-latest.md` / `UM16-build-green-on-synced-base.md`(add/add)；**代码零冲突**（upstream-sync code clean merge）|
| merge-base(origin/master, resync) | `65bf3cddc9`（旧 pre-merge 基线） |
| `origin/master` tip | `e064933dc8`（有 evaluation R1+G1 wayfinder work，origin/master-only） |
| `check:ci:static` | **36/11**（本 session 零新增）|
| `build:official` | GREEN（lib/+dist/ gitignored，别乱 rebuild）|
| `pnpm run verify-upstream-sync-record` | exit 0（read-only；ref stale + 1 pending waiver `ui-settings-models/` revert-fork）|
| `pnpm run verify-architecture-graph` | exit 0 |
| `lefthook run pre-push` | 三门全绿（no-prod 3.17s / typecheck 30.21s / upstream-sync-record 6.08s = 本 session 新加） |

### 根因：fork master 分叉（PR #115 冲突根因）

- **`origin/master`（`e064933dc8`）** 有另一 clone/session 推的 **evaluation R1+G1 wayfinder work**（origin/master-only：`e064933dc8` "Merge R1+G1 redo" + 一串 `wayfinder(evaluation)` commit + `ab7639e360` "chart UM re-sync + data-agent 改造 + durable 方法 flow (master-direct of 558e6f4f66; minus map.md which structurally diverges — comes via UM11 PR)"）。
- **local master（`f0038f63e4`）** 有 **um-flow work**（15+ commit unpushed，含 09-17 第五轮/遗留/PR-status）。
- **resync 从 local master 分叉** → 缺 origin/master 的 evaluation wayfinder → 双方都加了那 5 文件 → add/add。
- 即 fork 有两条互不相交的 wayfinder doc 线（evaluation 在 origin/master，um-flow 在 local master），resync 只继承 um-flow 线。**代码两线都不碰** → 代码 clean merge。

## 三、⚠ 并行铁律（违反必返工）

1. 同一棵树禁止两 subagent 同时跑 build / `gen-*` / `check:*`（写 `dist/`/`lib/`/`.tsbuildinfo`，并发互坏）。
2. 主 session 独占写操作（build / `gen-*` / `git commit` 串行）。
3. subagent 只读分析 + 产出 patch 方案，不自己跑 build/gen/commit/改文件（需写代码给独立 worktree——但⚠ worktree 默认 base=origin 无 §4 core + 无 node_modules；read-only subagent 代码写 /tmp + 主 session cp 更稳）。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 写操作不可以。
5. 主 session + subagent 一律 `mcp__local__*`（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里 `grep -rEn`。`rg`/`grep -P` 不存在（BSD grep）。
6. node v24 强制：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。v25.9.0 系统默认 crash tsdown/rolldown/fs-ext。
7. shell 是 `sh` 不是 bash：不支持 `<(...)`，用临时文件 + `sort`/`comm`。多行 commit 消息用 `git commit -F <file>`（`mcp__local__write_file` 写 /tmp）。
8. **⚠ split-brain 铁律**：`mcp__local__*` 跑 Mac 上够不着 runner transcript。subagent 大交付（>~100KB 截断）让它自己 `mcp__local__write_file` 写 /tmp，主 session `cp`。
9. **⚠ subagent 瞬态故障**：长 subagent（>~15min/30+ calls）可能撞 `socket connection closed unexpectedly`。对策：① 先起最小 probe 验存活 ② 逐节派 ③ 增量写盘 ④ 给已验证锚点减探查。
10. **不 push**（PR 已开 #115；reconcile master 的 push 须用户明确指示 §六）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。本 session 又证：① §5 prompt 记短名「likely `api-workspace-files`」——自读 `package-graph.ts` `short: json.name.slice(SCOPE.length)` 派生 + 读 `packages/api/workspace-files/package.json` 实测（与推测同，走核而非信）；② §5 prompt 警告「gen-architecture-graph 重写全文可能大 diff」——基线先验 `verify-architecture-graph` GREEN 再编辑再 regen，diff **实测 1 行**；③ 「门只读」——跑 `verify-upstream-sync-record` 前后 `git status` 对比证零写。凡结论自己重跑。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。throw 是预检在生成前抛的，修完它生成器才跑到底，报真实 staleness。
- **🆕（本 session 新证）`mcp__local__edit_file` 重编码 UTF-8 → 破坏既有 mojibake/U+FFFD**。本 session edit map.md 把 line 351 的 GA-EVAL-SQLGEN-FOLLOWUP FFFD 5→6（edit_file 解码全文 U+FFFD 再重编码，对 pre-existing 畸形字节序列非等价）。**对策**：编辑含 U+FFFD/mojibake 的文件（map.md 有 13 个 pre-existing FFFD，line 234/245/351/354）**禁用 edit_file**，改用 **byte-level splice**（node `fs.readFileSync` 取 Buffer → `Buffer.indexOf(marker)` 定位 → `Buffer.concat([前, insertion, 后])` → `fs.writeFileSync` 原样回写）。insertion 用 `mcp__local__write_file`（UTF-8 干净）写 /tmp，splice 脚本 read 它的 raw bytes。本 session 验：byte-splice 后 FFFD 13 不变、diff 1 hunk 纯插入零删除、line 351 byte-identical。干净文件（0 FFFD）edit_file 无损仍可用。
- **🆕（下 session 解 PR 冲突时）取 ours 前先核 local 版本确比 origin 新且更全**。5 冲突都是 UM-flow 票（evaluation 在 `wayfinder/evaluation/` 独立文件，clean merge 不入这 5），理论 local（含 09-17 第五轮）更全 → 取 ours。但须逐文件 `git diff :1:<file> :3:<file>`（base vs ours）+ `git diff :2:<file>`（theirs/origin）核 origin 版本无 local 缺的独有内容（别丢）。map.md：local V_local（第五轮+遗留+PR-status，byte-splice 写）vs origin "comes via UM11 PR" stub/旧版 → 取 ours 后须 `pnpm run verify-architecture-graph` 仍 GREEN。
- `~/.gitconfig core.symlinks=false` 让 tracked symlink 落路径文本——每次新 checkout 必查必修。
- master 树 index.lock 警惕：删前必查 mtime + `ps aux | grep git`。

## 五、本轮编排（首要：reconcile master 清 PR #115）

1. **fetch + merge origin/master → local master**（master 树，主 session 串行）：
   - `git -C /Users/mckenzie/workspace/deepseek-harness-da fetch origin`
   - `git merge origin/master`（local master 在 `f0038f63e4`）
   - 预期 5 wayfinder doc 冲突（map.md + UM-ADAPT/UM-flow/UM14/UM16）。evaluation work（`wayfinder/evaluation/`）应 clean merge（local 无 → origin 加，不冲突）。
2. **逐文件解 5 冲突**（§四：取 ours 前先核）：
   - `git diff :1:<file> :3:<file>`（base→ours 改了啥）+ 看 `:2:<file>`（theirs/origin 版本）——核 origin 无 local 缺的独有内容。
   - 理论取 ours（local，含 09-17 第五轮更全）：`git checkout --ours <file> && git add <file>`。若 origin 有 local 缺内容（不应有），手动 combine。
   - map.md 取 ours 后：`pnpm run verify-architecture-graph`（须仍 GREEN——local map 是 byte-splice 写的 V_local，regen 确认 current）。
3. **核解后状态**：`git status` 干净 + `verify-architecture-graph` GREEN。
4. **commit the reconcile** on local master：`[wayfinder] reconcile fork master: merge origin/master evaluation work, resolve 5 wayfinder docs (take ours)`。
5. **push local master → origin/master**（fast-forward，因 local 现含 origin 的 evaluation；触发 pre-push 三门已绿）。⚠ **outward push 须用户明确指示（§六）**。
6. **PR #115 自动清空**（base 升级到 reconciled master → resync code clean merge → GitHub mergeable）→ merge PR：`gh pr merge 115 --repo McKenzieIT/deepseek-harness-da --merge`（或 GitHub UI）。
7. merge 后 → **UM11 post-cleanup**：删 resync remote branch `git push origin :upstream/resync-2026-09-08` + 本地 `git -C /Users/mckenzie/workspace/dsh-resync branch -D`（或留 resync 树待 UM11 Scope 4-6 统一收尾）；branch/worktree 收尾（⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删；不碰 evaluation worktree `.worktrees/r10-harness-goodhart`/`.worktrees/t1-exec-grader` + master 的 eval session index.lock 警惕）。

### ALT（用户定，若暂不 reconcile）

- **线 3 translation zh**（AFK，UM-QODER-RETIRE 前置）：用户决策 = 生成器带上 zh (a)。照 `gen-module-graph`（写 md/zh/i18n 三件）给 `gen-doc-graphs` 6 产物加 zh 渲染 + `.i18n.yaml` 配对哈希。**先做 zh 让 Qoder 退场级联干净**（退 Qoder 删 costs 触发 doc-graphs regen，只写英文 → regen 让 translation-pairing 变红；先 zh 则级联清零）。
- **线 D knip+fake-api 删 + L6 allowlist**（quick，UM12 有 patch）：`knip.json` + `connection/tests/fake-api.client.ts` 删（改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`；⚠ 别误删 `api/session-controller/tests/fake-api.client.ts` 7 spec import）；L6 `application-entrypoints` 10 条加 `MANIFEST_BIN_ALLOWLIST`+`EXECUTABLE_SOURCE_ALLOWLIST`。
- GitHub 手动 review/解 5 冲突。

## 六、本 session 不做

- **不 force-push master**（origin/master 的 evaluation work 会被覆盖丢）。
- **不自动解 5 冲突**（盲目取一边丢另一边 wayfinder 内容；须逐文件核 §四）。
- **不 push local master**（outward，§六 须用户明确指示）。
- **不删分支/worktree**（归 UM11 Scope 4-6 + A23）。⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删。**不碰 evaluation worktree**（`.worktrees/r10-harness-goodhart`、`.worktrees/t1-exec-grader`）+ master 的 eval session（index.lock 警惕）。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——真特性 merge → UM-UI-SETTINGS-MODELS-RE-PORT。
- **不直接修 type-equiv/package-invariants 门**——各归专属票，作 known-red 进 PR。
- **map.md 的 U+FFFD（13 个 pre-existing，line 234/245/351/354）**：out of scope（parallel-dev-cleanup），别猜着改。**编辑 map.md 禁用 edit_file**（会 corrupt mojibake），用 §四 byte-splice。

## 七、起手 checklist

1. Read 本 prompt + [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 2026-09-17 第五轮 update + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) + [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)。
2. **核两 tip + 两树状态**：resync `0301586bed`（已 push，0 行）、master `f0038f63e4`（0 行，ahead origin 15+）。⚠ **核 symlink**（resync）：`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。若坏：`git config core.symlinks true` + `git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt` + `xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt` + `git status --short --untracked-files=no`（必空）。
3. `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **核 PR #115 现状**：`gh pr view 115 --repo McKenzieIT/deepseek-harness-da --json mergeable,mergeStateStatus`（确认仍 CONFLICTING；若用户已手动解则 mergeable）。
5. **reconcile master**（按 §五 1-5；outward push 须用户指示）→ PR 清空 → merge → UM11 cleanup。
6. 目标：① PR #115 清空+merge ② UM11 post-cleanup ③（ALT）translation zh / knip+L6。

## 八、遗留项审计 + session 估算

**11 门红**（`check:ci:static` 36/11，零新增）：A4 pre-existing known-red（`runtime-closure`/`constraints`/`export-jsdoc`/`translation-pairing`）+ B2 known-red 不阻塞 PR（`type-equivalence`→UM-QODER-RETIRE costs+scopeId×2 / `package-invariants`→UM-INVARIANT-CLEANUP 67 companion+7 peerDep）+ C5 upstream 新门 fork 未满足（`client UI i18n` 98 / `package dependencies` 74 / `application entrypoints` 10 / `subsystem pages` 5 / `documentation standard tests`，known-red 或 quick fix）。

**11 open 票**：UM-ADAPT（per-shift adaptive，仍开）/ UM-LINT-TYPEAWARE-CORDIS（93 lint 假阳）/ UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup pending）/ UM11（reconcile+merge+后清）/ UM12（GA-FORK-CI re-sweep 11 门 + cron follow-up）/ UM15（首片完，剩 PR merge + 未来自动化 slice）/ UM4（apiproxy re-home 收尾）/ UM6（docs/subsystems）/ UM-UI-SETTINGS-MODELS-RE-PORT（整包真特性 re-merge ~30 文件）/ UM-QODER-SUBAGENT-RETIRE / UM-INVARIANT-COMPANION-CLEANUP。

| 终点 | 估算 | 说明 |
|---|---|---|
| **PR #115 清空+merge** | ~1-2 session | reconcile master（解 5 doc 冲突取 ours，须逐文件核）~1 + push+merge ~1 |
| **UM 专项完美结束** | ~12-18 session | + ui-settings re-port ~2 + UM-ADAPT/UM4/UM-CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT/Typert sprint ~3-4 + QODER-RETIRE ~1-2 + INVARIANT-CLEANUP ~1 + UM15 cron follow-up（UM12 绿基线后）~1 |
| **全门绿（含 fork 债）** | ~20-27 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination）|

**关键不确定**：reconcile master 时 5 wayfinder doc 的 origin 版本是否有 local 缺的独有内容（理论无——都是 UM-flow 票 + evaluation 在 `wayfinder/evaluation/` 独立文件 clean merge，但须逐文件 `git diff :1: :3:` + `:2:` 核）；PR review 轮次/merge 时机（用户定）；ui-settings re-port 规模未量化；documentation standard tests scope 未知；QODER-RETIRE 的 3-gen cascade（cordis+config+doc-graphs）规模；translation zh 对 gen-doc-graphs 6 产物的改动量。
