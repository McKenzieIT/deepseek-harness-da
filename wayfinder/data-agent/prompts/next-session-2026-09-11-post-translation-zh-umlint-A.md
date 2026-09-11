# Next-session prompt — translation-zh 已落地；下一张票 = UM-LINT option (A) 诊断（eval 永续不变）

> 承接 `next-session-2026-09-11-eval-perpetual-parallel.md`。本 session 落了两件事：**① translation-zh 实现全绿并提交**（resync `4d4f725748`）；**② UM-LINT grilling 票由用户拍板 = (A) 先诊断 + 预先约定兜底 (C)，(B) 明确否掉**。p2-* 分支清理**按用户指示推迟**。master-sync merge + push 仍**永久 defer**（eval 永续）。

## 一、本 session 结果（勿重做）

### ① translation-zh：实现完成，全绿，已提交 resync `4d4f725748`（17 files, +342/−128，未 push）

详情见 [UM-GEN-DOC-TRANSLATION-OBLIGATION](../tickets/phase-upstream-merge/UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 的「实现已落地 — 2026-09-11」节。要点：

- `spliceRegion` 泛化成 `(content, region, beginMarker?, endMarker?)`，默认仍 cordis-surface → **cordis 目录字节不变**（`verify-cordis-catalog` 99 up to date）。
- `gen-doc-graphs.ts`：5 render fn 加 fence + `PAIRED_DOCS`/`generatedBegin`/`generatedEnd` + `main()` 注入 zh（经**已 export 的 `localizePageRegion`** 做 locale 改写，这是原交接 prompt 的 3a import 清单漏掉的一步）。
- 5 个 `.zh.md` 一次性 migration = **包住**原译文结构块（非删除），首次 regen 再替换。
- **稳态已实证**：第二次 regen `spliced 0 / refreshed 5` → 此后 regen 自动刷两侧 hash，translation-pairing 不再被 regen 打破。
- 门禁全绿：verify-doc-graphs / verify-md-links(1730) / verify-cordis-catalog(99) / scoped verify-translation-pairing(5 pairs) / `tsc -b tsconfig.host.json` exit 0 / pre-commit hooks 4 项 ✔ / 零 untracked 污染。

### ② UM-LINT：决策已定 = **(A) 先诊断，兜底 (C)**；**(B) 否掉**

- 用户 2026-09-11 拍板。原交接 prompt §B.2 计划直接落 83 条 disable directive——那等于让 agent 替人拍板一张 HITL grilling 票（该票 Question 原文即「要决的是：这门 gate 怎么算过」，(A)/(B)/(C) 从未定过）。**本 session 未执行任何 (B) 动作。**
- 新票 **[UM-LINT-A-OXLINT-RESOLUTION](../tickets/phase-upstream-merge/UM-LINT-A-OXLINT-RESOLUTION.md)**（research，unclaimed，**可立即认领**）= 查 oxlint typeAware 为何把 Cordis inject 的 `ctx` 解成 `error` 类型。4 个候选假设（paths 指向 / project reference 未跟随 / typert `.d.ts` augmentation 不可见 / oxlint 能力边界）在票里。
- 若查明是 oxlint 上游能力边界 → **直接执行已预先约定的 (C)**（一行 config 把 `no-unsafe-*` 移出 typeAware），**不要**退回 (B)。
- 92 条里 **7 REAL + 2 BORDERLINE 与 (A)/(C) 选择无关**，不该被挡住（`no-unnecessary-type-assertion` ×4 **语义、勿 auto-strip** / `max-len` ×2 机械 / `no-deprecated` ×1 / BORDERLINE ×2 皆在 `scripts/gen-architecture-graph.ts`）。

## 二、下 session 建议顺序

1. **[UM-LINT-A-OXLINT-RESOLUTION](../tickets/phase-upstream-merge/UM-LINT-A-OXLINT-RESOLUTION.md)**（research，AFK，resync 树 read-only 安全）——先认领这张。诊断只需 `pnpm run lint:contracts-ready`（**不必** build：`pnpm run lint` = `build:lib:host && lint:contracts-ready`，但 build 非 load-bearing，oxlint 从源码 paths 解析类型）。
2. 顺带清 92 里那 9 条 REAL/BORDERLINE（与 (A) 无关，独立可做）。
3. UM 专项其余：ui-settings re-port ~2 / QODER-RETIRE ~1-2（**translation-zh 已不再是其前置**）/ INVARIANT-CLEANUP ~1 / UM-ADAPT·UM4·CORDIS·UM6·UM12-cron·UM15-cron ~5-6（多需 HITL）。

## 三、已被证伪 / 已纠正的前提（**别再照旧 prompt 做**）

1. **`dsh-resync` 是 master 仓库的 linked worktree，不是独立 clone**：`.git` 是文件（`gitdir: …/deepseek-harness-da/.git/worktrees/dsh-resync`）。故
   - 检查 resync 的 index.lock 要用 **`/Users/mckenzie/workspace/deepseek-harness-da/.git/worktrees/dsh-resync/index.lock`**；旧 prompt 让核的 `dsh-resync/.git/index.lock` 是**无效路径**（会报 "Not a directory"，等于空转）。
   - 共享 object store 与 refs，但 index/working-tree 独立 → 「resync 无 eval，并行/apply 安全」的结论**仍成立**。
2. **p2-* 的 `git branch -D` 不是「纯 ref op」**：3 个分支都被 worktree 占用（`dsh-p2-present-decomp` / `-suggest-followups` / `-uism-layer`），`branch -D` 会**直接拒绝**；要删必须先 `git worktree remove` 掉 3 个**目录**。用户已指示**推迟**，两者都别动。
   - absorption 本身**已逐文件核实成立**（未吸收 0/5、0/5、0/10，全部并入 `eb9e4cf05c`）。
   - ⚠ 方法论：**别用全树 `git diff eb9e4cf05c <branch>`** 判 absorption（master 在 eval 下持续前移，会得到「117 files changed」的假阴性）；要按分支自身 merge-base 取 touched 文件再逐个比对。
3. **「structured-only regen → GREEN」对首轮是错的**：`maybeRecordPair` 要求 recorded hash == 写前字节（`gen-cordis-catalog.ts:1145`）**且**两侧 stripped 不变（`:1147-49`）；「引入 fence」本身就把内容从 unfenced prose 移进 fenced region → 两侧 stripped 都变 → 首轮必 decline（实测 `refreshed 0`）。**已用一次 scoped `--write` 完成 bootstrap，此事一次性，不会再遇到。**
4. **`verify-translation-pairing --write` 不可裸跑**：脚本自带守卫（`translation-pairing.ts:293-295`「recording pairs you did not review blesses unconfirmed content」）要求显式 pair 路径或 `--all`。**永远只对你真的复核过的那几对显式 `--write`**；corpus 里 `config-catalog` / `subsystems/README` / `tool-catalog` / `adr/0002` 等 stale 属 A 类 pre-existing 真实翻译债（归 parallel-dev-cleanup/R1），`--all` 会把它们一起「记账」抹掉。
   - 调用要**绕开 pnpm**：`pnpm run verify-translation-pairing -- <paths> --write` 会把字面 `--` 传进去并报 `unknown flag(s): --`；用 `npx tsx scripts/verify-translation-pairing.ts <paths> --write`。
5. **disable-directive 形式**（万一将来又用到）：仓库 9 处既有全是 `// eslint-disable-next-line @typescript-eslint/<rule> -- <reason>`；旧 prompt 说的 `typescript/<rule>` 形式仓库 0 处，且它引的先例路径 `packages/host/apiproxy/src/api-proxy.ts:3364` 在 resync **不存在**（已按 UM4 rehome），是 stale 引用。

## 四、⚠ 铁律（eval 永续版，含本 session 修正）

- `mcp__local__*` only（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；`mcp__local__grep` 不可靠 → 用 `mcp__local__bash` 里的 `grep -rEn`；`rg` / `grep -P` / `cat -A` 不存在（BSD 工具链）。
- node v24 强制：`export PATH="/usr/local/bin:$PATH"`（v24.15.0；v25 crash tsdown）。
- shell 是 `sh` 非 bash（无 `<(...)`；commit 用 `git commit -F /tmp/file`）。
- **resync 树** `/Users/mckenzie/workspace/dsh-resync`（tip **`4d4f725748`**，unpushed，**无 eval**）：并行 subagent + apply 全安全。branch `upstream/resync-2026-09-08` local-only。
- **master 树** `/Users/mckenzie/workspace/deepseek-harness-da`（**eval 永续**，tip 随 eval 前移——本 session 起点 `2154ef06b7`，已非旧 prompt 记的 `fb64a85750`）：任何 git 写前核 `[ -f .git/index.lock ]`（locked → 跳过等下一刻，勿阻塞勿 force）；doc/ticket commit 低风险可做；**merge/push 永久 defer**。
- 多行/复杂改动优先**带断言的 node byte-splice**（按行号从**底向上**改，行号才不会失效），而不是靠 `edit_file` 猜唯一锚点——本 session 正是靠断言当场抓到旧 prompt 的 stale 行号（`CORDIS_CATALOG_POLICY` 在 :12 而非 :14）且**一个字节都没写坏**。
- `map.md` 含 U+FFFD（4 行）→ **只能 byte-splice**（node `readFileSync` Buffer + `indexOf` + `Buffer.concat`），禁 `edit_file`；ticket `.md` 用 `cat >> ` 追加（保 U+FFFD）。
- 不碰 `.worktrees/`（`r10-harness-goodhart` / `t1-exec-grader`）+ `wayfinder/evaluation/`。
- **不 push**（resync + master 皆 local）。

## 五、估算

| 终点 | 估算 |
|---|---|
| UM-LINT-A 诊断 + (C) 或配置修 + 9 条 REAL | ~1-1.5 session |
| master-sync + push | **永久 defer**（eval 永续 → 撞 git 写；须 eval 能暂停）|
| UM 专项其余 | ~9-13 session（多需 HITL 决策）|
