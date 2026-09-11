# UM11 — PR + merge + 后清理分支

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: ~~UM10~~（resolved）+ **UM12（仍开，14 门 residual；本 session 27/18→31/14）** + **[UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)（已量化：双向有损已穷举、2 组僵尸已删；但 ui-settings-models 整包回退须入 PR 描述）** → 本票**仍 blocked**，不 push
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
