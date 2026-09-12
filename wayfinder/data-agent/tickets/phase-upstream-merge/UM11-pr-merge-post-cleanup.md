# UM11 — PR + merge + 后清理分支

**Type**: task
**Phase**: upstream-merge
**Status**: resolved (2026-09-13 Cluster C — rda-admin-lazy safe-deleted; p2-* keeps documented; chore/um-arch-impl branch-absent, rescue partial-applied elsewhere)
**Assignee**: unclaimed
**Blocked by**: ~~UM10~~（resolved）+ ~~UM12（B 类 4 硬阻塞 2026-09-15 全绿；CI real red-set 09-12 via PR #119 第 4 次再证）~~ + ~~[UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)（ui-settings-models revert 已由 PR #117 re-port；PR #119 empirically 证不阻 push——剩余 waiver drop 是清理型 chore）~~ → **不再阻 push**；p2-* 后清无环境阻塞，可 AFK 推进
**Related**: session-prompt 收尾（Lead integration boundary）；CLAUDE.md "并行 session 分支纪律" + "提交与引证纪律"

## Findings (2026-09-08 reframe)

见 [UM-flow-2026-09-08](UM-flow-2026-09-08.md)（Phase C）。原 UM11 框的是"PR d347e703 merge"，但调查发现 merge 落后 upstream 449 commit + build:official 根 entry 是 upstream 共享 breakage（re-sync 修不了）。**本票 PR 的是 synced-to-latest（UM14）+ data-agent 改造（R-DA，UM-ADAPT 判定）+ build-green（UM16）+ cordis regen 之后的分支**，非只 d347e703 merge。下方 Scope 是旧框（d347e703 merge，2270 commits），**以本 Findings + flow doc 为准**——re-sync 后 Scope 会更新为 re-sync 范围（`d347e703`→`c389f96bf3`，+449）+ seam 3/4 break 迁移 + workspace-files 采纳 + adaptive 改造 + build-green 证据。

## Scope

1. `gh pr create`（base master, head `upstream/merge-2026-09-07`）。大 PR（2270 commits）——review focus 在**冲突解决 + GA-FORK-CI 非回归**，非逐 commit。
2. 过 [dsh-pre-push-checks](../../../../.agents/skills/dsh-pre-push-checks/SKILL.md)。
3. PR body 含：merge 范围（base `141eb6f`→`d347e70`）、冲突分类解决摘要（UM2–UM9）、GA-FORK-CI 非回归证据（UM10）、violating 票据 addendum 指针。
4. merge 后**清已-merge 本地分支**。
5. **删 3 弃分支**：`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`（tied to A5，UM3 解决→删）、`docs/cleanup-map-update`。
6. worktree `../dsh-upstream-merge` 处置（keep/remove 视后续）。

## 2026-09-10 实况盘点（UM10 线 A 顺带核，供本票 Scope 4/5/6 用）

**A23 的 blocker 已消失。** A23（worktree/branch 收尾）原阻塞于「9 个非我 worktree 仍活跃」（`dsh-cb1b`/`dsh-ece`/`dsh-R1`/`dsh-T2`/`dsh-T4`/`dsh-T7`/`dsh-upm`/`dsh-translation-pairing`/`dsh-repo-infra-matt-pocock-setup`）——2026-09-10 实测**这 9 个现存 0 个**，并行 session 已停。→ **A23 现 unblocked**，可并入本票 Scope 4/5/6 一次做完。

### worktree 实况（16 个）

| worktree | branch | 处置判据 |
|---|---|---|
| `deepseek-harness-da` | `master` | 主树，保留 |
| `.worktrees/r10-harness-goodhart` | `research/R10-harness-goodhart-papers` | **不属本 effort**（evaluation effort）——勿动 |
| `.worktrees/t1-exec-grader` | `feat/T1-exec-grader-impl` | **不属本 effort**（evaluation effort）——勿动 |
| `dsh-resync` | `upstream/resync-2026-09-08` | **PR 主体**，保留至 merge |
| `dsh-arch-regen` | `chore/um-arch-regen-2026-09-09` | 已含入 resync → 可删 |
| `dsh-cordis` | `task/um-cordis-regen-2026-09-09` | 已含入 resync → 可删 |
| `dsh-um16` | `task/um16-root-entry-2026-09-09` | 已含入 resync → 可删 |
| `dsh-rda-p1` | `refactor/rda-client-runtime-phase1-2026-09-09` | 已含入 resync → 可删 |
| `dsh-upstream-merge` | `upstream/merge-2026-09-07` | 已含入 resync → 可删（旧 merge 分支） |
| `dsh-arch` | `chore/um-arch-impl-2026-09-08` | **未含**（ahead 27）→ 需判 rescue/abandon；疑被 `dsh-arch-regen` supersede |
| `dsh-rda-admin` | `refactor/rda-admin-lazy-webserver-2026-09-08` | **未含**（ahead 1，commit `9ba8638eac`）→ **需 rescue**：UM-ADAPT 记为 "landed, push deferred Phase-C" |
| `dsh-p2-present-table` | `refactor/p2-present-table-2026-09-12` | **未含**（ahead 2）→ 内容已由 `eb9e4cf05c` 按内容收编，非 ancestry；删前需逐分支确认无遗漏 |
| `dsh-p2-present-decomp` | `refactor/p2-present-decomp-2026-09-12` | 同上（ahead 2） |
| `dsh-p2-suggest-followups` | `refactor/p2-suggest-followups-2026-09-12` | 同上 |
| `dsh-p2-uism-layer` | `refactor/p2-uism-layer-2026-09-12` | 同上（ahead 1） |
| `dsh-p2-uism-vitest` | `refactor/p2-uism-vitest-2026-09-12` | 同上（ahead 1） |

⚠ **p2-\* 五个分支不可按 ancestry 判删**：Phase-2 是把它们的内容**收编**进 `eb9e4cf05c`（cherry-pick/squash），不是 merge，所以 `merge-base --is-ancestor` 一律返回 false。删前必须逐分支比对内容差异，否则可能丢工作。

### 其余分支（非 worktree 占用）

- `backup/master-pre-sync-2026-09-08` — **保留至 merge 落地**（re-sync 的回滚点）。
- `fix/cb1b-pwsh-pty-evaluation`（ahead 2）— **活工作，勿删**：UM12 记为 Windows pwsh/console 红门的 fork 专属修法。
- `fix/lint-noop-assertion-unused-disable`（ahead 53）— 疑与 [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md) 同域，**认领那票前先看这条分支**，可能已有半成品。
- Scope 5 原写「删 3 弃分支」：`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`、`docs/cleanup-map-update` — **实测这 3 个已不存在**，该子步已自动完成。

## 2026-09-14 update

- **resync tip `a469c899bd` → `bcf4776f1d`**（本 session 3 commit：L8 doc graphs / L4 cordis inspect catalog / 僵尸包删除）。`check:ci:static` **27/18 → 31/14**，零新增失败。
- **UM12 residual 22 → 14 门**（4 翻绿）。三分类（pre-merge 基线 `65bf3cddc9` 实测 28/9）：A6 真 pre-existing / B5 merge 回归 / C7 upstream 新增门。
- **[UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 已量化**：双向有损已穷举，2 组僵尸包已删。但发现 **ui-settings-models 整包被 M1 回退到 merge-base（~30 文件）**——`tsc` 全绿、`git diff-tree --cc` 看不见。**PR 描述必须写明这条**，否则仍是在有损 merge 上声称非回归。re-port 单开 [UM-UI-SETTINGS-MODELS-RE-PORT](UM-UI-SETTINGS-MODELS-RE-PORT.md)（task，不阻塞 PR，可后补）。
- **worktree 16 个**（本 session 移除了临时的 `dsh-premerge-baseline`）。上表 2026-09-10 实况盘点仍准确；A23 unblocked。
- **仍未 push**：resync `10941436b5`、master `7f4b25d1ad` 均未 push。
- **本 session grilling 3 决策（用户 2026-09-14 拍板）**：① tsconfig = 采纳 upstream 显式 alias（**已落地** `10941436b5`，`verify-tsconfig-paths` GREEN）② 生成文档翻译 = 生成器带上 zh（决策定，实现下 session）③ **B 类 4 真回归 = 全修再 PR**（不走 tracked-shortcut；`package invariants`/`agent note format` L9/`markdown links` L7/`type equivalence` 全须 PR 前绿）→ 本票阻塞于 UM12 的 B 类子集。

## Resolution
（待落地后填：PR #N、merge sha、清理的分支清单）

### [2026-09-15 第三轮] B 类 4 门收口：2 绿 + 2 known-red（各有专属票）；PR 可推进

本 session resync 5 commit（tip `c579b809d2`，unpushed），`check:ci:static` 32/13 → **34/11**，comm 零新增。B 类 4 真回归逐门查证后收口：

| 门 | 状态 | commit / 票 |
|---|---|---|
| markdown-links | ✅ GREEN（14→0） | `e17f0fa16c`（9/14 重指向）+ `12d02c7687`（dsh-plugin-development skill 重建，按 upstream 新拓扑重指 examples retire/demo:acp 删/conv-node cookbook 删） |
| agent-note-format | ✅ GREEN（15→0） | `d4596863a6`（M2 把 15 篇 fork note 搬 rejected/ 未改 Status，搬回 proposed/；该搬移对 `git log -- <path>` 不可见，仅 `--diff-merges` 可见 = **第四类 merge 丢失**，已喂 UM15 三道门之外） |
| type-equivalence | 🅿 known-red | 全 3 DRIFT 归 [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md)：costs（fork 加在 upstream `SubagentResult` 上的活特性 G3，退 Qoder 即删）+ scopeId×2（write-never，搭车同 regen pass）。删 scopeId 触发 3-generator cascade（cordis+config+doc-graphs，doc-graphs 有 zh churn），且 costs 未解门仍红→cascade 代价>收益，已回退。本票完成前 type-equiv 全作 known-red。 |
| package-invariants | 🅿 known-red | [UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md)：74 违规（67 空 companion+7 误 peerDep）非回归（两条规则均 upstream 引入、pre-merge 不存在），与 i18n(98)/deps(74) 同类作 known-red。 |

**关键原则（用户 2026-09-15 确立）**：**upstream 的内容不改，上游最新是什么就用什么；其他（fork 自有）按需重构**。据此：① skill 重建按 upstream 新拓扑（不自己复述）② costs/scopeId 是 fork 加在 upstream core 上的 drift（additive-only 违反），退 Qoder + 删 scopeId = 恢复 upstream ③ package-invariants 是 fork 自有包适配 upstream 新规则。

**PR 状态**：B 类 2 绿 + 2 known-red（type-equiv 待 QODER-RETIRE、package-invariants 非回归），按用户决策 PR 可推进（known-red 进清单）。⚠ PR 描述须写明：① ui-settings-models 整包被 M1 回退（~30 文件，`tsc` 全绿、`--cc` 看不见，见 UM-MERGE-INTEGRITY）② type-equiv/package-invariants 作 known-red 的理由 + 各自专属票。resync tip `c579b809d2`、master tip 仍 ahead origin，均 unpushed。

**UM15 首片**（线 B）：§1（`b3a516fe98` MODES 重构）+ §5.2(c) enroll（`c579b809d2`）已落；§2/§3/§4 由 4 subagent 生成在盘 ready（subagent 环境瞬态故障已恢复），下个 session 主 session apply（详见 [UM15](UM15-durable-upstream-sync-method.md) 2026-09-15 update）。

### [2026-09-18] PR #115 MERGED via comprehensive resync merge；§五 topology corrected；p2-* + master sync deferred

**Topology re-verification (§4: 不轻信已 verified，自重跑)**：prompt §五 前提过时——local master 是 origin/master 的**严格后代**（`merge-base(origin/master, HEAD)` = `e064933dc8` = origin/master 本身；`HEAD..origin/master` = 0；甚至在 prompt 自述 tip `f0038f63e4` 处 origin/master 就已是祖先）。故 "merge origin/master → local master、5 冲突" = **空操作**（`merge-tree` 干净，结果树 = `HEAD^{tree}`）；"push local master 清 PR" = **反效果**（`merge-tree` resync→local HEAD = ~20 冲突，比当前 5 更多）。真 PR #115 冲突 = origin/master(`e064933dc8`) vs resync(`0301586bed`)，merge-base `65bf3cddc9`，5 wayfinder doc（`map.md` content + `UM-ADAPT`/`UM-flow-2026-09-08`/`UM14`/`UM16` add/add）。resync 不含 origin/master 的 evaluation（`is-ancestor` exit 1）。**须在 resync 分支上解，非 local master。**

**决策（用户 2026-09-18 选「全面 via subagent」）**：merge local master(`1ef40edaee`) 进 resync(`0301586bed`)，~21 wayfinder doc 取 theirs（local 09-09..09-17 更新更全；resync 09-08 旧快照已 supersede）。代码零冲突（仅 wayfinder doc 冲突）。

**Phase A（read-only subagent，27 calls/123K tokens/~12min，无瞬态故障）**：21/21 take-theirs，0 take-ours，0 combine，0 byte-splice。关键（§4 UM15 警告已核）：UM15 §1-§5 **代码**（scripts，commits `b3a516fe98`..`0301586bed`）在 resync git 史（auto-merge 保留，非冲突——代码零冲突）；§1-§5 **文档**（UM15 票 + map 条目）在 local 的 `>` 行（take-theirs 保留）——双保留。分析在 `/tmp/um11-conflict-analysis.md`（session 内）。

**Phase B（主 session 写，串行，可逆）**：resync 树 fetch local master → `git merge` → 21 冲突全 `wayfinder/data-agent/`（零代码冲突）→ `git checkout --theirs` + `git add`（byte-safe，map.md 13 U+FFFD 未触，无 edit_file）→ §4 验 staged == local(`1ef40edaee`) 4 关键文件（map/UM15/UM11/UM-flow）0 diff → `verify-architecture-graph` GREEN（up to date，零写）→ commit `7a20c4cb0a`（pre-commit hooks 全绿: translation-pairing/lint/whitespace/vendor-manifest）。

**PR-clearing 拓扑验证**：merge commit `7a20c4cb0a` parents = `0301586bed` + `1ef40edaee`。`is-ancestor(e064933dc8, 7a20c4cb0a)` exit 0 → origin/master 是新 resync tip 祖先 → push 后 PR #115 base 是 head 祖先 → **PR 干净可 fast-forward**。`is-ancestor(0301586bed, 7a20c4cb0a)` exit 0 → **push = fast-forward，非 force**。§4 验：`scripts/upstream-sync-record.ts` 在（§5 代码保留）；UM15.md 14 行 §5 标记（§5 文档保留）；lefthook.yml 2 处 upstream-sync record（§5b 门保留）。

**Outward（§六，用户授权 option 1「Push + merge PR + 轻后清」）**：① push resync `0301586bed..7a20c4cb0a` → origin/upstream/resync-2026-09-08（FF，pre-push 三门再次全绿: no-prod 3.79s / typecheck 37.21s / upstream-sync-record 10.44s）② PR #115 poll→MERGEABLE→`gh pr merge 115 --merge` → **origin/master = `607868e6a0`（merge commit，parents `e064933dc8`+`7a20c4cb0a`，state=MERGED，2026-09-11T01:59:47Z）**，local master 46 commit 经 PR 着陆 ③ resync remote branch 删 ✓（`- [deleted]`，留本地 resync 树给 Scope 4-6）。

**Deferred（后续）**：① **master sync**——并行 eval session 在本 session 期间把 master 从 `1ef40edaee` 推到 `f3e46b3f20`（evaluation R20 probe commit "when to wire EXPECT_NO_LEAK into CI"），与 origin/master `607868e6a0` 分叉（master ahead 1 / behind 2773），`git merge --ff-only origin/master` abort（"Not possible to fast-forward"）；按 §六 未介入 eval session（无 index.lock 时查 + 不碰）——eval session 自行后续把 `f3e46b3f20` 与 origin/master 合并/rebase（local master 46 commit 已着陆，`f3e46b3f20` 是 eval session 独立的第 47 commit，非 PR #115 scope）。② **p2-* worktree cleanup**（本票 Scope 4-6）——5 个 `refactor/p2-*`（`dsh-p2-present-table`/`dsh-p2-present-decomp`/`dsh-p2-suggest-followups`/`dsh-p2-uism-layer`/`dsh-p2-uism-vitest`）须逐内容审（Phase-2 是内容收编非 merge，`merge-base --is-ancestor` 一律 false → 不可按 ancestry 判删），单独 session。③ evaluation worktree（`.worktrees/r10-harness-goodhart`/`.worktrees/t1-exec-grader`）+ master eval session index.lock 警惕——未碰。

**本票状态**：PR merged 是核心；p2-* 后清 + master sync 未完 → **仍 open**。merge commit `7a20c4cb0a`（resync）+ `607868e6a0`（origin/master PR merge）的 message 已是持久记录（含 topology correction + 验证细节）。


## Session progress — 2026-09-11（S-p2 + S-master 分析完，apply gated on eval session）

- **S-p2**（`/tmp/sp2-analysis.md` 若持久）：5 `refactor/p2-*-2026-09-12` 分支 vs `eb9e4cf05c`（Phase-2 收编 commit）逐内容判（**非 ancestry 判**——Phase-2 是 cherry-pick/squash 收编，`git merge-base --is-ancestor <branch> eb9e4cf05c` 一律 false 即使 fully-absorbed；用 `git diff eb9e4cf05c <branch> -- <file>` 字节比对，empty = fully absorbed）：
  - **del 3**（fully absorbed，全文件字节一致 with `eb9e4cf05c`）：`refactor/p2-present-decomp-2026-09-12`（5/5）、`refactor/p2-suggest-followups-2026-09-12`（5/5）、`refactor/p2-uism-layer-2026-09-12`（10/10）。
  - **keep 2**（residual content not in `eb9e4cf05c`）：`refactor/p2-present-table-2026-09-12`（4/5 absorbed，residual `table-card.client.spec.tsx` 加 `callView: null` field 到 `makeRunningBlock()` helper——minor 但真分歧）；`refactor/p2-uism-vitest-2026-09-12`（1/6 absorbed，5 test files `apply`/`components`/`provider-form`/`store`/`welcome-notice.client.spec.*` 残留——不同 mock 模式 + `RemoteError`/`ModelsSettingsStore` 直接构造 + cordis/dsh-api-remotes type imports + fixture shapes；ui-settings-models vitest-debt clearance **未收编**，`eb9e4cf05c` scope 只含 4 presenter Plan-B migration）。
  - 关键 finding：`eb9e4cf05c` 的 4-presenter Plan-B migration scope 精确匹配 3 fully-absorbed + 1 mostly-absorbed 分支；ui-settings-models vitest work（branch 5）outside that scope，un-absorbed → 落 `R-DA-UI-SETTINGS-MODELS-VITEST-DEBT` follow-up。
  - **del apply = eval session 收定后**逐个 `git branch -D <ref>`（⚠ 先 re-confirm absorption——master tip 可能因 eval 推进已动；不可批量；per-branch commit）。
- **S-master**（`/tmp/smaster-plan.md` 若持久）：
  - merge-base = `1ef40edaee`（wayfinder 09-18 next-session doc，divergence point，在两侧）。
  - master 2 ahead = `f3e46b3f20`（eval R20 probe，1 file `wayfinder/evaluation/tickets/R20-judge-readout-probes.md` +4——**非 prompt 猜的 `…/research/harness-measurement-validity-papers.md`**）+ `fc917a55d4`（map/UM11/UM-flow record，3 files 纯插入 +23，msg body 交叉引用 `f3e46b3f20` hash——hash-stability 重要）。
  - behind 2773 = origin/master PR #115 merge `607868e6a0`（Merge `e064933dc8`+`7a20c4cb0a`；resync `7a20c4cb0a` parents `0301586bed`+`1ef40edaee`）。
  - **clean**（`git merge-tree --write-tree origin/master master` exit 0，tree `0d5480e86764…`，无冲突输出——**证伪 prompt 的 "map.md conflict" 假设**：master 4 ahead files 皆 0 touches by origin/master since merge-base；origin 21-doc take-theirs 覆盖的是 *其他* wayfinder docs，非此 4；两 ahead commits 皆纯插入 on byte-identical-to-merge-base → trivial clean 3-way）。
  - **推荐 MERGE** `origin/master` into master（merge commit，no FF since divergent；保 `f3e46b3f20`/`fc917a55d4` hash——commit msg 交叉引用，rebase 会 rewrite stale；robust to eval session 再推——no to-replay re-selection；fork integration-branch 模式 consistent with `607868e6a0` being a merge）。
  - apply = eval session 收定后：re-run `git merge-tree --write-tree origin/master master` re-confirm clean → `git merge origin/master` → 若 eval 改图景，wayfinder doc 冲突 take-theirs（09-09..09-17 local newer win）+ code auto-merge。**push 须用户明确指示**（§六）。
- handoff：`wayfinder/data-agent/prompts/next-session-2026-09-11-post-subagent-sweep.md` §五C/§五D（commit `e1a1d6049a` on master）。

### [2026-09-11 实测复核] 后清范围比票记的大：**16 个 worktree 一个都没删**；并且**多出一次 landing**

在 master 树实测（`git worktree list` + 逐分支 `git merge-base --is-ancestor <tip> origin/master`）：

**① 已并入 `origin/master`、可安全删（worktree + 分支）——5 个**
`chore/um-arch-regen-2026-09-09`（dsh-arch-regen）· `task/um-cordis-regen-2026-09-09`（dsh-cordis）· `refactor/rda-client-runtime-phase1-2026-09-09`（dsh-rda-p1）· `task/um16-root-entry-2026-09-09`（dsh-um16）· `upstream/merge-2026-09-07`（dsh-upstream-merge）。
这些是纯 ancestry 判定（`--is-ancestor` 通过），无需逐文件核 absorption。

**② 未并入、需逐文件核 absorption——7 个**（ancestry 一律 false，因 Phase-2 是 cherry-pick/squash 收编）
- `refactor/p2-present-decomp-2026-09-12`(ahead 1)、`refactor/p2-suggest-followups-2026-09-12`(1)、`refactor/p2-uism-layer-2026-09-12`(1) → **本票 S-p2 已逐文件核实 0 residual，属 del-3**
- `refactor/p2-present-table-2026-09-12`(ahead 2) → keep（1 residual）· `refactor/p2-uism-vitest-2026-09-12`(1) → keep（5 residual）→ 归 `R-DA-UI-SETTINGS-MODELS-VITEST-DEBT`
- `chore/um-arch-impl-2026-09-08` → **ahead 6**（票记「ahead 27」**已过期**），需 rescue/abandon 决定
- `refactor/rda-admin-lazy-webserver-2026-09-08`(ahead 1) → ⚠ **真·未合入工作**：`9ba8638eac`「refactor(admin): lazy webServer carrier (mirror seam 3)」相对 `origin/master` 仍差 **+102/−16**（`packages/data/admin/src/index.ts` + `tests/admin.spec.ts`）。resync 里 `packages/data/admin/src/index.ts:141` 仍是 `export const inject = ['storageDomain','credentials','webServer']`、`:238` 仍同步 `ctx.webServer.register`，`tests/admin.spec.ts:48` 仍断言 `toContain('webServer')`。
  → 这意味着 [UM-ADAPT](UM-ADAPT-per-shift-adaptive-analysis.md) 说的「seam 3/4 已落地移位」在**分支层面为假**：分析与实现都写了，但**没有合进任何主线**。若 UM-ADAPT 要以「seam 3/4 done」收口，必须先决定这条分支是落还是改写成「已分析，实现未合入」。

**③ 本票未记的一项：需要第二次 landing。**
`upstream/resync-2026-09-08` 相对 `origin/master` = **3 ahead / 1 behind**，且**远端 resync 分支已在 merge 时删除**。3 个未推提交：`c2623c84eb`（线D）· `4d4f725748`（gen-doc-graphs zh）· `5fe9b32e44`（UM-LINT-A）。本票 Resolution 停在「留本地 resync 树给 Scope 4-6」，没有覆盖这批新增内容 → **需要一次新的 push + PR（或搭 master merge 的车）**。
⚠ 这一步同时是 [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 最后一个大 open 项（「CI 上的真实 red set 至今无人见过」）的唯一解锁方式——**一次动作服务两张票**。

**④ master sync 现状**：master **ahead 20 / behind 2773** 于 `origin/master`（票记「ahead 1」已过期——eval session 期间又推了若干）。重跑 `git merge-tree --write-tree origin/master master` → **exit 0，干净**。所以推荐的 MERGE 仍是 trivially clean，但它是**在 eval 独占的 worktree 上做 git 写**，仍按 §六 gated。

**⑤ 其它可删项**（ahead=0 vs `origin/master`，票未列）：`fix/lint-noop-assertion-unused-disable`、`backup/master-pre-sync-2026-09-08`（其「合并前回滚点」用途随 PR #115 merged 而解除）。

**⑥ 过期项**：header 仍写「本票仍 blocked，不 push」（挂 UM12 + UM-MERGE-INTEGRITY）—— PR 已推已并，UM12 的 B 类硬阻塞也已解除（2 绿 + 2 known-red）。worktree 表里 `.worktrees/r10-harness-goodhart` 现在的分支是 `grilling/G10-harness-bhe-split`（非 `research/R10-...`），另有 `research/R10b-…`/`R10c-…` 两个 eval 分支——**仍勿动**。

**估算**：**2-3 session** —— 1 个 AFK session 做 del-3 + 上面①的 5 个已并入 worktree/分支清扫 + 备好 rda-admin/arch-impl 的 rescue 决定；1 个 gated session 做 master MERGE + push + 那 3 个 resync 提交的后续 PR；若 rda-admin 变成真代码工作再 +1。

### [2026-09-12] worktree 清理 + 剩余分析

**删 10**：①5（`dsh-arch-regen`/`dsh-cordis`/`dsh-rda-p1`/`dsh-um16`/`dsh-upstream-merge`，is-ancestor origin/master YES）+ ③2（`fix/lint-noop-assertion-unused-disable`/`backup/master-pre-sync-2026-09-08`，ahead=0）+ ②3 del-3（`p2-present-decomp`/`p2-suggest-followups`/`p2-uism-layer`，workflow re-confirm 0 residual vs `eb9e4cf05c`[PR #116 已 in origin/master] + worktree 仅 T/pnpm-lock 无手写，force-delete）。

**剩 8**：master + 2 eval（`.worktrees/r10`/`t1`，不碰）+ `dsh-resync`（PR 主体，保留）+ 4 需决定/keep：
- `dsh-arch`[chore/um-arch-impl-2026-09-08，ahead 6]：**代码 absorbed** via arch-regen(`038d8b51ce` in origin/master)；3 处 doc/manifest 残留→定向 rescue 后删（见 UM-ARCH ticket 2026-09-12）。
- `dsh-rda-admin`[refactor/rda-admin-lazy-webserver-2026-09-08，`9ba8638eac`]：完整 UM-ADAPT seam 3 实现，未合入→UM-ADAPT land/rewrite 决策（见 UM-ADAPT ticket 2026-09-12）。
- `dsh-p2-present-table`：1 residual（`callView:null`）→ keep（R-DA-UI-SETTINGS-MODELS-VITEST-DEBT）。
- `dsh-p2-uism-vitest`：5 test residual→ keep（同上）。

PR #115/#116 都 merged；p2-* 后清基本完成（剩 4 需决定/keep）。master sync 仍 gated。

### [2026-09-12] PR 部分已完 + 后清进展 + master-sync 阻塞根因（重要订正）

**PR 部分收口**：#116 merged（`be447fc1d0`）→ #117 merged（`c174c9a784`，7 commit = ui-settings re-port 4 + seam-3 `9ba8638eac` + merge `bdecd11840` + doc-regen `83be9786e1`）。远端 `refs/heads/upstream/resync-2026-09-08` 这次**未被自动删**，仍在 `83be9786e1` → **后续 resync 工作直接续用该分支**，不必新建（与 #115/#116 merge 后被删的情形不同，动手前 `git ls-remote` 自证）。

**worktree 后清**：`refactor/rda-admin-lazy-webserver-2026-09-08` + worktree `../dsh-rda-admin` 现**可按 ancestry 安全删** —— `git merge-base --is-ancestor 9ba8638eac origin/master` = **YES**（真 merge 入 `c174c9a784`）。这与本票警告的 5 个 `refactor/p2-*` 不同：那些是**按内容收编**，ancestry 判定不适用，仍须逐文件核 residual。删掉后存活 worktree 从 7 降到 **6** = master + 2 个 evaluation（`.worktrees/r10-harness-goodhart` / `.worktrees/t1-exec-grader`，**不碰**）+ `dsh-resync` + 2 个 p2-keep（`dsh-p2-present-table` / `dsh-p2-uism-vitest`）。

**master-sync 阻塞根因订正（此前记为「evaluation 文件冲突」，过于笼统，实测更严重）**：
- 拓扑（2026-09-12 fetch 后实测）：local master `08d0f44286` vs `origin/master` `c174c9a784` = **origin-only 2802 / local-only 80**，merge-base `1ef40edaee`；`origin/master` **不是** local master 的祖先 → **plain push 必被拒（non-FF）**。
- `git merge-tree origin/master master` → exit 1，冲突**恰好 2 文件**：`wayfinder/evaluation/map.md`（2 hunk）+ `wayfinder/evaluation/tickets/README.md`（1 hunk）。其余全部 auto-merge 干净。
- **根因不是「谁比谁新」，是 evaluation effort 的同一批工作在两条线上各做了一遍**：同 5 条 commit subject 在两侧以不同 sha 存在（`00c047956d`/`b7039860ce`/`be3c370693`/`bdc27fe572`/`259d509134` vs `bb44531577`/`219d815e75`/`30224f1942`/`d462e637d1`/`92acfcab77`），local 侧另有 4 条（G10 stack / GA-GT4 close / data scope boundary 等）。
- ⚠ **两侧都有对方没有的真内容，取任一侧都会丢东西**（已逐行核，且**排除了「只是标点全宽/半宽差异」**这一可能——标点归一化后仍差）：`origin/master` 独有 `tickets/README.md` 矩阵里的 **T12**、若干 **票链** 行、GA-GT4 行；local 独有 **R10/G10** 相关行与**重写过的「领域职责」段**（origin 版写 "evaluation 票只设计/实现 ground truth、normalization、comparator policy…"，local 版写 "evaluation effort 设计/实现 Benchmark、identity、evidence、grading、measurement 与 evaluation lifecycle…"）。
- **结论：master-sync 不是 UM11 能单方面做的 git 操作，而是需要 evaluation 域知识的 reconcile。** 本 map 的铁律「不碰 `wayfinder/evaluation/`」在此不只是纪律问题——盲选一侧会静默删除对方 effort 的票据内容。**须由 evaluation effort（或一次专门的、经用户授权的 cross-effort reconcile 任务）合并这两份，然后 master 才能 push。**

### [2026-09-12] master-sync RESOLVED via PR #119；evaluation reconcile merge 已入 origin/master

reconcile merge `96541ed9de`（parents `64c6931192` local + `4cc985d567` origin/master）由 evaluation effort 完成、零内容损失已验（7 条 grep 自检全过：`eventdef-realexec.json`/`真正的 quick win`/`后续新票均等待 G10 resolved`/`已 primary-URL-confirmed` 来自 origin 侧，`T1→R23→GA-EVAL-EXPAND`/`G13-context-evaluation-protocol`/`R8b-judge-readout` 来自 local 侧，合并后全在 HEAD 树里）。本 session 把含此 reconcile 的 local master（`5398de2399` = `be20a907cd` G12 + 一个 handoff prompt commit）经 PR #119 落回 origin/master。

**推路径**：从 `dsh-resync` worktree（HEAD=`upstream/resync-2026-09-08` ≠ master）推 master 到 `refs/heads/feat/tracker-2026-09-12`（remote SHA `5398de2399`）。`no production src on master` 门 legitimately 跳过——`scripts/verify-no-production-src-on-master.ts` 头两行 `if (branch !== 'master') process.exit(0)`，非 master HEAD 时不检查（这就是历史上 backup 分支能推的同一机制）。**不用 `--no-verify`**——走门的设计意图（`docs/da-pr-workflow.md` 明确 feat-branch + PR 是这条路径存在的原因）。

**PR #119**：`base=master@4cc985d567`, `head=5398de2399`, 87 commit, `MERGEABLE`, `mergeState=UNSTABLE`（非 required checks pending/fail——不阻合并）。**PR CI 2 红 = empirically-verified pre-existing**：
- `Dependency layout` + `Pack npm tarballs` 在 origin/master 顶点 `4cc985d567` 上 check-runs API 同样 `failure`（本分支零新增），沿 #116/#117 先例放行。
- 另需排除误判：origin/master 顶点还带 3 个 `python runtime / node24-*` 红，但那些是 **push 事件**的检查、在 PR 上从未运行；且已在 origin/master 上 pre-existing，出本次 scope（UM12 CI-real-red-set 分项）。

**合并**：`gh pr merge 119 --repo McKenzieIT/deepseek-harness-da --merge`（保 87-commit 粒度，避 `--squash` 的粒度损失——tracker commit 有审计价值）→ **origin/master 前进 `4cc985d567` → `9ffb7b3eed`（merge commit，parents `4cc985d567`+`5398de2399`，state=MERGED 2026-09-12T15:12:43Z）**。`gh pr merge` 不跑 lefthook（pre-push 只在本地 `git push` 触发），故 `2877a59cfd` 那 3 行 `scripts/translation-pairing.manifest.json` 改动不再是 push-blocker——且合并后 origin/master 上该文件与合并前 origin/master **字节相同**（reconcile 采纳 origin 版，local 版被覆盖）→ 无 protected-source 净落地。

**祖先验证全 YES**：
- `be20a907cd` (pre-drift master tip, G12) ancestor of origin/master
- `96541ed9de` (reconcile merge) ancestor of origin/master
- `5398de2399` (feat tip) ancestor of origin/master
- `2877a59cfd` (G10 data-domain core commit) ancestor of origin/master

**内容完整性**：`git diff 5398de2399 origin/master` **empty** → 新 origin/master 的树与合并前的 feat tip 字节相同(`9ffb7b3eed` 是 merge commit，其 tree = tree(5398de2399))。

**post-merge 操作**：
- local master `git merge --ff-only origin/master` FF 到 `9ffb7b3eed`（`Updating 5398de2399..9ffb7b3eed`，纯 FF 无 diff）。
- feat 分支 `refs/heads/feat/tracker-2026-09-12` @ `5398de2399` **保留**——供后续 worktree 后清阶段决定删除时机（现无 open PR 引用它）。
- 本次 tracker 更新（map.md + UM11 本条）**未 push**（沿 09-12 早前 tracker commit `a79ede0862`/`5b8fc6da5a`/`e3d7710aaa` 的同一 discipline，用户显式指示前不 push）。

**本票 master-sync 项 → DONE。** Deferred 剩：
1. **p2-\* worktree cleanup**（Scope 4-6）：2 keep-branch（`dsh-p2-present-table` 1 residual `callView:null` / `dsh-p2-uism-vitest` 5 test residual，归 R-DA-UI-SETTINGS-MODELS-VITEST-DEBT）+ 2 rescue-branch（`dsh-arch` 3 doc/manifest 残留定向 rescue / `dsh-rda-admin` 现已 `is-ancestor` origin/master YES 可安全删——PR #117 已 land seam-3）。
2. **evaluation worktree**（`.worktrees/r10-harness-goodhart` / `.worktrees/t1-exec-grader`）不碰。

**本票整体状态**：master-sync 关键 gated 项已了；p2-\* 后清仍 open（无环境阻塞，可 AFK 推进）。header `Blocked by` 现只余 UM12（后清专用）+ UM-MERGE-INTEGRITY（waiver drop 项）；已不阻 push。

### [2026-09-13] Cluster C — 4 branch 决策落地 (worktree 7→6, 1 safe-delete + 2 keep + 1 skip-missing)

Worktree/branch decisions applied per 2026-09-12 note + cluster-C briefing:

| branch / worktree | verdict | outcome |
|---|---|---|
| `refactor/rda-admin-lazy-webserver-2026-09-08` (worktree `dsh-rda-admin`) | **safe-delete** | `git merge-base --is-ancestor 9ba8638eac origin/master` = YES (via PR #117 `c174c9a784`); 748 commits behind / 0 commits ahead; `packages/data/admin/src/index.ts:141` on origin/master = `['storageDomain', 'credentials']` (webServer moved to lazy `ctx.inject(['webServer'], ...)` at :195, matches expected post-PR-#117 seam-3 state). Deleted: `git worktree remove --force /Users/mckenzie/workspace/dsh-rda-admin` (--force needed for T-type-change symlinks on shared `.claude/skills` and `snapshots/` paths, no meaningful workdir content) + `git branch -D refactor/rda-admin-lazy-webserver-2026-09-08` (was `9ba8638eac`). |
| `refactor/p2-present-table-2026-09-12` (worktree `dsh-p2-present-table`) | **keep** | Ticket-briefing expected 1 residual test file (`table-card.client.spec.tsx callView:null`); actual `git diff --stat origin/master refactor/p2-present-table-2026-09-12` = 835 files changed (branch NOT ancestor of origin/master, is-ancestor=1). Actual residual size vs briefing description mismatch; branch has diverged massively from origin/master's rebased history. Keep decision preserved (no action; residual pointer to [R-DA-UI-SETTINGS-MODELS-VITEST-DEBT](../phase-r-da-post-refactor/R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md) — if that file exists — retained). |
| `refactor/p2-uism-vitest-2026-09-12` (worktree `dsh-p2-uism-vitest`) | **keep** | Same pattern: briefing expected 5 test residuals; actual diff-stat = 838 files (not ancestor). Keep as-is, pointer to R-DA-UI-SETTINGS-MODELS-VITEST-DEBT. |
| `chore/um-arch-impl-2026-09-08` (worktree `dsh-arch`, expected: rescue+delete) | **skip (branch absent)** | `git rev-parse --verify chore/um-arch-impl-2026-09-08` = fatal "unknown revision"; `git ls-remote origin refs/heads/chore/um-arch-impl-2026-09-08` = empty. **Branch does NOT exist locally or on remote.** Worktree `dsh-arch` also absent from `git worktree list`. Rescue items partial-status: (a) `wayfinder/data-agent/research/um-arch-design-2026-09-08.md` line 63/65 still contains uncorrected content (lefthook 假前提 note + zh/en pairing note) — deferred as low-priority prose fix; (b) `scripts/translation-pairing.manifest.json` — verified `docs/architecture-graph.md` IS already in `excluded` list at line 7 (already applied by earlier session); (c) UM-ARCH ticket Session B Cross-check — UM-ARCH-architecture-diagrams-depmap.md exists at 46 lines with 2 Cross-check mentions on line 42 (partial state; not fully lost). Since branch is missing, cherry-pick impossible; hand-authored rescue for (a) is low priority. |

**Worktree list before → after:** 8 → **7** (removed `dsh-rda-admin`). `git worktree list` verified:
```
/Users/mckenzie/workspace/deepseek-harness-da                                       [master]
/Users/mckenzie/workspace/deepseek-harness-da/.worktrees/g10-evaluation-core-publish [codex/g10-evaluation-core-publish]  (evaluation, not touched)
/Users/mckenzie/workspace/deepseek-harness-da/.worktrees/r10-harness-goodhart       [grilling/G10-harness-bhe-split]     (evaluation, not touched)
/Users/mckenzie/workspace/deepseek-harness-da/.worktrees/t1-exec-grader             [feat/T1-exec-grader-impl]           (evaluation, not touched)
/Users/mckenzie/workspace/dsh-p2-present-table                                      [refactor/p2-present-table-2026-09-12]   (keep)
/Users/mckenzie/workspace/dsh-p2-uism-vitest                                        [refactor/p2-uism-vitest-2026-09-12]     (keep)
/Users/mckenzie/workspace/dsh-resync                                                [upstream/resync-2026-09-08]             (PR aftercare)
```

**Ticket status:** master-sync项 done (2026-09-12 via PR #119); rda-admin-lazy safe-delete done (2026-09-13); p2-* keeps documented; chore/um-arch-impl branch-absent + rescue items partially applied elsewhere or low-priority deferred. **Status → resolved** — no more actionable UM11 items in this cluster's scope; remaining p2-* keep entries + evaluation worktrees are pointer-only.
