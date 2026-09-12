# Next-session prompt — 2026-09-12 post-PR-#117-merge（UM-ADAPT resolved）

> 承接 `next-session-2026-09-12-post-uism-apply.md`。本 session 收口：**UM-ADAPT RESOLVED**（8 移位判定表，零新票毕业）+ **seam 3 land**（admin lazy webServer）+ **PR #117 MERGED**。下文是**下一步怎么做**。

## 一、状态（勿重做，但**要复核**——交接前提会 stale，本 session 就修了 3 条）

- **origin/master** = `c174c9a784`（PR #117 merged，7 commit：ui-settings ctx→operations re-port 4 + seam-3 `9ba8638eac` + merge `bdecd11840` + doc-regen `83be9786e1`）。
- **remote resync 分支这次没被自动删**：`refs/heads/upstream/resync-2026-09-08` = `83be9786e1`（与 merged 内容一致）→ 后续 resync 工作**直接续用该分支**，不必新建（与 PR #115/#116 merge 后被删的情形不同，先核 `git ls-remote` 再假设）。
- **local master** = `3264a3c772`（tracker 提交 unpushed）。**master-sync 仍 BLOCKED**：origin-only ~2794 / local-only ~79，且 `git merge-tree` 冲突在 `wayfinder/evaluation/map.md` + `evaluation/tickets/README.md`（**evaluation effort 的文件**，铁律不碰）→ 须 evaluation effort 先 reconcile 或协调。**动手前重跑 merge-tree 自证**，别信本段。
- **worktree**：7，其中 `dsh-rda-admin` 现**可按 ancestry 安全删**（`git merge-base --is-ancestor 9ba8638eac origin/master` = YES，真 merge）→ 实际存活 6（master + 2 eval 不碰 + dsh-resync + 2 个 p2-keep）。⚠ 5 个 `refactor/p2-*` 仍**不可按 ancestry 判删**（按内容收编）。
- **门**（全量 `check:ci:static` 实测于 `83be9786e1`，418s）：**37 passed / 11 failed，零新增红**。红 = A 类 4（runtime-closure / constraints / export-jsdoc / translation-pairing，归 GA-FORK-CI-green/parallel-dev-cleanup 不在本期）+ B 类 1（type-equivalence 3 DRIFT：`AgentOptions.scopeId`/`ToolExecutionInput.scopeId`/`SubagentResult.costs` → UM-QODER）+ C 类 5（client-ui-i18n / package-dependencies / config-catalog / subsystem-pages / doc-standard → UM-C-GATES）+ tsconfig-paths（UM-INVARIANT trailing）。
- **票**：33 = **10 open** + 16 resolved + 6 archived + 1 folded。

## 二、UM-ADAPT 结论（已关票，勿重做这些分析）

8 移位全销账：**1 已 land**（seam 3）+ **5 already-aligned 零缺口**（seam 4 client-manifest = 纯 reader 侧类型集中化 / agent-inbox 走稳定 façade `agent.inject` / session-format v2 零耦合 / subprocess containment **是 opt-in argv wrapper 非 chokepoint**，上游自己的 `mcp-client/src/transport.ts:34` 同模式）+ **1 out-of-scope**（workspace-files seam **无写侧**、只受理 workspace-root 内读；fork fs 全是写且在 `~/.dsh` 外 → 采纳=改上游非适配 fork。已写进 map Out of scope）+ **2 归他票**（invariant→UM-INVARIANT / 根 entry→UM16）。**零新票毕业**。完整 file:line 证据在票 Resolution 表里。

## 三、推荐序（10 张 open 票）

1. **UM-UI-SETTINGS-MODELS-RE-PORT**（~1 min）：唯一剩余项 = PR 推送+merge，已随 #117 落地（slot-catalog 跨包项此前判 MOOT，它是 generated artifact）→ **翻 resolved 即可**。本 session 遵「一 session 一票」未擅自动它。
2. **UM-QODER-SUBAGENT-RETIRE**（1-2 session）：scopeId 半前提**已被证伪**（3 writer + 6 live reader：`tool-retrieve:327`、`tool-search-data-sources:727/731/750/751/755`；删它破 tsc 且移除 per-tenant linker 隔离，注释直指 tenant-leak #19）→ **拆票 re-grilling**，原「搭车免二次级联」理由不成立。**analysis workflow 可提速**。
3. **UM-MERGE-INTEGRITY**（0.5-1）：近 done。现有 3 件小事：knip/fake-api cleanup + **`packages/data/result-cache` 的 `"./client"` 死导出**（无 `dsh.client`、无 tsdown config、唯一引用是自己模块文档、在上游门 glob 外）+ **drop 已 stale 的 waiver**——`verify-upstream-sync-record` 仍报 `packages/client/ui-settings-models/ (revert-fork)` pending keep-or-drop，而 re-port 已 merged → 该 waiver 应 drop。**apply workflow 可提速**。
4. **UM11**（2-3，含 1 eval-gated）：PR+merge 部分已完；剩 worktree/branch 后清（`dsh-rda-admin` 可按 ancestry 删，见上）+ master-sync（gated）。
5. **UM12**（1-2）：伞票 11 门裁决 + cron follow-up。**CI 上真实 red set 现已可见**（PR #117 两轮 CI：仅 `Dependency layout` + `Pack npm tarballs` 红，其余绿/skip）——该 open 项可收。
6. **UM15**（1-2）：首片已完。**两条现成输入**：① Decision 5「seam-6 stale」票面文字**已过期**（`gen-architecture-graph.ts:90-92` 现读 `mode:'seam'`+`implementations:['api-workspace-files']`，§5a `f8c0e3abca` 已修）→ 关那行；② **cadence 触发器已响**：push 时门报 `upstream tracking ref c291e7961a51 ≠ record.current.upstreamSha c389f96bf3a9`（上游又前进）→ 判是否达 150-commit/14-天阈值、启下一轮 re-sync。
7. **UM-C-GATES-UPSTREAM-NEW**（1.5-5）：C 类门裁决。**analysis workflow 可提速**（one agent per gate）。
8. **UM6**（1）：`subsystem-pages` 5 条。9. **UM4** Scope 3（1-2）。10. **UM-LINT-B**（1）。
- **tsconfig-paths fix**（0.5-1，非票或归 UM-INVARIANT trailing）：去 stale `dsh-*/invariant` aliases。⚠ `tsconfig.base.json` 是 **JSONC**（含 `//` 注释）——验有效性须用 **tsc parser**，`JSON.parse` 本就报错。

## 四、铁律（勿忘 + 本 session 新增/加强）

- `mcp__local__*` only（built-in BLOCKED）；**subagent 也一样**——派 agent 时明确写「用 mcp__local__、找不到先 ToolSearch」，本 session 4 个 agent 照此全成。
- **改源码必跑全量 `check:ci:static`，不只针对门**——本 session **铁律第二次直接立功**：seam 3 在 `admin/pat-miss` 声明上方加 9 行 → `docs/event-producer-consumer.md` 记的 `:533` 变 `:542` 而 stale → `doc graphs` 门红（36/12）。**此刻 admin vitest 16/16 + tsc 全绿**——只跑针对门就会带新红上 CI。regen 后回 37/11。
- **regen 后逐行审 diff**：本次恰好每 locale 1 行 + 2 pair hash，符合预期才提交。
- `map.md` 含 U+FFFD（**13**）→ **byte-splice**（Node Buffer + indexOf + concat，**前后断言计数不变**），禁 edit_file/`cat >>`；ticket .md 追加用 `cat >>` + quoted heredoc（先 `grep -c $'�'` 确认该票干净）。
- node v24：`export PATH="/usr/local/bin:$PATH"`；sh 非 bash（勿 bashism）；commit message 用 `-F` 文件。
- master 上 `git add` **只显式路径**——本 session master 工作树一直躺着 **task-orchestration-dag effort 的未提交改动**（12 M + 9 ??），全程未碰；commit 前核 `[ -f .git/index.lock ]`。
- 不碰 `.worktrees/` + `wayfinder/evaluation/`；**不擅自 push/merge**（本 session 的 push+merge 是用户明确授权）。
- push 前 lefthook pre-push 三门（no-prod / typecheck / upstream-sync-record）——`git push` 会自动跑，**被拒的 push 是无害的**，不必先单独预跑。
- **交接前提会 stale，动手前自证**：本 session 修了 3 条（master tip 已前进到别人的提交 / resync「3 commit unpushed」其实已推 / resync-vs-origin 是 4 ahead 非 3）。

## 五、workflow 提速（安全情况下尽可能用）

analysis/sweep 型可 workflow 或并行 subagent 提速：**UM-QODER**（scopeId 3 writer/6 reader 枚举 + per-tenant linker 隔离评估）· **UM-C-GATES**（one agent per gate）· **UM-MERGE-INTEGRITY**（disjoint-batch apply sweep）· **UM11**（one agent per worktree/branch，⚠ p2-* 须内容审）· **UM12**（one agent per gate re-baseline）· **UM-LINT-B**。
**范式**（本 session 用 4 个并行 read-only Explore agent 收 UM-ADAPT 的 4 个 shift，27-40 tool call/agent、无瞬态故障）：mode 硬编码 inline（`args` 不经 scriptPath/resumeFromRunId 传播）；agent 只**读/分析** disjoint 文件、永不 git 写、永不跑门（门要 4-7 分钟）；main session 串行 gate+commit；**明确要求「负面结论是合法且宝贵的发现」**——本 session 4 个 agent 全是清白负面，正是这条指令换来的可信度（前有 session 把 `gen-architecture-graph` 存在于 upstream 当前提结果被证伪）；apply 后跑全量 sweep 复核，勿信 agent 自报。

---

## 六、二次收口增量（2026-09-12 晚；**supersedes 上面 §一 的票账与 §三 的第 1 项**）

- **票账订正**：33 = **9 open** + **17 resolved** + 6 archived + 1 folded。**UM-UI-SETTINGS-MODELS-RE-PORT 已 resolved**（§三 第 1 项已做掉，勿重做）——两项「剩余」均消：slot-catalog 跨包判 MOOT（generated artifact）+ PR 已 merge。
- **frontier（open + unblocked + unclaimed）= 7 张，可立即取**：UM12（blocker UM10 已 resolved）· UM-C-GATES-UPSTREAM-NEW（证据备齐待拍板）· UM-LINT-B（证据备齐待决策）· UM-MERGE-INTEGRITY（近 done，3 件小事）· UM15（cadence 触发器已响）· UM4（blocker 2026-09-10 已解除）· **UM-QODER（本轮新解锁**——票头 `Blocked by: UM11` 的理由「PR merge 后再做」已随 #117 满足）。**blocked = 2 张**：UM6（仅剩 UM4 前置）· UM11（UM12 + UM-MERGE-INTEGRITY，且其 master-sync 部分被 evaluation 分叉外部阻塞）。
- **UM12 的「CI 真实 red set」已可关**，并**新增一条结构性发现**：**CI red set ⊊ 本地 red set**——本地 `check:ci:static` 11 红里，有 **9 个在 GitHub workflow 上没有对应 job**（A 类 4 + type-equivalence + client-ui-i18n + config-catalog + subsystem-pages + doc-standard + tsconfig-paths）。**只看 CI 会系统性低估 9 个红；CI 绿 ≠ 门绿。** 是否接上 CI = UM12 / UM15 §2 gate-coverage 的裁决点。
- **master 现在有两个独立的不可推原因（都不是我们的票造成的，都源自 evaluation effort 的提交）**：
  1. **non-FF 分叉**：`origin/master` `c174c9a784` 不是 local master 的祖先（origin-only **2802** / local-only **81**）；`merge-tree` 冲突恰好 2 文件（`wayfinder/evaluation/map.md` + `evaluation/tickets/README.md`）。**两侧都有对方没有的真内容**（origin 独有 README 矩阵的 T12 + 票链行；local 独有 R10/G10 行 + 重写的「领域职责」段），且**已排除「只是标点全宽/半宽」**（归一化后仍差）→ 需 evaluation 域知识的 cross-effort reconcile，盲选一侧会静默删内容。
  2. **lefthook pre-push 门 `no production src on master` 拒推**：`scripts/verify-no-production-src-on-master.ts` 报唯一违规提交 = **`2877a59cfd wayfinder(evaluation): resolve G10 data-domain core`**，因它碰了 `scripts/translation-pairing.manifest.json`（`PROD_SRC_PATTERN` 的 `scripts/` 分支）。按仓库自己的规则（CLAUDE.md / `docs/da-pr-workflow.md`）该提交须移到 feat/ 分支走 PR。**注意该门 key 在「当前 checkout 的分支名」**（`if (branch !== 'master') process.exit(0)`），所以在 master worktree 里推**任何** ref 都会被拦；从别的 worktree 推非 master 的 ref 则合法跳过。**另记一条张力**：`scripts/` 全树受保护，而 `scripts/translation-pairing.manifest.json` 恰恰是「纯 wayfinder 文档工作」新增文档对时必须更新的文件 → 「wayfinder 文档可直推 master」与「scripts/ 受保护」在此互相打架，值得单独裁决（归 parallel-dev-cleanup 的 R4-ci-red-gate-policy 或 UM12）。
- **已推的备份**：`backup/master-tracker-2026-09-12` = master 全线（tip `928199659a`，81 commit），从 `dsh-resync` worktree 推（HEAD≠master 故门合法跳过；**并未推 master、未动任何 PR**）。work 已不只在本机。**注意它只是备份分支，不是 PR**——真要落 `origin/master` 仍须先解上面两条。
- **不要试图 cherry-pick 本轮 tracker 提交到 `origin/master`**：已实测 `origin/master` 的 `wayfinder/data-agent/map.md` 是**过时快照**（缺 [2026-09-12] PR #116 与 UM-ADAPT 两条 bullet），把新 bullet 摘过去会得到一份缺中间内容的错 map。
