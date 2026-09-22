# Next-session prompt — eval-perpetual 现实：subagent/workflow 并行解票（resync 安全并行 + master 低风险串行 + master-sync/push 永久 defer）

> 承接 `next-session-2026-09-11-post-subagent-sweep.md`（线D 已落 resync `c2623c84eb`；4 stale 前提证伪；translation-zh Cordis region-splice 用户锁定）。**新现实（用户 2026-09-11 锁定）**：eval session **永续不停**（不能等"收定"）。故原 C/D gate（master-sync merge + push）的"eval 收定"前提**永不达成** → **永久 blocked**（与 eval 持续 git 写撞）。重设安全策略：**resync 树无 eval → workflow 并行安全**；master 树 doc/branch-D 低风险（index-lock-check 前）；master-sync/push 永久 defer。

## 一、新现实：eval 永续

- eval session 活跃于 master，**不能停**。
- 故原 "eval 收定" gate（p2-*/master-sync apply）的"收定"前提**永不达成**。
- **重设**（按树分）：
  - **resync 树** `/Users/mckenzie/workspace/dsh-resync`（tip `c2623c84eb`，unpushed，**无 eval session**）：并行 subagent + apply 全安全。
  - **master 树** `/Users/mckenzie/workspace/deepseek-harness-da`（tip `fb64a85750`，unpushed，**eval 永续**）：doc commit + branch-D 低风险（index-lock-check 前）；**master-sync merge + push 永久 defer**（撞 eval 持续 git 写）。

## 二、安全并行策略

### A. resync 并行分析（workflow）—— 安全（无 eval）

**2 read-only subagent 并行**（resync，无 eval 冲突——非 build/gen/check，不写 dist/lib/.tsbuildinfo）。2 prompt 文本（IRON+TZ+LINT）在 `wayfinder/data-agent/workflows/um-resync-parallel-sweep.wf.js`。

**方式 1（推荐，proven wave 1/2）**：Agent tool 并行 2 个 `general-purpose` subagent——`mcp__local__read_file` 读 `.wf.js` 拿 TZ/LINT prompt 文本，分派 2 Agent 调用（`run_in_background` 可并行）。general-purpose 实证 mcp__local__ 直达。

**方式 2（workflow inline，user-allowed）**：`mcp__local__read_file` 读 `.wf.js` 全文 → `Workflow({ script: <全文> })` inline。⚠ **scriptPath 不行**——Workflow tool pod-side 看不见 Mac 路径 `/Users/mckenzie/...`；必须 inline `script`（Workflow 自动 persist pod-side + 跑）。`agent(..., { agentType: 'general-purpose' })` 同 wave 1/2。本 session 2026-09-11 已跑 workflow（task `wra5epycb`）——见 task-notification 或 `/tmp/s3-apply-prep.md` + `/tmp/slint2-summary.md`。

2 agent（resync，无 eval 冲突）：
- **S-tz-prep**：读 `spliceRegion`（`scripts/gen-cordis-catalog.ts:920`，非 :747）body 验 insert-if-absent（translation-zh bootstrap blocker）+ 读 5 render fns（`scripts/gen-doc-graphs.ts`：renderCapabilitySeams/renderEventRelations/renderLifecycle/renderToolPipeline/renderIndex）拿 verbatim fence-wrap old + 读 `scripts/translation-pairing.ts` fence grammar → `/tmp/s3-apply-prep.md`（spliceRange verdict + 5 fence-wrap edits + 3a imports + 3c main rewrite）。
- **S-lint2**：`pnpm run lint:contracts-ready`（= `tsx scripts/run-oxlint.ts .` w/ `.oxlintrc.json`，read-only oxlint ~35s）on resync → `/tmp/lint-resync-wf.txt`（raw 92）+ 解析 per-rule count + FP/REAL bucket + 5-10 sample findings → `/tmp/slint2-summary.md`。

**注**：本 session（2026-09-11）**已跑过此 workflow**（background）——下 session 先 `ls /tmp/s3-apply-prep.md /tmp/slint2-summary.md /tmp/lint-resync-wf.txt`；**在则直接读 + apply（§B）；不在（workflow 未完或 /tmp 清）则重跑 workflow（§A）再 apply**。

### B. resync 串行 apply（workflow 完后，主 session）—— 安全

1. **translation-zh apply**（按 `/tmp/s3-apply-prep.md`）：若 spliceRange = insert-if-absent → 直接 apply 3a imports（`blobHash`/`partitionGeneratedRegions`/`renderPairMeta` from `./translation-pairing.ts` + `maybeRecordPair`/`spliceRegion` from `./gen-cordis-catalog.ts`）+ 3b 5 fence-wraps（5 render fns 的 mermaid/tables 包 `BEGIN/END GENERATED <slug>`）+ 3c main rewrite（`PAIRED_DOCS` Set 5 docs/* + splice zh via `partitionGeneratedRegions(doc.content).regions`→`spliceRegion` + `maybeRecordPair`；3 composition files 不 pair）到 `scripts/gen-doc-graphs.ts` on resync（byte-splice 或 edit_file 若 0 FFFD）；若 spliceRange = replace-only → 先 one-time migration helper insert fences 进 5 `.zh.md`。`pnpm run gen-doc-graphs`（regen 8 md + 5 zh-splice + 5 i18n = 18 touches）+ `pnpm run verify-translation-pairing`（structured-only → GREEN；prose change → RED by design）+ `pnpm run verify-md-links`。commit on resync `[wayfinder] 线3: gen-doc-graphs zh emission (Cordis region-splice, UM-QODER-RETIRE 前置)`。**不半做**（partial = verify-translation-pairing RED）。
2. **UM-LINT per-finding triage + apply**（按 `/tmp/slint2-summary.md`）：dispatch 一个 subagent 拿 `/tmp/lint-resync-wf.txt` 92 逐条 FP/real（rule-level FP/REAL 已知——no-unsafe-* family ~85 FP，`no-unnecessary-type-assertion` ~5 REAL [ctx as never 勿 auto-strip]，`max-len` ~2，`no-deprecated` ~1），FP 给 `// eslint-disable-next-line typescript/<rule> -- <reason>`（form 见 summary，repo 认 `packages/host/apiproxy/src/api-proxy.ts:3364`）→ `/tmp/slint2-triage.md`。主 session apply disable-directives（resync，byte-splice 或 edit_file）+ `pnpm run typecheck` + `pnpm run lint:contracts-ready` 复验（92→少）+ commit `[wayfinder] UM-LINT-TYPEAWARE-CORDIS: triage 92 findings`。⚠ 92 多，subagent 逐节派 + 增量写 /tmp（rule 9）。

### C. master 低风险串行（eval 永续下仍可做）—— index-lock-check 前

1. **p2-* branch delete**（S-p2 已定 3 del：`refactor/p2-present-decomp-2026-09-12`/`-suggest-followups-2026-09-12`/`-uism-layer-2026-09-12`，fully absorbed into `eb9e4cf05c`）：逐个 `git branch -D <ref>`（⚠ 先 re-confirm absorption——master tip 因 eval 推进可能已动；`git diff eb9e4cf05c <branch> -- <file>` per-file 字节比对，empty = absorbed；**不可批量**）。`git branch -D` 是 ref op（不触 index/working-tree），**index-lock-check 前**即可（`[ -f .git/index.lock ]` 核，locked 则 skip 等下一刻——勿阻塞，勿 force）。2 KEEP（`-present-table`/`-uism-vitest`）不删（residual）。per-branch commit（pathspec）。
2. **doc/ticket 更新 commit**（如 workflow 后记 /tmp 结果 + 更新 map/ticket）：pathspec `git commit <paths> -F /tmp/msg`，**index-lock-check 前**（locked 则 skip 等下一刻）。本 session `e1a1d6049a`/`fb64a85750` 实证安全（每次写前核 index.lock=none）。

### D. master 永久 defer（eval 永续 → 撞 git 写）

- **master-sync MERGE**（`git merge origin/master`）：触 working-tree + index + merge state，**与 eval 持续 git 写撞**（index.lock 冲突 / 并发推覆盖 / 状态竞态）。S-master 已定 clean plan（`git merge-tree --write-tree origin/master master` exit 0，证伪 map.md-conflict），但 apply **永不可**（eval 不停）。**defer 到 eval 能暂停时**（若 ever）。resync→origin 的 PR 也 defer（push 撞）。
- **push**（resync `c2623c84eb` + master `fb64a85750`）：须用户明确指示 + 撞 eval。**defer**。

## 三、⚠ 铁律（eval 永续版）

- mcp__local__* only（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；`mcp__local__grep` 不可靠 → `grep -rEn` in `mcp__local__bash`；`rg`/`grep -P` 不存在（BSD grep）。
- node v24 强制：`export PATH="/usr/local/bin:$PATH"`（v24.15.0；v25 crash tsdown）。
- shell `sh` 非 bash（无 `<(...)`，temp files + sort/comm，commit `git commit -F /tmp/file`）。
- **resync 树** `/Users/mckenzie/workspace/dsh-resync`（tip `c2623c84eb`，unpushed，**无 eval**）：workflow 并行 + apply 全安全。resync branch `upstream/resync-2026-09-08` local-only（remote 删 merged）。
- **master 树** `/Users/mckenzie/workspace/deepseek-harness-da`（tip `fb64a85750`，unpushed，**eval 永续**）：任何 git 写前 `[ -f .git/index.lock ]` 核（locked → skip 等下一刻，勿阻塞勿 force）；doc/branch-D 低风险可做；**merge/push 永久 defer**。
- runner flaky：短 bash，单 write_file，长内容写 /tmp 再短 bash；断后先 `echo x` probe。
- map.md 13 U+FFFD → byte-splice（node `fs.readFileSync` Buffer + `indexOf` + `Buffer.concat` + `writeFileSync`，禁 `edit_file`）；ticket `.md` `cat >>` 追加（保 U+FFFD）。
- subagent/workflow 只读 + /tmp patch，主 session apply（build/gen-*/commit 串行）。
- 不碰 `.worktrees/`（`.worktrees/r10-harness-goodhart`/`t1-exec-grader`）+ `wayfinder/evaluation/`。
- **不 push**（resync + master 皆 local；§六 + eval 永续）。

## 四、本 session（2026-09-11）workflow 跑了吗？

本 session **跑了 workflow `um-resync-parallel-sweep`**（background，见 task-notification）。下 session 先 `ls /tmp/s3-apply-prep.md /tmp/slint2-summary.md /tmp/lint-resync-wf.txt`：
- **在**（workflow 完 + /tmp 持久）→ 读 + 按 §B apply（translation-zh + UM-LINT triage on resync）。
- **不在**（workflow 未完或 /tmp 清）→ 重跑 `Workflow({scriptPath: "wayfinder/data-agent/workflows/um-resync-parallel-sweep.wf.js"})`（§A）再 apply。

workflow `wra5epycb` 完（2026-09-11，agent 连通 mcp__local__——机制验证 OK）。结果（详见 /tmp）：

**translation-zh `/tmp/s3-apply-prep.md`（591 行）—— 2 blocker（非 S-3 假设的 1）**：
1. `spliceRegion`@`gen-cordis-catalog.ts:920`（非 :747）= **replace-only**（缺 fence → throw `expected exactly 1 cordis-surface region, found 0`）→ 5 `.zh.md` 需 one-time migration helper INSERT `BEGIN/END GENERATED <slug>`（seed empty fenced spans，regen 填）。
2. **`spliceRegion` slug-hardcoded `cordis-surface`**（`line === REGION_BEGIN` 常量 = `<!-- BEGIN GENERATED cordis-surface … -->`）→ 不匹配 5 gen-doc-graphs slugs → **须 companion 改 `gen-cordis-catalog.ts`**：generalize `spliceRegion(content, region, beginMarker?, endMarker?)` cordis-surface 默认（:1102 call site byte-unchanged）gen-doc-graphs 传 per-doc markers；OR gen-doc-graphs 本地 slug-aware splice（task 说 import，故 generalize 优先）。
3. 3a import 补 `rewriteTranslationLinkLocales`（`renderIndex` table `docs/*.md` links 须 zh 侧 `.zh.md`）。
4. scope 更正：event-producer-consumer = **matrix table ONLY（无 mermaid，task hint 错）**；agent-lifecycle = sequenceDiagram mermaid ONLY（4 prose 不 fence）；products = **6 非 8**（5 docs/* + 1 `apps/cli` composition，APP_EXAMPLES 单 `dsh_base`）。
5 slugs：capability-seams / event-producer-consumer / agent-lifecycle / tool-execution-pipeline / graph-atlas。

**UM-LINT `/tmp/slint2-summary.md` + `/tmp/slint2-pairs.txt`（92 findings）+ `/tmp/lint-resync-wf.txt`（764 行 raw）**：
- 92 errors on resync（exit 1，17 unique files）。per-rule：no-unsafe-call 35 / no-unsafe-member-access 23 / no-unsafe-assignment 15 / no-unsafe-argument 6 / no-unsafe-return 4 / no-unnecessary-type-assertion 4 / max-len 2 / unbound-method 1 / no-unnecessary-condition 1 / no-deprecated 1。
- **FP=83/92（90%，no-unsafe-* family，Cordis type-aware inject-d ctx→error-typed binding，集中 `packages/client/ui-*/src/client/`：ui-semantic-layer 18/ui-chat-apply 18/ui-model-selection 12）→ clustered file-level `/* eslint-disable */` 候选**。
- REAL=7（`no-unnecessary-type-assertion` 4 [含 `ctx as never` **勿 auto-strip** + `rows as JsonValue[][]` variance] / `max-len` 2 [mechanical wrap] / `no-deprecated` 1 [`isTypeOnly`→`phaseModifier` migration]）+ BORDERLINE=2（`unbound-method` + `no-unnecessary-condition`，`scripts/gen-architecture-graph.ts`）。
- **disable form 更正**：`// eslint-disable-next-line @typescript-eslint/<rule> -- <reason>`（**非 `typescript/<rule>`**——`apiproxy/api-proxy.ts:3364` stale UM4-rehome 不存于 resync；repo 9 directives 皆 `@typescript-eslint/`；`reportUnusedDisableDirectives: "warn"` on → 须精确落地）。
- per-finding triage 用 `/tmp/slint2-pairs.txt`（92 `file:line:col|rule message`）。

## 五、目标 + 估算

本 session（eval 永续下能做的）：① workflow 产 resync 并行分析（translation-zh prep + UM-LINT raw/summary）②（若 /tmp 在）apply translation-zh + UM-LINT triage on resync ③ p2-* branch-D（master，低风险）④ doc/ticket 记录。**master-sync + push 永久 defer**（eval 永续）。

| 终点 | 估算 | 说明 |
|---|---|---|
| 本 session workflow + apply | ~1 session | resync translation-zh + UM-LINT（workflow 并行分析 + 主 session 串行 apply）+ p2-* branch-D |
| master-sync + push | **永久 defer** | eval 永续 → 撞 git 写；须 eval 能暂停（若 ever）|
| UM 专项其余 | ~10-14 session | ui-settings re-port ~2 + QODER-RETIRE ~1-2 + INVARIANT-CLEANUP ~1 + UM-ADAPT/UM4/CORDIS/UM6/UM12-cron/UM15-cron ~5-6（多需 HITL 决策）|

**关键**：eval 永续不阻塞 resync 并行（无 eval）+ master 低风险串行（index-lock-check）；只永久阻塞 master-sync merge + push。
