# Next-session prompt — 用 workflow 解 upstream-merge 的存量票（体量进 workflow，决策留人）

> 承接 `next-session-2026-09-11-post-umlintA-gate-green.md`。上一 session 收口了 UM-LINT 整条线（gate 首次 **0 errors / 0 warnings**）并对整期做了全量重盘（master `411b7090c4`）。本 prompt 给的是**下一步怎么用 workflow 批量推进**：三个现成 `.wf.js` 脚本 + 一条明确的「什么能自动化、什么绝不能」的界线。

---

## 一、先读这条：workflow 在本仓的正确用法

### 调用方式（有个必踩的坑）

house idiom 在 `wayfinder/data-agent/workflows/*.wf.js`，调用**必须 inline**：

```
mcp__local__read_file  wayfinder/data-agent/workflows/<name>.wf.js   → 拿到全文
Workflow({ script: <全文>, args: { mode: 'analyze' } })
```

**不要用 `Workflow({ scriptPath: 'wayfinder/data-agent/workflows/...' })`。** 脚本在用户机器上，而 Workflow 在 pod 侧执行，`scriptPath` 解析不到那个路径。现有 `um-resync-parallel-sweep.wf.js` 的 `whenToUse` 里写的 `Workflow({scriptPath})` 是**过期建议**，按 inline 走。

### 界线：体量进 workflow，决策留人

这一期真正卡住的从来不是工作量，是**判断**。所以：

| 适合 workflow | 绝不进 workflow |
|---|---|
| 67 个包 × 4 处编辑（互不相交） | 「删 `scopeId` 值不值」这种产品取舍 |
| 21 个文件的三方合并**提案 + 对抗评审** | 「98 条 i18n 修还是判 known-red」的策略裁决 |
| 12 个分支的 absorption 逐文件核验 | `git branch -D` / `worktree remove` 的实际执行 |
| 把 98/75 条违规**按类型分桶**供人裁决 | master-sync merge、push |

判断依据很简单：**如果做错了需要人来发现，就别交给 workflow 去做决定**；让它把材料铺开，人来拍。

### rule 2/3 的精确化（本次新增证据）

house rule 2/3 原文是「subagent 不跑 build/gen/commit/改 repo——只读分析 + /tmp patch，主 session apply」。但 eval-perpetual prompt 又说 resync 树无 eval → 「并行 subagent + apply 全安全」。两者的正确合成是：

- **可以**：workflow agent 在 resync 树上编辑**互不相交**的源文件（无 eval，无冲突）。
- **绝对不可以**：workflow agent 跑 **build / gen-\* / verify-\* / check:ci:\* / lint / 任何 git 写**。

后半条有硬证据：2026-09-11 复核时，一个 subagent 报 `verify-config-catalog` **绿**，实际是红——它的采样窗口正好落在主 session 为估算而临时 `gen-config-catalog` 又还原的那几十秒里。**同一棵树上并发跑门，任何单点读数都可能是别人半路状态的快照。** 门和 commit 归主 session，跑一次，串行。

三个脚本的 `IRON` 前言里都写了这条，别删。

---

## 二、三个现成脚本

### 1. `um-invariant-companion-sweep.wf.js` → [UM-INVARIANT-COMPANION-CLEANUP](../tickets/phase-upstream-merge/UM-INVARIANT-COMPANION-CLEANUP.md)

**最适合 workflow 的一张票**：67 个包，每包 4 处编辑（约 268 处），每包一个独立目录 → 天然不冲突。

- 结构：`Discover`（1 个 agent 从源码枚举，**不跑门**）→ `Retire`（按 ~6 包一批并行）→ `Cross-check`（独立 agent 重新推导残留并找漏）
- 先 `args: { mode: 'analyze' }` 看计划（patch 落 /tmp），确认无误再 `args: { mode: 'apply' }`
- 脚本已内置那两个坑：① 每包 4 处不是 2 处（漏了 `files[]` 的 `lib/invariant.js` 只会换一条红，配对规则在 `scripts/package-invariants.ts:120-126`）；② **peerDep 规则是条件性的**——103 个包声明它，只有 7 个违规，批量 strip 会破 96 个正确声明
- 跑完**主 session** 串行做：`verify-package-invariants`（期望 74 → 7）→ `verify-built-package-invariants` → `tsc -b` 两面 → `lint:contracts-ready` 必须仍 0/0 → 各 generator `--check` → commit

### 2. `um-ui-settings-models-report.wf.js` → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)

**语义合并，所以设计成 analyze-only**——它只写 /tmp 提案，永不改仓库。

- 结构：`Classify`（按 merge-base `141eb6fef8` / upstream `c389f96bf3` / HEAD 三方分桶）→ `Propose`（每个 diverged 文件一个 agent 出合并提案）→ `Challenge`（每个提案一个对抗评审，默认判 refuted）
- 实测规模：31 个文件 = 21 个三方合并 + 6 个 adopt-upstream + 2 个 restore + 2 个 delete
- 脚本已内置三个坑：
  - `src/invariant.ts` + `tests/invariant.client.spec.ts` 被 **UM-INVARIANT 那张票拥有**（upstream 已删且在 67 之列）→ **先跑脚本 1**，否则这张票会重新论证甚至错误地把它们恢复回来
  - `package.json` 同时是 UM-INVARIANT 的 7 个 peerDep 违规之一
  - ⚠ `tests/components.client.spec.tsx` 与 `tests/provider-form.client.spec.tsx` 在 `5fe9b32e44` 里**刚被删掉 `ctx as never`**（那个 cast 本来就是为绕开已根治的 Context 冲突才写的）。**朴素三方合并会把它加回来** → 脚本要求提案显式声明没有重新引入，评审阶段视为自动 refute

### 3. `um11-branch-sweep-verify.wf.js` → [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md)

**全程 read-only**——它产出 delete/keep 矩阵，绝不真删。

- 结构：`Enumerate`（每个 worktree/分支的 ancestry 判定）→ `Absorption`（每个非祖先分支一个 agent 逐文件核）→ `Matrix`（合成有序矩阵 + 给人的命令清单）
- 脚本已内置四个坑：
  - **ancestry 不够**：Phase-2 是 cherry-pick/squash 收编，完全吸收的分支照样报「非祖先」
  - **禁止全树 `git diff eb9e4cf05c <branch>`**：master 在 eval 下前移会给出「117 files changed」的假阴性；必须按分支自身 merge-base 取 touched 文件再逐个比
  - **`git worktree remove` 必须先于 `git branch -D`**：分支被 worktree 占用时 `branch -D` 会**直接拒绝**（旧 prompt 说它是「纯 ref op」，是错的）
  - `.worktrees/*` 属 eval，只报不动
- 特判 `refactor/rda-admin-lazy-webserver-2026-09-08`：脚本会直接查 HEAD 是否仍 eager inject `webServer`。若仍是 → 这条分支是**真·未合入工作**，且 [UM-ADAPT](../tickets/phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md) 的「seam 3/4 已落地」在分支层面为假，**别在那个前提上关票**

---

## 三、不要为它们写 workflow 的票

- **[UM-QODER-SUBAGENT-RETIRE](../tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md)**：Qoder 半已拍板可 AFK，但 **scopeId 半的前提被证伪**（3 个 writer + 6 处 live reader，删它破 tsc 且移除 per-tenant linker 隔离，注释直指 tenant-leak #19）。**先拆票重新 grilling**，别让 workflow 顺手做掉一个产品决策。
- **[UM-C-GATES-UPSTREAM-NEW](../tickets/phase-upstream-merge/UM-C-GATES-UPSTREAM-NEW.md)**：98 条 i18n + 75 条 deps 需要先定「修 / 豁免 / known-red」。分桶材料票里已备好；**要的是裁决，不是并行**。裁完若选「修」，那时再照脚本 1 的形状写一个。
- **[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md)**：伞票，剩的是重基线 + 读 PR #115 的 CI + 一条基线裁决。单 agent 足够。
- **[UM-LINT-B](../tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md)**：56 个 unmatched 文件的处置是策略题（其中 6 个属 eval-cli，改它要跟永续 eval 协调）。
- **master-sync + push**：环境闸门 + 需用户明确授权。**永久 defer** 的是「等 eval 收定」这个前提，不是这件事本身——`git merge-tree` 重跑仍 exit 0，真做只是短短一次 git 写。

---

## 四、状态（勿重做）

- **resync 树** `/Users/mckenzie/workspace/dsh-resync`，tip **`5fe9b32e44`**，工作树干净，**无 eval** → workflow 并行 + apply 安全。相对 `origin/master` 有 **3 个未推提交**：`c2623c84eb`（线D）· `4d4f725748`（zh emission）· `5fe9b32e44`（UM-LINT-A）。
- **master 树** `/Users/mckenzie/workspace/deepseek-harness-da`，**eval 永续**、tip 持续前移（上一 session 落了 `411b7090c4`）。相对 `origin/master` **ahead 20 / behind 2773**，`git merge-tree` **exit 0 干净**。任何 git 写前核 `[ -f .git/index.lock ]`。
- **PR #115 已 merged**：`origin/master` = `607868e6a0`。远端 resync 分支已在 merge 时删除 → 那 3 个提交需**新分支 push + PR**。这一步同时是 UM12 最后一个大 open 项（「CI 上真实 red set 无人见过」）的唯一解锁方式，**一次动作服务两张票**。
- **门实测**：`check:ci:static` = **37 passed / 11 failed**。`lint:contracts-ready` **0 errors / 0 warnings**。`application entrypoints` 已绿（线D），`config catalog` 新入红（`docs/config-catalog.md` stale，regen 仅差 1 行但有 zh 配对）。
- **票状态**：33 张 = 12 open + 14 resolved + 6 archived + 1 folded。
- **⚠ 票里的日期标签 `2026-09-14/15/17/18` 是会话序号不是真实日期**（git 作者日期核过，全是 09-10/11）。读票按文件内位置与 sha 链（`0301586bed → 7a20c4cb0a → c2623c84eb → 4d4f725748 → 5fe9b32e44`）排，别按标题日期。

---

## 五、⚠ 铁律

- `mcp__local__*` only（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。**workflow agent 需先 `ToolSearch` 加载 `mcp__local__*` 的 schema** ——三个脚本的 `IRON` 前言里都写了，别删。
- `mcp__local__grep` 不可靠 → 用 `mcp__local__bash` 里的 `grep -rEn`；`rg` / `grep -P` / `cat -A` 不存在（BSD 工具链）。
- node v24 强制：`export PATH="/usr/local/bin:$PATH"`（v24.15.0；v25 crash tsdown）。
- shell 是 `sh` 非 bash（无 `<(...)`）。**commit message 用 `mcp__local__write_file` 写文件再 `git commit -F`**——`node -e '...'` 里只要有一个撇号就会截断 sh 的单引号串（上一 session 踩过）。
- 多行/复杂改动优先**带断言的 node byte-splice**（断言 anchor 出现次数 == 1；按行号从底向上改）。
- `map.md` 含 U+FFFD（13 处）→ **只能 byte-splice**（Buffer + `indexOf` + `concat`，全程不把整文件转 string，并断言 U+FFFD 计数前后不变），禁 `edit_file`；ticket `.md` 追加用 `cat >> ` + quoted heredoc（`<<'EOF'`）。
- master 上 **`git add` 只用显式路径，绝不 `git add -A`** —— 那里有 `wayfinder/evaluation/` 的未跟踪文件不是你的。
- 不碰 `.worktrees/`（eval）+ `wayfinder/evaluation/`。
- **不 push**（除用户明确指示）。
- 改了源码就核生成文档：`gen-architecture-graph` / `gen-module-graph` / `gen-doc-graphs` / `gen-cordis-catalog` / `gen-config-catalog` 的 `--check`，加 `verify-md-links`。上一 session 因 `tool-compute` 删一个 type-only import 就让 `docs/architecture-graph.md` 变 stale。
- `verify-translation-pairing` 全量仍 EXIT 1（A 类 pre-existing 翻译债，归 parallel-dev-cleanup/R1），不是你弄坏的；`--write` 绝不裸跑、绝不 `--all`。

---

## 六、建议顺序与估算

1. **脚本 1**（UM-INVARIANT，analyze → apply）——最大体量、最干净的并行收益。~1-2 session。
2. **脚本 3**（UM11 矩阵，read-only）——便宜，且产出的是「哪些能删」这个一直没人敢下手的答案。之后的删除是人手串行、一分支一 commit。~1 session（+1 个 gated session 做 master merge / push）。
3. **脚本 2**（UI-SETTINGS，analyze-only）——**必须在脚本 1 之后**，否则重新论证 `invariant.ts`。~2-3 session。
4. 其余按 [map](../map.md) 的 2026-09-11 重盘条目走。

整期估算（分两档，避免同一份质量重复计）：**档一「已落地 + 基线成文」≈ 6-11 session**；**档二「全门真绿 + 所有票关闭」≈ 17-29 session**。唯一真被环境卡住的只有 master-sync 与 push，且两者**共用一个 gated session**。

---

## 七、上一次 workflow 运行本身的两条教训(已回灌进脚本)

2026-09-11 跑过一次 `um-ticket-workflow-inputs`(8 agent / 925k subagent token / 45 分钟)来给这些脚本备输入。它成功证伪了脚本 2 的一个假设(见下),但也暴露两个**工具层面的坑**,两条都已内置进三个脚本:

### 1. discovery 的 schema 要小,别让一个 agent 扛全部细节

那次有一个 agent **失败**:`agent({schema}): subagent completed without calling StructuredOutput (after 2 in-conversation nudges)`。原因是它被要求在**一个**结构化回答里给出 67 个包 × 4 个 flag,预算烧光了还没来得及调 StructuredOutput。

→ 修法(已落 `um-invariant-companion-sweep.wf.js`):**Discover 只回包目录名**(便宜的一遍 grep),那 4 项 per-file 检查**下沉到各批次 agent**——它们本来就要打开那些文件去改。**通用原则:discovery 回"有哪些",item agent 回"这一个怎么做"。**

### 2. workflow 的产出必须放在 return 值里,不能只留在 transcript

那次运行的完整结果(143k 字符)写在 pod 侧的 `/tmp/claude-1001/.../tasks/<id>.output`,而 `mcp__local__*` 映射的是**用户机器**,built-in Read 又被 BLOCK ——**主 session 读不到自己 workflow 的完整输出**,只能拿到通知里被截断的那一段。UM11 与 UM-C-GATES 两份清单、以及脚本形状评审就此丢了。

→ 所以:**凡是主 session 事后要用的东西,必须走 workflow 的 `return` 值,或者由 agent 用 `mcp__local__write_file` 写到用户机器的 `/tmp`**(三个脚本都要求 agent 把 deliverable 写 `/tmp/um-*.md`,正是为此)。**别指望能回头读 transcript。**

### 它证伪的那个假设

我原以为 UI-SETTINGS 的 31 个文件可以逐文件独立扇出。**错了**:`store.ts` 必须先补上 `ProviderDirectoryEntry`,`slot-contract.ts` 才能恢复(后者 import 前者);`README.md` 的 Extension-slots 段必须与 `slot-contract.ts` **同 commit**(否则 `verify-md-links` 红);`index.ts` 要等 `operations.ts` + `slot-contract.ts`。
→ 提案仍可并行(只写 /tmp),但 **apply 有拓扑序**;脚本 2 现在把 coupling 喂给每个 proposer,并在返回值里给出 `applyOrder`。完整清单见 [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md) 的 2026-09-11 节。
