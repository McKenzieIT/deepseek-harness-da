# Next-session prompt — UM-flow Phase C 续：subagent 扫票结果收定 + 线D 已落 resync；translation-zh (Cordis region-splice) apply + UM-LINT re-triage + p2-* del + master-sync merge 待做

> 承接 `next-session-2026-09-19-subagent-ticket-sweep.md`（已执行完）。**线D 已 DONE**（commit `c2623c84eb` on resync `upstream/resync-2026-09-08`，5 files，lefthook pre-commit 绿）。**4 stale 前提证伪**（methodology law §四 vindicated 4/4：UM12 无 literal L6 patch / 线D on resync 非 master / translation-zh 前提错 / UM-LINT 93≠0 on resync）。translation-zh 方向用户锁定 = **Cordis region-splice**；apply + UM-LINT re-triage + p2-* del + master-sync merge 皆 deferred（apply 是 focused session 量 + bootstrap 待验；p2-*/master-sync gated on eval session 收定）。

## 一、本 session 已做（已核）

- **线D DONE**（commit `c2623c84eb` on resync `7a20c4cb0a`→`c2623c84eb`）：`git rm knip.json` + `packages/client/connection/tests/fake-api.client.ts`；`scripts/rescope-fork.ts` 删 `knip-ignore-dependencies-pattern` transform（262-268）；`scripts/rescope-fork.spec.ts` 删 `it('knip ignoreDependencies expect=4')` block（132-139）；`scripts/verify-application-entrypoints.ts` +1 `MANIFEST_BIN_ALLOWLIST`（`packages/eval/eval-cli/package.json` → `{ 'dsh-eval': './lib/bin.js' }`）+9 `EXECUTABLE_SOURCE_ALLOWLIST`（eval-cli bins + query-maxcompute/dev 5 + query-tool/dev）。Gates：`verify-application-entrypoints` ✓(10→0)、`typecheck` ✓（`tsc -b tsconfig.client.json`+build exit 0）、`constraints` pre-existing-red 0-new（全 package.json version-sync Tier C，与 线D script/test/config 编辑无重叠）、`rescope-fork.spec` vitest ✓（13 tests）。**apply on resync 非 master**——master `fc917a55d4` pre-merge（behind 2773）无 `verify-application-entrypoints.ts`/`api/session-controller/tests/fake-api.client.ts`/clean `package.json`（knip script/devDep/hygiene 仍在）。
- **Wave 1（S-D/S-LINT/S-3）+ Wave 2（S-p2/S-master）** 5 subagent 只读分析完（皆 mcp__local__ probe-first + /tmp 增量写）。

## 二、4 stale 前提证伪（methodology law §四 vindicated 4/4）

1. **UM12 无 literal L6 patch**：ticket 只 summary（"application entrypoints (10)" line 291 / "12 条 allowlist" line 143 stale pre-zombie-deletion）；prompt "UM12 有精确 patch" 未验证。S-D 独立 derive 10 entries（replicate gate logic on resync：shebang-scan + package.json-bin-scan minus 16 allowlisted minus lib/dist/coverage/node_modules）+ reconcile UM12 count exactly（1 MANIFEST_BIN + 9 EXECUTABLE_SOURCE）。
2. **线D on resync 非 master**：items 1-3（线D/UM-LINT/translation）= **resync tree** `/Users/mckenzie/workspace/dsh-resync`（tip `7a20c4cb0a`→`c2623c84eb`，post-merge content，无 eval session，prior UM cleanups `5ee128214d`/`63659a22d4`/`03e865a148`/`d0f152ba32` 皆落此）；items 4-5（p2-*/master-sync）= master tree（eval session 活跃 index.lock alert）。master `fc917a55d4` pre-merge 无 post-merge 文件。
3. **translation-zh 前提错**：`gen-module-graph.ts` 不 emit md/zh/i18n trio（只英文 `docs/module-graph.md`；`.zh.md` 人工审校；`.i18n.yaml` 由 `verify-translation-pairing --write` 写）。真 zh 参考 = `gen-cordis-catalog.ts` region-splice。**8 products 非 6**（5 in-corpus `docs/*` + 3 out-of-corpus `apps/cli`+`examples/headless-agent`+`examples/acp-agent` composition；只 5 进翻译语料 `isTranslationSource`=README+docs/）。`.i18n.yaml` schema = 双语对一致性记录（`<basename>.md: <40-hex git-blob-hash>` + `<basename>.zh.md: <40-hex>`，`renderPairMeta` from `scripts/translation-pairing.ts` 写）非 title/description/nav。
4. **UM-LINT 93≠0 on resync**：`pnpm run lint:contracts-ready`（= `tsx scripts/run-oxlint.ts .` w/ `.oxlintrc.json`，repo 真 config）on resync = **0 warnings 92 errors**（exit 1，"Finished in 34.8s on 3813 files with 90 rules"）。S-LINT 的 "0 on master" 是 wrong-tree artifact（master pre-merge + 可能 config-less `oxlint . --type-aware`）。option-A（store→EngineStoreHandle migration 修 type-aware resolution）**未在 resync 落地**——`ctx as never` 仍在 `components.client.spec.tsx:203`/`provider-form.client.spec.tsx:155`。re-triage on resync needed。

## 三、当前状态（已核）

| 项 | 值 |
|---|---|
| origin/master | `607868e6a0`（PR #115 merge）|
| resync `upstream/resync-2026-09-08` | `c2623c84eb`（线D on `7a20c4cb0a`，local-only，**unpushed**）|
| master | `fc917a55d4`（on `f3e46b3f20` eval R20 probe，ahead 2/behind 2773，**unpushed**；eval session 活跃）|
| 线D gates | verify-application-entrypoints ✓ / typecheck ✓ / constraints pre-existing-red 0-new / rescope-fork.spec ✓ |
| UM-LINT | 92 errors on resync；NOT auto-resolved；S-LINT triage invalid（wrong-tree 0）|
| translation-zh | 方向锁定 Cordis region-splice；apply 待做（spliceRegion:920 bootstrap 待验）|
| p2-* | S-p2：3 del（fully absorbed）/ 2 keep（residual）；del gated on eval |
| master-sync | S-master：merge-base `1ef40edaee`，clean（`git merge-tree --write-tree` exit 0），MERGE 方案，gated on eval |

## 四、⚠ 铁律（不变）

mcp__local__* only（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；`mcp__local__grep` 不可靠 → `grep -rEn` in `mcp__local__bash`；`rg`/`grep -P` 不存在（BSD grep）；node v24 强制（`export PATH="/usr/local/bin:$PATH"`，v24.15.0；v25 crash tsdown）；shell `sh` 非 bash（无 `<(...)`，temp files + `sort`/`comm`，commit `git commit -F <file>`）；subagent 只读 + /tmp patch，主 session apply（build/gen-*/commit 串行）；runner flaky（短 bash，单 write_file，长内容写 /tmp 再短 bash，断后先 `echo x` probe）；resync 树 `/Users/mckenzie/workspace/dsh-resync`（items 1-3 code，无 eval）；master 树 `/Users/mckenzie/workspace/deepseek-harness-da`（docs + p2-* + master-sync，eval 活跃 index.lock alert——commit 前 `[ -f .git/index.lock ]` 核，pathspec-limited `git commit <paths>`）；不 push（§六）；map.md 13 U+FFFD → byte-splice（node `fs.readFileSync` Buffer + `indexOf` + `Buffer.concat` + `writeFileSync`，禁 `edit_file`）；不碰 `.worktrees/` + `wayfinder/evaluation/`。

## 五、待做（按优先级；皆 resync 或 gated）

### A. translation-zh apply（Cordis region-splice，用户 2026-09-11 锁定）—— resync tree
按 S-3 plan（`/tmp/s3-patch.md` 若 /tmp 持久；要点见下，自含）改 `scripts/gen-doc-graphs.ts`：
- **3a imports**（gen-doc-graphs.ts:8 后）：+ `import { blobHash, partitionGeneratedRegions, renderPairMeta } from './translation-pairing.ts'` + `import { maybeRecordPair, spliceRegion } from './gen-cordis-catalog.ts'`（皆已 `export function`；gen-cordis-catalog main 有 entry-point guard，import side-effect-free）。
- **3b fence-wraps**（5 render fns）：`renderCapabilitySeams`(:744 mermaid+services table)、`renderEventRelations`(:1296 mermaid+producer/consumer matrix)、`renderLifecycle`(:1343 turn/step mermaid ONLY，prose 不 fence)、`renderToolPipeline`(:1427 pipeline mermaid ONLY)、`renderIndex`(:1505 `| Graph | Mode |` index table ONLY，intro prose 不 fence)——结构区域包 `<!-- BEGIN GENERATED <slug> -->`/`<!-- END GENERATED <slug> -->`。**⚠ 需先读各 render fn 拿 verbatim old**（S-3 给 representative shape 非 verbatim；partitionGeneratedRegions 要求 well-formed markers，BEGIN/END slug 配对，否则 throw）。不 fence `renderAppComposition`（products 6-8 不 pair）。
- **3c main() rewrite**（gen-doc-graphs.ts:1553-1571）：+ `const PAIRED_DOCS = new Set([...5 docs/*])`；write loop 加 splice zh（`for (const region of partitionGeneratedRegions(doc.content).regions) zhNext = spliceRegion(zhNext, region)`，仅 `existsSync(zhAbs)` 时；不 create zh from scratch——cordis rule，缺 zh 则 gate 报 "missing" 等人工 author + `--write`）+ `if (maybeRecordPair(doc.rel, before)) records++`。3 composition files 不 pair。
- **3e bootstrap（⚠ 待验）**：**先读 `spliceRegion`（`scripts/gen-cordis-catalog.ts:920`，非 S-3 说的 :747）** body 确认 insert-if-absent（首 regen 进 fence-less zh 文件）。若只 replace existing fenced pairs → 需 one-time migration helper 先 insert `BEGIN/END GENERATED` fences 进 5 个 `.zh.md` 文件（cordis subsystems pages 曾同样 bootstrap）。
- regen `pnpm run gen-doc-graphs`（8 md + 5 zh-splice + 5 i18n-refresh = 18 touches）+ `pnpm run verify-translation-pairing`（structured-only regen → **GREEN**——maybeRecordPair 见 prose 字节不变 → 一次刷新两侧 hash；prose change → **RED** by design，人工翻译后 `--write`）+ `pnpm run verify-md-links`。commit on resync `[wayfinder] 线3: gen-doc-graphs zh emission (Cordis region-splice, UM-QODER-RETIRE 前置)`。
- **⚠ 不半做**：partial apply（3a/3c 无 3b）= `verify-translation-pairing` RED（English 无 fence → partitionGeneratedRegions regions 空 → maybeRecordPair 见整文件 prose 变 → 不 refresh → .i18n.yaml stale）。full apply 或 no apply。

### B. UM-LINT re-triage on resync —— resync tree
`lint:contracts-ready` = 92 errors on resync（`no-unsafe-call`~35/`no-unsafe-member-access`~23/`no-unsafe-assignment`~15/`no-unsafe-argument`~6/`no-unnecessary-type-assertion`~5/`no-unsafe-return`~4/`max-len`~2/...，85/92 是 Cordis `no-unsafe-*` family）。S-LINT `/tmp/slint-triage.md` 有 disable-directive form（`// eslint-disable-next-line typescript/<rule> -- <reason>`，repo 认 `packages/host/apiproxy/src/api-proxy.ts:3364`；file-level `/* eslint-disable */` alternative for clustered）+ dominant rules 但**无 valid per-finding triage**（S-LINT saw 0 wrong-tree）。**重派 subagent on resync**：`cd /Users/mckenzie/workspace/dsh-resync && pnpm run lint:contracts-ready > /tmp/lint.txt 2>&1` 拿 92，逐条 FP/real，FP 给 disable-directive（精确行 + 理由），real 归修复票。**⚠ `ctx as never`（`no-unnecessary-type-assertion`，`components.client.spec.tsx:203`/`provider-form.client.spec.tsx:155`）= 语义改动，ticket 警告勿 auto-strip**；`max-len` 机械 wrap；`no-deprecated` 需 API migration。主 session apply disable-directives（resync，typecheck/lint 复验，commit）。

### C. p2-* delete（gated on eval session 收定）—— master tree
S-p2（`/tmp/sp2-analysis.md` 若持久）：3 **del**（fully absorbed into `eb9e4cf05c`，字节一致，**非 ancestry 判**——Phase-2 是 cherry-pick/squash 收编，`merge-base --is-ancestor` 一律 false）：`refactor/p2-present-decomp-2026-09-12`（5/5）、`refactor/p2-suggest-followups-2026-09-12`（5/5）、`refactor/p2-uism-layer-2026-09-12`（10/10）。2 **keep**：`refactor/p2-present-table-2026-09-12`（4/5 absorbed，residual `table-card.client.spec.tsx` 加 `callView: null`）、`refactor/p2-uism-vitest-2026-09-12`（1/6 absorbed，5 test files 残留——`apply`/`components`/`provider-form`/`store`/`welcome-notice.client.spec.*`，ui-settings-models vitest-debt **未收编**，`eb9e4cf05c` scope 只含 4 presenter Plan-B migration）。**eval session 收定后**逐个 `git branch -D <ref>`（⚠ 先 re-confirm absorption——master tip 可能已动；不可批量；per-branch commit）。

### D. master-sync merge（gated on eval session 收定）—— master tree
S-master（`/tmp/smaster-plan.md` 若持久）：merge-base `1ef40edaee`（wayfinder 09-18 doc，divergence point）。master 2 ahead = `f3e46b3f20`（eval R20 probe，1 file `wayfinder/evaluation/tickets/R20-judge-readout-probes.md` +4——**非 prompt 猜的 research 文件**）+ `fc917a55d4`（map/UM11/UM-flow 纯插入 +23，msg body 交叉引用 `f3e46b3f20` hash）。behind 2773 = origin/master PR #115 merge `607868e6a0`（Merge `e064933dc8`+`7a20c4cb0a`）。**clean**（`git merge-tree --write-tree origin/master master` exit 0，tree `0d5480e86764…`，无冲突——prompt 的 "map.md conflict" 证伪：origin 21-doc take-theirs 没 touch master 4 ahead files，皆纯插入 on byte-identical-to-merge-base → trivial clean 3-way）。**MERGE** `origin/master` into master（merge commit，no FF；保 `f3e46b3f20`/`fc917a55d4` hash——commit msg 交叉引用，rebase 会 rewrite stale；robust to eval 再推；fork integration-branch 模式 consistent）。eval session 收定后 apply：re-run `merge-tree --write-tree` re-confirm clean → `git merge origin/master` → 若 eval 改了图景，wayfinder doc 冲突 take-theirs（09-09..09-17 local newer win）+ code auto-merge。**push 须用户明确指示**（§六）。

## 六、本 session 不做（同前 + 新增）
- 不 push（resync `c2623c84eb` + master 皆 local；§六）。
- 不碰 `.worktrees/` + `wayfinder/evaluation/` + master `.git/index.lock`。
- 不删 p2-* 除非 eval session 收定 + re-confirm absorption。
- 不 force-push。
- translation-zh apply 不半做（partial = verify-translation-pairing RED）。
- UM-LINT 不 auto-strip `ctx as never`（语义改动）。
- map.md U+FFFD（13）禁 edit_file → byte-splice。
- subagent 不跑 build/gen/commit。

## 七、map/ticket 更新（Phase 3 收尾）
- map.md Decisions-so-far：本 session 已 byte-splice 加 线D line（`- **线D post-merge cleanup (task, resolved 2026-09-11)**...`，FFFD=13 不变）。
- 待更新 ticket（可本 session 余量或下 session）：UM12（线D done + UM12 无 literal L6 patch stale + tree=resync）、UM-MERGE-INTEGRITY（knip/fake-api zombies cleaned）、UM-GEN-DOC-TRANSLATION-OBLIGATION（premise false + Cordis region-splice 锁定 + spliceRegion:920 待验）、UM-LINT-TYPEAWARE-CORDIS（92 reproduce on resync + S-LINT wrong-tree + re-triage 待）、UM11（p2-* 3del/2keep + master-sync merge plan clean，皆 gated on eval）。

## 八、遗留审计 + session 估算
**11 门红**（36/11，零新增——线D 清 C5 entrypoints 10→0 + knip/fake-api 僵尸；constraints pre-existing-red 0-new）。剩：A4 pre-existing（runtime-closure/constraints/export-jsdoc/translation-pairing）+ B2 known-red（type-equiv→UM-QODER-RETIRE / package-invariants→UM-INVARIANT-CLEANUP）+ C5 upstream 新门（i18n 98/deps 74/subsystem-pages 5/doc-standard；entrypoints 10 已清）。

| 终点 | 估算 | 说明 |
|---|---|---|
| translation-zh apply + UM-LINT re-triage | ~1 session | A（gen-doc-graphs cordis-splice + regen + verify）+ B（92 triage on resync）|
| p2-* del + master-sync merge | ~1 session（gated on eval）| C（3 branch del）+ D（merge origin→master）|
| UM 专项完美结束 | ~10-15 session | 剩 ui-settings re-port ~2 + UM-ADAPT/UM4/CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT sprint ~1-2 + QODER-RETIRE ~1-2（zh 后）+ INVARIANT-CLEANUP ~1 + UM15 cron ~1 + UM6 ~1 |

**关键不确定**：① spliceRegion:920 insert-if-absent（决定 translation-zh apply 要不要 migration helper）② eval session 何时收定（决定 p2-*/master-sync）③ UM-LINT 92 FP 比例（决定 re-triage 工作量）④ runner flaky 程度。
