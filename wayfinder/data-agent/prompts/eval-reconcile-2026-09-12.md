# SESSION PROMPT — 调和 evaluation 分叉（使 local master 可干净合并 origin/master）

> 即贴即用。在 `/Users/mckenzie/workspace/deepseek-harness-da` 下另开一个 Claude Code 窗口。
> 唯一任务：解决一次 `git merge origin/master` 的冲突，使 master 可干净 merge origin/master。
> 不 push、不碰 `wayfinder/data-agent/`、不碰任何 evaluation 之外的决策。

---

## 0. 目标

在 local `master` 上做一次 `git merge origin/master`，解决其冲突，得到一个**干净、可 commit** 的 merge，**两侧 evaluation 内容零丢失**。merge commit 留在本地，把 SHA 报回去；**不 push**。

---

## 1. 事实（已由 data-agent session 2026-09-12 实测，勿重新调查根因）

- refs（`git fetch` 后实测）：
  - `origin/master` = `4cc985d567b7f280b1ba56dfe6325a98c7b04c71`
  - local `master` = `fb1d298de9b485f3d204da248f04c9bfa460ab60`（data-agent session 的 tracker 提交已在此；后续若有新 tracker 提交，master 会前进——见 §6.1 复核）
  - merge-base = `1ef40edaeee41d6615a5b2ea060a9cbeda43cb73`
  - origin-only **2802** / local-only **81**；`origin/master` **不是** local master 祖先 → 这次 merge 是真合并，不是 FF。

- **根因**：evaluation effort 的同一批工作在 origin/master 与 local master **两侧各跑了一遍**，产生**相同 commit subject、不同 SHA** 的提交（如 `resolve G10 data-domain core` = origin `02d6427370` / local `2877a59cfd`）。结果：同一些文件在两侧内容分叉。

- **merge 冲突恰好 5 个文件**（`git merge origin/master` 实测；**已逐个核实，不再是 data-agent session 初版 prompt 误记的「2 个」**）：
  1. `wayfinder/evaluation/map.md` — content 冲突，**3 个 hunk**
  2. `wayfinder/evaluation/tickets/README.md` — content 冲突，**1 个 hunk**
  3. `.agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.md` — add/add 冲突，**1 个 hunk**（仅 line ~64-66 两行差异）
  4. `.agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.zh.md` — add/add，**1 hunk**（同上的中文镜像）
  5. `.agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.i18n.yaml` — add/add，**pair-hash 元数据**，由 §3 的 `merge-translation-pairing` driver 处理，**通常无需手解**

  另：`scripts/translation-pairing.manifest.json` 与 `wayfinder/data-agent/map.md` 在 merge 中 **auto-merge 成功**（前者 origin 已有相同内容，后者 data-agent 内容与 evaluation 不重叠）——**不要动这两个**。

---

## 2. 铁律（全程遵守）

1. **只用 mcp__local__\* 工具**（bash / read_file / write_file / edit_file / grep / glob）。built-in Read/Write/Edit/Bash/Grep/Glob 在本环境 BLOCKED。
2. **sh，不要 bash**：不要 `PIPESTATUS`/数组；取退出码用临时文件 + `$?`。`export PATH="/usr/local/bin:$PATH"`（node v24）。
3. **commit message 用 `-F` 文件**，不要 `-m`。
4. **未经授权绝不 push**：不 `git push`、不强推、不删远程分支。只在本地完成 merge commit，把 SHA 报回去。
5. **绝不触碰 `wayfinder/data-agent/` 下任何文件**。只允许操作 §1 列的 5 个文件（外加 merge 自动产生的 index 变更）。
6. **取并集，不选边**：两侧 distinct 内容都要保留。对重叠且各自改写的区域，组合而非覆盖。
7. **遇真矛盾就停**：若某处分歧是语义上不可共存的对立（不是「各侧各有补充」），STOP，贴原文报告，等人工裁决。**本 session 预期的真矛盾只有 1 处**（§4 决策 A），其余皆机械可解。
8. **U+FFFD 防雷**：`wayfinder/evaluation/map.md` 类文件历史上可能含 U+FFFD mojibake。编辑前先 `node -e '...'` 数 occurrence（见 §6.2）。若 >0，**禁用 edit_file / `cat >>`**，改用 §6.4 字节级 splice，每步带计数断言。其余 4 个文件先查（预期 0，可直接 edit_file）。

---

## 3. 方法：用 git 真合并，看 conflict markers，逐 hunk 解

**不要** cherry-pick / rebase 对齐 commit（subject 同、内容异，死路）。**直接 `git merge`，让 git 的 3-way merge 与自定义 driver 工作，只手解剩下的真冲突。**

`scripts/translation-pairing.manifest.json` 在 `.gitattributes` 里挂了自定义 merge driver `merge-translation-pairing`。**在 Node 可用的环境里**它会自动处理 `.i18n.yaml` 的 pair-hash 冲突（data-agent session 在一个无 node 的临时 worktree 里测时它降级成文本冲突 + 报 `runtime is unavailable`——**本 session 在主 worktree 跑、node 可用，应正常工作**）。若它仍报错，按其提示 `pnpm run resolve-translation-pairing-conflicts`。

---

## 4. 需要你做的域决策（仅 1 个真矛盾 + 2 个机械补回）

### 决策 A（真矛盾，需你判断）—— `.agents/notes/.../2026-09-11-data-domain-evaluation-core.md` line ~64-66

两侧「Relationship to active …」段都引用「execution grader」，但指向**不同文件**：

- **origin 版**链接到 `../../../../wayfinder/evaluation/tickets/G1-exec-grader-seam.md`（= ticket G1，**Status: resolved v3**），标题写「Relationship to active **decisions** and Agent Notes」。
- **local 版**链接到 `../../proposed/testing/2026-09-07-execution-grader-seam.md`（= 一个 **proposed** 分析 note，是 ticket G1 的分析前身），标题写「Relationship to active Agent Notes」。

**data-agent session 已查明**：那个 proposed note 正文引用的是 data-agent 的 `P11b/P11c`，是 G1 的分析前身；ticket G1 已 resolved v3。**倾向取 origin 版**（指向 resolved ticket，更权威；标题更完整）。但**这是 evaluation 域的引用规范决策**——请你核证后定：若 evaluation 的约定是「architecture note 引用 proposed note 而非 ticket」，则取 local。`.zh.md` 是同段的中文镜像，取与 `.md` **同一侧**。

> 取定后，`.i18n.yaml` 的 pair-hash 用 §3 的 driver 或 `verify-translation-pairing --write` 重算即可，**不要手编 hash**。

### 机械补回 1 —— `wayfinder/evaluation/map.md` hunk 1（line ~140-156，R/G/T 票引大段）

两侧都列了 R1–R27 / G1–G15 / T1–T15，但：

- **origin 独有**（local 删了的理据/限定词，补回）：R8 的 `**resolved**` 加粗、R14 的 `前置已改…eventdef-realexec.json n=95/35 真值受 event anchor 污染`、R20 的 `原 R20-radar-redundancy; R8 重切为四探针`、G2 的 `题面须加 R8 的边界`、G8 的 `原 G8-pairwise-judge`、38-files 行里 R8/R8b/R8c/R20/G8 的加粗。
- **local 独有**（origin 没的，保留）：G13/G14/G15 的 markdown 链接 `[G13](tickets/...)` 等（origin 也有 G13/G14/G15 文字但**无链接**——取 local 的链接版）。
- ⚠ **G11 顺序差**：origin 把 `G11-irt-sampler` 放在 `(+G12-exec-orm-verifier 条件)` **之前**；local 放在 G15 **之后**。两侧都含 G11，只是位置不同。**取 origin 的顺序**（G11 紧跟 G10，G12 条件注在前更自然），但 G13/G14/G15 用 local 的链接版追加在其后。

**合并 = origin 的理据/限定词 + local 的 G13-G15 链接 + origin 的 G11 顺序**。逐行对照 conflict marker 做，不要整段替换。

### 机械补回 2 —— `wayfinder/evaluation/map.md` hunk 2（line ~171-183，R14/R20/R8c/R8b/R4 的六条 item 列表）

- origin 是 local 的**超集**（origin 保留了「真正的 quick win」「认读」「G8 的决策 1/3/4」「不能直接当真值」「2026-09-10」等 local 删掉的细节）。**取 origin 整段**。

### 机械补回 3 —— `wayfinder/evaluation/map.md` hunk 3（line ~189-193，AFK 级联行）

两侧编辑落在**不重叠子区**，可机械拼接（data-agent session 字节级实测过 line 170 的共享前缀逐字节一致；此 hunk 同理）：

- 共享前缀（两侧一致）：`**AFK 级联**:**[T11]→[T1]→[T13]→[T9]→[T14]→[T15]→[T12]→[R25]**；`
- **local 在前缀后插入**级联边：`T1→R23→GA-EVAL-EXPAND→{R12/R17/G9}；G3→T3→R15；G4→T4+T4b→R16；G5→T5+T5b；G6→P1→T6+R18；R20(b,c)→G8→T7；G11→T10；`
- 共享中段（两侧一致）：`G13→R26，G13+G14→R27，G15+R25+T5/T5b→R21。`
- **origin 在中段后追加**散文尾：`方向 1 的 T11/T1 仍可在 G10 收尾前先做，后续新票均等待 G10 resolved。`

⇒ 合并行 = 共享前缀 + local 级联边 + 共享中段 + origin 散文尾。

> origin 散文尾里「后续新票均等待 G10 resolved」**部分过时**（G10 两侧都 resolved）。**保留不动**（删除=内容损失），在 §8 报告里标此 staleness。

### 机械补回 4 —— `wayfinder/evaluation/tickets/README.md` hunk（row 8）

- local 用 markdown 链接（`[R8](R8-pairwise-judge-papers.md)` 等），与其余行一致；origin 用加粗裸名。**取 local 整行**。

---

## 5. 不在这 5 个文件里的冲突

**没有。** data-agent session 已实测 `git diff --name-only --diff-filter=U` 恰好这 5 个。若你跑出来**不止 5 个**或有 `wayfinder/data-agent/` 文件 → STOP（§6.1 会复核）。

---

## 6. 执行步骤

### 6.1 复核前提

```sh
cd /Users/mckenzie/workspace/deepseek-harness-da
export PATH="/usr/local/bin:$PATH"
git fetch origin --quiet
echo "origin/master = $(git rev-parse origin/master)"   # 须 = 4cc985d567...
echo "master       = $(git rev-parse master)"            # 须 = fb1d298de9... 或其后续
test "$(git rev-parse origin/master)" = "4cc985d567b7f280b1ba56dfe6325a98c7b04c71" || { echo "origin/master 前进了 - 复核后继续或 STOP"; }
git merge-tree --write-tree --name-only origin/master master >/tmp/mt-pre.txt 2>&1; echo "exit=$?"
sort /tmp/mt-pre.txt | uniq   # 须恰好 5 个文件(见 §1)
```

若冲突文件**不是这 5 个** → 前提已变，STOP 报告。

### 6.2 U+FFFD 检查（决定编辑手法）

```sh
node -e '
const fs=require("fs");const U=Buffer.from([0xEF,0xBF,0xBD]);
for(const f of ["wayfinder/evaluation/map.md","wayfinder/evaluation/tickets/README.md",".agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.md",".agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.zh.md",".agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.i18n.yaml"]){
  const b=fs.readFileSync(f);let n=0,i=0;while((i=b.indexOf(U,i))!==-1){n++;i+=3}console.log(f,"U+FFFD="+n);
}'
```

预期全 0（可 edit_file）。若某文件 >0 → 该文件改用 §6.4 字节 splice。

### 6.3 跑 merge，逐 hunk 解冲突

```sh
[ -f .git/index.lock ] && { echo "INDEX LOCK (eval/其他 session 在跑?) - 等待或 STOP"; exit 1; }
git merge --no-ff --no-commit origin/master 2>&1 | tee /tmp/merge.log
git diff --name-only --diff-filter=U    # 须恰好 §1 的 5 个
```

逐文件用 mcp__local__read_file 看 conflict markers（`<<<<<<<` / `=======` / `>>>>>>>`），按 §4 的判定解：

- map.md hunk 1：origin 理据 + local G13-G15 链接 + origin G11 顺序（§4 机械补回 1）
- map.md hunk 2：取 origin 整段（§4 机械补回 2）
- map.md hunk 3：拼接（§4 机械补回 3）
- README row 8：取 local 整行（§4 机械补回 4）
- `.agents/notes` .md + .zh.md：按**决策 A** 选侧，两侧取同侧（§4 决策 A）
- `.i18n.yaml`：先试 §3 driver；若残留，`pnpm run verify-translation-pairing --write .agents/notes/proposed/architecture/2026-09-11-data-domain-evaluation-core.md`

解完每文件：`git add <file>`。

### 6.4 若某文件 U+FFFD>0：字节级 splice（Node）

```sh
node -e '
const fs=require("fs");const p="<文件路径>";
const U=Buffer.from([0xEF,0xBF,0xBD]);const cnt=b=>{let n=0,i=0;while((i=b.indexOf(U,i))!==-1){n++;i+=3}return n};
let buf=fs.readFileSync(p);const before=cnt(buf);
const m=Buffer.from("<唯一锚>");const i=buf.indexOf(m);if(i<0)throw new Error("锚 missing");
buf=Buffer.concat([buf.slice(0,i), Buffer.from("<新内容>"), buf.slice(i+m.length)]);
const after=cnt(buf);if(after!==before)throw new Error("U+FFFD "+before+"->"+after);
fs.writeFileSync(p,buf);console.log("OK U+FFFD",before,"->",after);
'
```

### 6.5 commit merge

```sh
git add -u   # 只加已跟踪文件的解冲突结果（不 add 未跟踪的 task-orchestration-dag 改动）
# 显式核只动了该 5 个文件:
git diff --cached --name-only
```

确认 `--cached --name-only` 里**没有** `wayfinder/data-agent/` 路径、没有 task-orchestration-dag 文件，只有这 5 个 + merge 自带的，再：

```sh
cat > /tmp/eval-merge.msg <<'MSG'
Merge origin/master into master — resolve evaluation fork conflicts

The same evaluation work (e.g. 'resolve G10 data-domain core': origin
02d6427370 vs local 2877a59cfd) landed on both branches under different SHAs,
diverging 5 files. Resolved as a union, never picking a side:

- wayfinder/evaluation/map.md (3 hunks): kept origin's rationale/qualifiers
  (R14 eventdef-realexec.json, R20/R8c/R8b/R4 detail) + local's G13-G15 markdown
  links + origin's G11 ordering; spliced the AFK-cascade line (non-overlapping
  sub-regions: shared prefix + local inter-node edges + shared middle + origin
  prose tail).
- wayfinder/evaluation/tickets/README.md (1 hunk): took local's markdown-link
  row 8 for consistency with other rows.
- .agents/notes/.../2026-09-11-data-domain-evaluation-core.{md,zh.md}: took
  <origin|local> side for the execution-grader reference (decision A).
- .agents/notes/.../2026-09-11-data-domain-evaluation-core.i18n.yaml: pair-hash
  via merge-translation-pairing driver / verify-translation-pairing --write.

Verified: git merge-tree now clean; grep self-checks pass for both sides'
distinct content. No content from either side lost. Iron rules: mcp__local__*
only; sh not bash; commit via -F file; no push; no touch to wayfinder/data-agent/.
MSG
git commit -F /tmp/eval-merge.msg
rm -f /tmp/eval-merge.msg
git log --oneline -1
```

> ⚠ **不要 `git add -A`**（会把 task-orchestration-dag effort 的未提交改动卷进来）。用 `git add -u` 只 stage 已跟踪文件的解冲突结果，然后逐条核 `--cached --name-only`。

---

## 7. 成功判据（全满足才 done）

1. merge 已 commit；`git status` 干净（无 unmerged）。
2. `git rev-parse HEAD^{tree}` 与 `git merge-tree --write-tree origin/master master` 产出**同一棵树**（即 merge 结果 == 一次性 merge-tree 结果，exit 0）：
   ```sh
   T1=$(git rev-parse HEAD^{tree})
   T2=$(git merge-tree --write-tree origin/master master) ; echo "merge-tree exit=$?"
   test "$T1" = "$T2" && echo "TREES MATCH" || echo "TREES DIFFER - 检查"
   ```
   注：merge-tree 此时 exit 0；若仍 exit 1，说明还有未解冲突。
3. 两侧 distinct 内容都还在（grep 自检，全须 ≥1）：
   ```sh
   # origin 独有(理据):
   git show HEAD:wayfinder/evaluation/map.md | grep -c 'eventdef-realexec.json'           # >=1
   git show HEAD:wayfinder/evaluation/map.md | grep -c '真正的 quick win'                 # >=1
   git show HEAD:wayfinder/evaluation/map.md | grep -c '后续新票均等待 G10 resolved'       # >=1
   # local 独有(级联边 + 链接):
   git show HEAD:wayfinder/evaluation/map.md | grep -c 'T1→R23→GA-EVAL-EXPAND'             # >=1
   git show HEAD:wayfinder/evaluation/map.md | grep -c 'G13-context-evaluation-protocol'   # >=1
   git show HEAD:wayfinder/evaluation/tickets/README.md | grep -c 'R8b-judge-readout'      # >=1
   ```
4. 只动了这 5 个文件（`git show --stat HEAD --name-only` 里无 `wayfinder/data-agent/`、无 task-orchestration-dag）。
5. **未 push**（铁律 4）。

---

## 8. 报告回去（做完后给 data-agent session）

- merge commit SHA
- 决策 A 取了哪侧（origin / local）+ 一句理由
- §7 的 6 条 grep 自检结果（逐条）
- `.i18n.yaml` 是 driver 自动解还是 `--write` 重算
- 标注 staleness：origin 散文尾「后续新票均等待 G10 resolved」过时但**保留未删**
- 是否遇到 §铁律 7 的其他真矛盾（预期无；有则贴原文）

**做完即停，不 push。** data-agent session 拿简报后做 master-sync + push（复核零新红之后）。
