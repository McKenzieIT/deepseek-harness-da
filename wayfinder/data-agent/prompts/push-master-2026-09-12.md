# SESSION PROMPT — 把 master 推上 origin（解决 `no production src on master` 门卡 `2877a59cfd`）

> 即贴即用。在 `/Users/mckenzie/workspace/deepseek-harness-da` 下另开 Claude Code 窗口。
> 唯一目标：把 local master（`be20a907cd`，含 evaluation reconcile merge + 86 local commit）推上 `origin/master`，不丢内容、不破坏历史。

---

## 0. 一句话现状

evaluation reconcile merge 已成功落地（`96541ed9de`，零内容损失已验），`origin/master` 已是其祖先（**FF-pushable**）。**唯一卡 push 的是 lefthook pre-push 门 `no production src on master`**——它因为 local-only commit `2877a59cfd` 碰了 `scripts/` 而拒推。上个 session 试 rebase 跳过它**全失败（no-op，`--rebase-merges` + 2 个 merge commit 让 sequence editor 不生效）。本 session 要换路径解。

---

## 1. 已验证事实（勿重新调查，直接用）

- **refs**（`git fetch` 后实测，2026-09-12 晚）：
  - `origin/master` = `4cc985d567b7f280b1ba56dfe6325a98c7b04c71`（fork master，含 PR #116/#117/#118）
  - local `master` = `be20a907cd5d7e7a9b2eadc1f8f4c1efa1187905`（task-orchestration-dag G12，叠在 reconcile merge 之上）
  - reconcile merge = `96541ed9de`（parents = `64c6931192`[local] + `4cc985d567`[origin]）
  - `origin/master` **是 local master 的祖先** → `git push origin master` 会 **fast-forward**（不是 non-FF）。
- **reconcile 成功已验**：`git merge-tree --write-tree origin/master master` exit 0（干净）；7 条零丢失 grep 自检全过（`eventdef-realexec.json`/`真正的 quick win`/`后续新票均等待 G10 resolved`/`已 primary-URL-confirmed` 来自 origin 侧；`T1→R23→GA-EVAL-EXPAND`/`G13-context-evaluation-protocol`/`R8b-judge-readout` 来自 local 侧，合并后全在 HEAD 树里）。
- **86 个 local-only commit，仅 1 个碰保护面**：`2877a59cfd` "wayfinder(evaluation): resolve G10 data-domain core"，碰了 `scripts/translation-pairing.manifest.json`（`PROD_SRC_PATTERN` 的 `scripts/` 分支）。其余 85 个全是 `wayfinder(...)` 文档 commit，不碰 src/bin/scripts。
- **`2877a59cfd` 的 scripts 改动是冗余的**：它把 3 行 `proposed/`→`rejected/` 改路径，而 **origin/master 已有这些 `rejected/` 路径**（别的 commit 做的同一改动）。merge 采纳了 origin 版本 → **HEAD 的 `scripts/translation-pairing.manifest.json` 与 origin/master 逐字节相同**（已 `cmp` 验）。
- **`2877a59cfd` 的 evaluation 票据内容也没进 HEAD**：HEAD 上的 `.agents/notes/.../2026-09-11-data-domain-evaluation-core.md` = **origin 侧 `02d6427370` 版本**（不是 local `2877a59cfd` 版本，merge 取了 origin）。所以 `2877a59cfd` 整个 commit 对 HEAD 最终内容的贡献 = **零**（scripts 冗余 + evaluation 内容被 origin 版覆盖）。
- **本地链有 2 个 merge commit**：`823794d667`（Merge master into grilling/G10，`2877a59cfd` 是它的第一 parent）+ `96541ed9de`（reconcile merge）。**这是 rebase 脆弱的根因**。

### 门的逻辑（`scripts/verify-no-production-src-on-master.ts`，已读全）

- 门 key 在 `git rev-parse --abbrev-ref HEAD`：`if (branch !== 'master') process.exit(0)` —— **只在 checkout 在 master 上时才检查**。从别的 worktree/分支推非 master 的 ref，门合法跳过（这就是 backup 分支能推的原因）。
- range = `origin/master..HEAD`；对范围内**每个 commit** 跑 `diff-tree` vs **该 commit 自己的 parent**，命中 `PROD_SRC_PATTERN`（`packages|apps|native|python` 下 `src|bin` 或 `scripts/` 全树）就拒。
- `2877a59cfd` 的 diff-tree vs 其 parent `810f0d363c` 显示它碰了 `scripts/` → 拒。**即使该改动已被 merge 抵消（HEAD 树 == origin），门按 commit 历史判、不按最终树判，所以仍拒。**

---

## 2. 上个 session 的失败记录（勿重蹈）

- **`git rebase --rebase-merges origin/master` + sequence editor 标 `2877a59cfd` 为 edit**：3 次尝试**全 no-op**，HEAD 没变。原因疑似 `--rebase-merges` 的 todo 格式（含 `label`/`reset`/`merge` 行）+ 2 个 merge commit 让 `sed` 改第 N 行的 sequence editor 不生效；`GIT_EDITOR=true` 也可能让 edit 不停。**不要再用这条路径**，除非你能确认 sequence editor 真的改了 todo 且 rebase 真停下。
- **`find packages -type d -name lib -prune -exec rm -rf {} +`**：**这是我自找的坑**——删了根 `lib/types/*.js`（tsdown 的 entry 来源），而根 `tsconfig.host.json` 是 `noEmit:true` 不重建它们，于是 `build:lib:host` 的 tsdown 步骤 `Cannot find entry lib/types/{index,invariant,startup}.js` 报错。**用 `git reset --hard HEAD` + `pnpm install` 复原了**，树回到提交状态。**本 session 切勿 `rm -rf lib`**；要清 stale 用 `node tsc -b --force` 重建，不删 lib。

---

## 3. 推荐解法（按干净度排序，前一个不行才退后一个）

### 解法 A（推荐）：feat 分支 + PR merge（门的**设计意图**就是这条）

门存在**就是为了强制 feat-branch + PR 路径**（见它自己的报错 + `docs/da-pr-workflow.md`）。GitHub 的 PR merge（merge commit 或 squash）**不跑 lefthook pre-push**（pre-push 只在本地 `git push` 触发）。所以：

```sh
cd /Users/mckenzie/workspace/deepseek-harness-da
export PATH="/usr/local/bin:$PATH"; export CI=true   # CI=true 让 pnpm install 不要求 TTY 确认
# 1. 把 local master 推成一个 feat 分支（从 dsh-resync worktree 推，HEAD≠master 故门跳过——已验可行）
cd /Users/mckenzie/workspace/dsh-resync
git push origin master:refs/heads/feat/tracker-2026-09-12
# 2. 开 PR：feat/tracker-2026-09-12 → master
gh pr create --base master --head feat/tracker-2026-09-12 --title "wayfinder tracker 2026-09-12 + evaluation reconcile merge" --body-file <(cat <<'BODY'
Lands 86 local-only commits including the evaluation fork reconcile merge (96541ed9de, zero content loss verified) and task-orchestration-dag G12 work.

The one commit that trips `no production src on master` (2877a59cfd) touches scripts/translation-pairing.manifest.json with a 3-line proposed→rejected rename that origin already has — redundant, and the merge adopted origin's version so HEAD's tree is byte-identical to origin on that file. No protected-source change lands on master via this PR's tree.

Merging via PR (not git push master) per the repo's da-pr-workflow rule.
BODY
)
# 3. 等 CI（PR 上会跑；已知 2 个 pre-existing 红：Dependency layout + Pack npm tarballs，#116/#117 同一对先例放行）
# 4. merge PR（GitHub merge，不跑 lefthook）
gh pr merge <N> --merge    # 或 --squash
```

**优点**：不改写历史、零风险、正是门要的路径、86 个 commit 的粒度全保留（若用 `--merge`）。**代价**：origin/master 多一个 merge commit；若用 `--squash` 则丢粒度（不推荐，wayfinder tracker commit 有审计价值）。

**注意**：PR 的 head 是 local master 全线（86 commit + 2 merge），base 是 origin/master。`merge-tree` 已验干净（exit 0），故 PR **无冲突**。

### 解法 B（若 A 不可行）：rebase 把 `2877a59cfd` 的 scripts touch 去掉

让 `2877a59cfd` 不再碰 `scripts/`，这样门就放行。**前提**：保留它其余 14 个 evaluation 文件改动（虽然 merge 取了 origin 版，但 local 链里这些内容仍在；drop 整个 commit 会让 `823794d667` 这个 merge 的 parent 断）。

最稳工具是 **`git filter-branch --index-filter`**（`filter-repo` 本机未装），只对 `2877a59cfd` 这一个 commit 把 `scripts/translation-pairing.manifest.json` 还原到其 parent 版本：

```sh
# 先建安全网（已有 backup/master-pre-rebase-2026-09-12 = be20a907cd）
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --index-filter '
  if [ "$GIT_COMMIT" = "2877a59cfd471f5fbea3e6406f88a2f563224d53" ]; then
    git rm --cached --ignore-unmatch scripts/translation-pairing.manifest.json
    git checkout 810f0d363c -- scripts/translation-pairing.manifest.json 2>/dev/null
  fi
' 810f0d363c..HEAD
```

⚠ **filter-branch 跨 2 个 merge commit 有已知坑**，可能产出畸形 history。**做完必须**：`git fsck --full` + 全量 `check:ci:static` + 核 `2877a59cfd` 的新 SHA 的 diff-tree 不再含 scripts/ + 核 HEAD 树内容与 rebase 前一致（`git diff backup/master-pre-rebase-2026-09-12 HEAD -- wayfinder/ .agents/` 应只动 scripts/translation-pairing.manifest.json 一文件，且变成 == origin）。

**rebase 后核验**（用户已拍板「全量 check:ci:static 再 push」）：
```sh
npm run check:ci:static   # 须 ~37 passed/11 failed，零新增红
git push --dry-run origin master   # 须三门全绿（no-prod/typecheck/upstream-sync-record）
git push origin master             # FF
```

### 解法 C（兜底）：只更新备份分支，master 暂不推 origin

若 A/B 都受阻：`git push origin master:refs/heads/backup/master-tracker-2026-09-12`（从 dsh-resync worktree 推，已验可行，更新到当前 `be20a907cd`）。master 留 local，origin/master 保持 `4cc985d567`。**代价**：UM12「CI 真实 red set」等项继续挂、后续 tracker 只能堆备份分支。

---

## 4. 铁律

1. **只用 mcp__local__\***（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；sh 非 bash（无 `PIPESTATUS`/数组/进程替换 `< <()`，取退出码用临时文件 + `$?`）；`export PATH="/usr/local/bin:$PATH"` + `export CI=true`（node v24 + pnpm 不要求 TTY）。
2. **commit message 用 `-F` 文件**，不用 `-m`。
3. **绝不 `rm -rf lib`**（上个 session 的坑）；清 stale 用 `tsc -b --force`。
4. **改源码后跑全量 `check:ci:static`**（~5min），不只跑针对门——上 session 铁律第二次立功（seam 3 doc-regen stale）。
5. **不碰 `wayfinder/evaluation/`**（已由 reconcile session 解决，勿再动）。
6. **`git add` 只显式路径**，不 `git add -A`（task-orchestration-dag effort 可能有未提交改动）。
7. **推非 master ref 从 `dsh-resync` worktree 推**（HEAD≠master → `no production src on master` 门合法跳过；已验 backup 分支能推）。**推 master 本身必被该门拒**（除非解法 B 让 `2877a59cfd` 不再碰 scripts/）。
8. **安全网**：`backup/master-pre-rebase-2026-09-12` = `be20a907cd`（local ref，rebase/出错可 `git reset --hard` 回滚到此）。

---

## 5. 本机已就位的两个本地修复（不入 git，别误以为是回归）

1. **`packages/query/query-maxcompute/tests/per-scope-maxc-config.spec.ts`**（`.gitignore:65` 明确「keep local, CI clean」）：merge 后上游给 `CredentialProvider` 加了 5 个 record 方法（`readRecord`/`describeRecord`/`listRecords`/`modifyRecord`/`deleteRecord`），这个本地测试的 mirror class 没补 → tsc 红。已照 sibling `per-scope-data-source.spec.ts:71-77` 抄了那 5 行 `override`，**tsc 0 错、vitest 13/13**。它 gitignored → **不入 git、不随 push 走、CI 不查**（设计如此）。若本地 tsc 又报这个错，重新补上即可。
2. **`CI=true`** 环境变量让 pnpm install 不在非 TTY 要求确认（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NOTTY`）。这不是 repo 改动，跑 pnpm 前设上。

---

## 6. 成功判据

- 解法 A：PR merged，`origin/master` 前进到含 `be20a907cd` 内容的 merge commit，`git fetch && git log origin/master` 可见 reconcile merge + G12；`git merge-base --is-ancestor be20a907cd origin/master` 或其 PR-merge 后裔 = YES。
- 解法 B：`git push origin master` 成功（FF，三门绿），`origin/master` = rebase 后的新 master tip；全量 `check:ci:static` 零新增红。
- 任一解法后：把状态报回，更新 `wayfinder/data-agent/map.md` + 相关票（UM11 的 master-sync 项标 done）。
