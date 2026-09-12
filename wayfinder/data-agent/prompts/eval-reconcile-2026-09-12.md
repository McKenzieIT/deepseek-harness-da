# SESSION PROMPT — 调和 evaluation tracker 分歧（使 local master 可干净合并 origin/master）

> 这是一个即贴即用的 handoff prompt。请在 repo 根目录（`/Users/mckenzie/workspace/deepseek-harness-da`）下另起一个 Claude Code 窗口运行。
> 本 session 的【唯一任务】：调和 `wayfinder/evaluation/` 下两个分歧文件的【内容】，使 local master 能干净 merge origin/master，且两侧 evaluation 票据内容零丢失。
> 不要做任何超出此范围的事（尤其：不要 push、不要碰 `wayfinder/data-agent/` 下任何文件）。

---

## 0. 一句话目标

让 `git merge-tree --write-tree origin/master master` 退出码 = 0（干净，无冲突），且两侧 evaluation 票据内容零丢失。

---

## 1. 不可违背的铁律（先读，全程遵守）

1. **只用 mcp__local__* 工具**（mcp__local__bash / read_file / write_file / edit_file / grep / glob 等）。不调用其它 shell 通道。built-in Read/Write/Edit/Bash/Grep/Glob 在本环境 BLOCKED。
2. **sh，不要 bash**：mcp__local__bash 即是 sh；不要用 `PIPESTATUS`、数组等 bashism；要取退出码用临时文件 + `$?`。
3. **commit message 用 `-F` 文件**，不要用 `-m` 行内。写一个临时 `.msg` 文件再 `git commit -F /tmp/xxx.msg`，提交后删除临时文件。
4. **U+FFFD（替换符）防雷**：本 session 涉及的两个 evaluation 文件**先做 `grep -c $''` 检查**（见 §6.2）。若检查为 0（干净），可用 mcp__local__edit_file 正常编辑；若 >0（含 mojibake），**禁止用 edit_file / `cat >>`** 该文件，改用字节级 splice（见 §6.5），每步带 occurrence 计数断言。
5. **未经明确授权，绝不 push**。绝不 `git push`、绝不强推、绝不删远程分支。本 session 只在本地完成 merge commit，把 SHA 与验证结果报告回去；实际 push 由 data-agent session 负责。
6. **绝不触碰 `wayfinder/data-agent/` 下任何文件**。只允许读写 `wayfinder/evaluation/map.md` 与 `wayfinder/evaluation/tickets/README.md` 这两个文件。
7. **取并集，不选边**：两侧的 distinct 内容都要保留，合并 = UNION，绝不是二选一。对重叠且各自改写的区域，组合而非覆盖。
8. **遇真矛盾就停**：若某处分歧不是「各侧各有补充」而是「语义上不可共存的对立断言」，STOP，不要猜，把该处分歧原文与两侧引用贴出来报告，等人工裁决。

---

## 2. 背景：分歧的事实（已由 scout 核实 + data-agent session 复核 SHA，勿重新调查）

- 仓库根：`/Users/mckenzie/workspace/deepseek-harness-da`（若 cwd 不是这里，所有 mcp__local__ 路径都用这个绝对前缀）。
- 关键 refs（复核一致，data-agent session 2026-09-12 实测）：
  - `origin/master` = `4cc985d567b7f280b1ba56dfe6325a98c7b04c71`
  - local `master` = `460c477c1e8ad3cb7e824b7dec6effd6372afeb0`
  - 共同 base = `1ef40edaeee41d6615a5b2ea060a9cbeda43cb73`
  - origin-only **2802** / local-only **81**；`origin/master` **不是** local master 的祖先 → plain push 必被拒（non-FF）。
- 分歧文件【恰好两个】（`git merge-tree --write-tree --name-only origin/master master` 退出 1，冲突只在这两文件）：
  - `wayfinder/evaluation/map.md` —— origin/master **200 行** / local **200 行**（行数一致 ⇒ 所有差异都是就地改写，不是净增删）。
  - `wayfinder/evaluation/tickets/README.md` —— origin **33 行** / local **33 行**（行数一致 ⇒ 就地改写）。
- diff 方向约定：`git diff origin/master master -- <file>` 中，`-` 行 = origin 独有，`+` 行 = local 独有。

### 2.1 根因（决定合并策略）

分歧源于【重复落盘】：同一批 evaluation 工作在 origin/master 与 local master 两侧【各跑了一遍】，产生【不同 SHA、相同 commit subject】的提交。代表对（origin / local）：

- 'reconcile R10b artifact ownership' `5a0f39af9d` / `cb892b8a73`
- 'resolve G10 data-domain core' `02d6427370` / `2877a59cfd`
- 'R8 note 9.9 FLEX re-derived…' `6055d3017d` / `f11353caa1`
- 'claim R8c…' `530c818b43` / `c69e54af6c`

**推论**：subject 相同但文件内容分歧 ⇒ 【合并的是内容，不是 commit】。不要 cherry-pick / rebase 去对齐 commit，那是死路；直接在文件内容层做并集。

---

## 3. 分歧性质：真内容，不是标点（已裁决，勿重新争论）

此前一个 session 已裁决：本分歧【不是全角/半角标点差异】。多处确实存在标点宽度差，但标点差【总是】与 local 侧的【实质性内容删减】耦合出现——local 在改标点的同时砍掉了 load-bearing 细节（文件名、计数、理据子句、日期、删除线、决策编号）。**不要重新调查「是否只是标点」。** 直接按 §4/§5 的并集方案做。

---

## 4. 各侧独有内容（合并时要保留的并集要素）

### 4.1 origin/master 独有（local 删减掉、必须补回）

`wayfinder/evaluation/map.md`（约行号，会漂移，用 §6.3 的 grep 定位）：

- **R14 括注**：origin 保留 R8 派生理据——`前置已改`、文件名 `eventdef-realexec.json`、`n=95/35 case`、`真值受 event anchor 污染`。local 只留 `(须在 T11 之后、在重建的 EXECUTION 语料上做)`。
- **R20 注释**：origin 有子句 `R8 重切为四探针` + 加粗 rename `原 R20-radar-redundancy`。local 省略。
- **G2 括注**：origin 有归因子句 `题面须加 R8 的边界`。local 删掉归因、改写措辞。
- **G8 注释**：origin 有 `(原 G8-pairwise-judge)` rename 注。local 完全省略。
- **item 2（R14）**：origin 保留 `前置已改,不再是「便宜的既有数据分析」`、`eventdef-realexec.json`、`n=95/35`、`16/18 失效`、`⇒ 须等 T11 + 语料重建`。local 浓缩成一句。
- **item 3（R20 探针 b+c）**：origin 保留 `真正的 quick win` 标签 + `测准则顺序与 isolation-vs-joint` 子句。local 两者皆删。
- **item 4（R8c）**：origin 保留 `认读` 标签、`它改 T11 的下游语义`、`不能直接当真值`（加粗）、`而 T11+T1 是推荐的下一步`。local 删。
- **item 5（R8b）**：origin 保留 `认读`、`G8 的决策 1/3/4`（命名具体 G8 决策，load-bearing）、`探针 b/c`。local 删。
- **item 6（R4）**：origin 保留 `认读分析`/`便宜` 限定词、删除线 `~~R8~~`、日期 `2026-09-10`。local 删。
- **primary-URL-confirmed 整句（origin line ~191，local 无此行）**：origin 有一整行 `**已 primary-URL-confirmed(WebSearch 返回 arxiv.org URL)**:见各方向论文行(2406.11939/2305.20050/2312.08935/...)`；local **完全没有这行**（不是「删了 2406.11939 这个 token」——那个 ID 在 line 125 的「论文」行里两侧都有且一致）。**补回 origin 这整行**。注意：line 125 的「论文:…Arena-Hard(2406.11939)…」两侧逐字节一致，不要动它。
- **AFK 级联行尾散文**：origin 在共享中段 `…→R21。` 之后追加了 `方向 1 的 T11/T1 仍可在 G10 收尾前先做，后续新票均等待 G10 resolved。`。local 行尾无此句。

`wayfinder/evaluation/tickets/README.md`：见 §4.2 row 8（local 独有格式，取 local）。

### 4.2 local/master 独有（origin 没补的、必须保留）

`wayfinder/evaluation/map.md`：

- **G13/G14/G15 票引**：local 在 G 行 `(+G12-exec-orm-verifier 条件)` 之后追加了 `[G13](tickets/G13-context-evaluation-protocol.md)、[G14](tickets/G14-adaptive-context-holdout-policy.md)、[G15](tickets/G15-dynamic-evaluation-lifecycle.md)`。origin 的 G 行止于 G12。补全了 G 票引。
- **AFK 级联行的级联边**：local 在共享前缀 `…→[R25]**；` 之后、共享中段 `G13→R26…` 之前【插入】一整段级联边：`T1→R23→GA-EVAL-EXPAND→{R12/R17/G9}；G3→T3→R15；G4→T4+T4b→R16；G5→T5+T5b；G6→P1→T6+R18；R20(b,c)→G8→T7；G11→T10；`。origin 此处无任何级联边，直接接 `G13→R26`。命名了 T1/R23/G3/G4/G5/G6/R20/G11 的下游路由，load-bearing。

`wayfinder/evaluation/tickets/README.md`：

- **row 8（direction-8 'Judge 读出/量表/顺序'）**：local 用 markdown 链接（`[R8](R8-pairwise-judge-papers.md)`、`[R8b](R8b-judge-readout-papers.md)`、`[R8c](R8c-reference-anchor-papers.md)`、`[G8](G8-judge-readout-scale.md)`、`[R20](R20-judge-readout-probes.md)`）。取 local，使 row 8 与其余行（都已用 `[..](..)` 链接）一致。

### 4.3 AFK 级联行合并解析——关键（data-agent session 已字节级复核）

两侧对该【同一行】（line 170）的编辑落在【不重叠子区】，可机械拼接。data-agent session 2026-09-12 字节级实测：line 170 在两侧都存在，可见前缀逐字节一致。

- 共享前缀（byte 级两侧一致）：`**AFK 级联**:**[T11]→[T1]→[T13]→[T9]→[T14]→[T15]→[T12]→[R25]**；`
- local 在前缀后【插入】级联边（见 §4.2）。
- 共享中段（byte 级两侧一致）：`G13→R26，G13+G14→R27，G15+R25+T5/T5b→R21。`
- origin 在中段后【追加】散文尾（见 §4.1）。

⇒ 合并后该行 = 共享前缀 + local 级联边 + 共享中段 + origin 散文尾。**机械拼接即可，无需语义判断。**

---

## 5. 逐区合并方案（零内容丢失）

| 区域 | 约行 | 取哪侧 | 理由 |
|---|---|---|---|
| R14 括注 | ~141 | origin | origin 是 local 的超集（local 只删了理据） |
| R20 注释 | ~141 | origin | origin 多 `R8 重切为四探针` |
| G2 括注 | ~142 | origin | origin 多 `题面须加 R8 的边界` 归因 |
| G8 注释 | ~142 | origin | origin 多 `原 G8-pairwise-judge` rename 注 |
| G13/G14/G15 | ~142 | 追加 local | origin 没有，local 补全 G 票引 |
| item 2（R14） | ~161 | origin | origin 多 理据/文件名/计数/16/18 |
| item 3（R20 b+c） | ~162 | origin | origin 多 `真正的 quick win`+`isolation-vs-joint` |
| item 4（R8c） | ~163 | origin | origin 多 `认读`/`下游语义`/`不能直接当真值` |
| item 5（R8b） | ~164 | origin | origin 多 `G8 的决策 1/3/4` |
| item 6（R4） | ~165 | origin | origin 多 限定词/删除线/日期 2026-09-10 |
| primary-URL 整句（line ~191） | ~191 | origin | origin 多一整行 `已 primary-URL-confirmed…(2406.11939/…)`，local 无此行（line 125 的 2406.11939 两侧一致，别动） |
| AFK 级联行 | ~170 | 拼接 | 前缀 + local 级联边 + 中段 + origin 散文尾（§4.3） |
| bold-vs-plain（R 票引 / 38-files 行） | ~140,~146 | origin | 取加粗（高亮活跃票），无内容丢失 |
| README row 8 | ~26 | local | 取 markdown 链接，与其余行一致 |

> 唯一需要人工留意（非删除）的 staleness flag：origin 行尾散文里的 `后续新票均等待 G10 resolved`——G10 在两侧都已 resolved，故该句部分过时。**保留该句原样不动**（删除 = 内容损失，违反铁律 7），但在 §8 报告中标注此 staleness，留给 evaluation effort 后续清理。

---

## 6. 执行步骤

### 6.1 复核前提（30 秒）

```sh
cd /Users/mckenzie/workspace/deepseek-harness-da
export PATH="/usr/local/bin:$PATH"
git fetch origin --quiet
test "$(git rev-parse origin/master)" = "4cc985d567b7f280b1ba56dfe6325a98c7b04c71" || { echo "SHA MISMATCH - scout 证据已过期, STOP"; exit 1; }
test "$(git rev-parse master)" = "460c477c1e8ad3cb7e824b7dec6effd6372afeb0" || { echo "master 已前进 - 复核后继续"; }
git merge-tree --write-tree --name-only origin/master master >/tmp/mt-before.txt 2>&1; echo "merge-tree exit=$?"
cat /tmp/mt-before.txt   # 必须恰好两个文件: wayfinder/evaluation/map.md + tickets/README.md
```

若 conflict 文件**不止这两个**，或有 `wayfinder/data-agent/` 文件 → STOP 报告（前提已变）。

### 6.2 U+FFFD 检查（决定编辑手法）

```sh
for f in wayfinder/evaluation/map.md wayfinder/evaluation/tickets/README.md; do
  printf "%s U+FFFD=" "$f"; grep -c $'' "$f" || true
done
```

- **0**：文件干净，可用 mcp__local__edit_file 正常编辑（每处用足够长的唯一 old_string）。
- **>0**：该文件含 mojibake，**禁用 edit_file / `cat >>`**，改用 §6.5 字节级 splice，每步带 occurrence 计数断言（前后计数必须不变）。

### 6.3 取两侧内容做对照

```sh
git show origin/master:wayfinder/evaluation/map.md        > /tmp/o-map.md
git show master:wayfinder/evaluation/map.md               > /tmp/l-map.md
git show origin/master:wayfinder/evaluation/tickets/README.md > /tmp/o-readme.md
git show master:wayfinder/evaluation/tickets/README.md    > /tmp/l-readme.md
diff /tmp/o-map.md    /tmp/l-map.md    > /tmp/d-map.txt    2>&1
diff /tmp/o-readme.md /tmp/l-readme.md > /tmp/d-readme.txt 2>&1
```

逐 hunk 核对 §4/§5 的判定。**当前 worktree 的这两个文件 = local 版**（你在 master 上），所以编辑基线是 local；要补的是 origin 独有内容。

### 6.4 应用合并（在 local master 上，即当前 worktree）

对 `wayfinder/evaluation/map.md`：以 local 版为基线，补回 §4.1 的 origin 独有内容（多数 = 把 local 删掉的理据/文件名/计数/限定词补回），并按 §4.3 拼接 AFK 级联行。

对 `wayfinder/evaluation/tickets/README.md`：row 8 取 local 的 markdown 链接版（local 已是，确认无改动即可；若 local 此处恰好是 origin 风格，则替换为链接版）。

每处编辑后立即 `git diff -- <file>` 自查，确认只动了预期区域。

### 6.5 若某文件 U+FFFD>0：字节级 splice（Node）

```sh
node -e '
const fs=require("fs");const p="wayfinder/evaluation/map.md";
const U=Buffer.from([0xEF,0xBF,0xBD]);const cnt=b=>{let n=0,i=0;while((i=b.indexOf(U,i))!==-1){n++;i+=3}return n};
let buf=fs.readFileSync(p);const before=cnt(buf);
const m=Buffer.from("<唯一锚字符串>");const i=buf.indexOf(m);if(i<0)throw new Error("锚 missing");
buf=Buffer.concat([buf.slice(0,i), Buffer.from("<新内容>"), buf.slice(i)]);
const after=cnt(buf);if(after!==before)throw new Error("U+FFFD "+before+"->"+after);
fs.writeFileSync(p,buf);console.log("OK U+FFFD",before,"->",after);
'
```

### 6.6 提交

```sh
[ -f .git/index.lock ] && { echo "INDEX LOCK (eval 在跑?) - 等待或 STOP"; exit 1; }
cat > /tmp/eval-reconcile.msg <<'MSG'
wayfinder(evaluation): reconcile divergent tracker — merge origin+local content as union

The same batch of evaluation work landed on both origin/master and local master
under different SHAs, diverging two files (map.md, tickets/README.md). Both
sides hold content the other lacks (origin: R14/R20/R8c/R8b/R4 rationale +
filenames + counts + the AFK-cascade prose tail + 2406.11939; local: G13/G14/G15
ticket refs + the AFK-cascade inter-node edges + README row-8 markdown links).

Merged as a UNION, never picking a side; the AFK-cascade line splices because
the two sides edit non-overlapping sub-regions of the same line (byte-verified
shared prefix + local edges + shared middle + origin prose tail).

Result: git merge-tree --write-tree origin/master master now exits 0 (clean),
and grep for T12 / R10 / G10 / the domain-responsibility sentence all return
hits on the merged tree (no content from either side lost).

Iron rules honoured: mcp__local__* only; sh not bash; commit via -F file;
U+FFFD count asserted unchanged where applicable; no push; no touch to
wayfinder/data-agent/.
MSG
git add wayfinder/evaluation/map.md wayfinder/evaluation/tickets/README.md
git commit -F /tmp/eval-reconcile.msg
rm -f /tmp/eval-reconcile.msg
```

> ⚠ 提交前核：master 工作树可能躺着 **task-orchestration-dag effort 的未提交改动**（非你职责）。`git add` **只显式路径**这两个 evaluation 文件，绝不 `git add -A`。

---

## 7. 成功判据（全部满足才算 done）

1. `git merge-tree --write-tree origin/master master` **exit 0**（干净，零冲突）。
2. 合并后的树里，两侧的 distinct 内容都还在——逐条 grep 自检：
   ```sh
   MT=$(git merge-tree --write-tree origin/master master)   # 现在 exit 0
   git ls-tree -r $MT --name-only | grep evaluation   # 确认两文件在合并树
   # origin 独有:
   git cat-file -p $MT:wayfinder/evaluation/map.md | grep -c 'eventdef-realexec.json'        # >=1
   git cat-file -p $MT:wayfinder/evaluation/map.md | grep -c '已 primary-URL-confirmed'                      # >=1 (origin 整行)
   git cat-file -p $MT:wayfinder/evaluation/map.md | grep -c '后续新票均等待 G10 resolved'      # >=1 (origin 散文尾)
   # local 独有:
   git cat-file -p $MT:wayfinder/evaluation/map.md | grep -c 'G13-context-evaluation-protocol'   # >=1
   git cat-file -p $MT:wayfinder/evaluation/map.md | grep -c 'T1→R23→GA-EVAL-EXPAND'              # >=1 (local 级联边)
   git cat-file -p $MT:wayfinder/evaluation/tickets/README.md | grep -c 'R8b-judge-readout'       # >=1 (local 链接)
   ```
   任一返回 0 → 那侧内容丢了，回退 commit 重做该区。
3. `git diff master -- wayfinder/evaluation/` 只动了这两个文件，没碰别的。
4. **未 push**（铁律 5）。

---

## 8. 报告回去（做完后给 data-agent session 的简报）

- merge commit SHA
- `git merge-tree` exit code（应为 0）
- §7 的 6 条 grep 自检结果（逐条 0/1）
- 标注的 staleness：origin 散文尾 `后续新票均等待 G10 resolved` 已过时（G10 两侧都 resolved）但**保留未删**，留给 evaluation effort 后续清理
- 是否遇到 §铁律 8 的真矛盾（应为「无」；若有，贴原文）

**做完即停，不要 push。** data-agent session 拿到这份简报后，会做 master-sync + push（在复核零新红之后）。
