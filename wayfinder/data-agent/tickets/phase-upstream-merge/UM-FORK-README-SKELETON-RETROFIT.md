# UM-FORK-README-SKELETON-RETROFIT — 65 fork 包 README 缺 upstream doc-standard skeleton

**Type**: task
**Phase**: upstream-merge
**Status**: open (2026-09-13 从 [UM-C-GATES Cluster D apply](UM-C-GATES-UPSTREAM-NEW.md) 拆出——scope 订正后 Gate 3 从"~10 min WAIVE"变"~1-2 session mass retrofit"，本票承接)
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: [UM-C-GATES](UM-C-GATES-UPSTREAM-NEW.md) 的 `documentation standard tests` KNOWN-RED 转为 GREEN
**Related**: [UM-C-GATES Cluster D grilling 2026-09-13](UM-C-GATES-UPSTREAM-NEW.md#resolution)

## Question

`scripts/doc-standard.spec.ts` 里的两个 failing tests：
- `maps package README kinds to their documentation standards`
- `keeps every package README on the summary, contents, and Dev Note skeleton`

要求每个 `packages/*/*/README.md` 都必须：
1. 有 YAML frontmatter：`kind: <package-group|package-reference|package-library|package-bundle>` + `description`
2. 有 `## Summary` / `## Table of Contents` / `## Dev Note` 三个 headings（英文）
3. zh.md 有对应的 `## 概述` / `## 目录` / `## 开发备注`

**实测（2026-09-13 Cluster D apply session）**：
- 总 package READMEs：**329 个**
- 缺 frontmatter：**65 个**（且经确证多为 fork 独有包）
- Cluster D grilling 原估「~10 min WAIVE」严重低估——真实 mass retrofit 是 65 × 2 = 130 file edits 的机械工作

**Cluster D apply 决策（用户 2026-09-13）**：**KNOWN-RED permanent**，不做 mass retrofit（"按推荐批准 + fork 按需重构 + 1.0 后再发布"原则），单开本票承接。

## Scope

1. 枚举全部 65 个缺 frontmatter 的 fork package README（md + zh.md）
2. 逐个补 YAML frontmatter（`kind` 从 `expectedKind(file)` 推导：group/reference/library/bundle；`description` 一句话本包定位）
3. 逐个补 `## Summary` / `## Table of Contents` / `## Dev Note`（zh: `## 概述` / `## 目录` / `## 开发备注`）
4. 保 zh 双语面同步（`verify-translation-pairing --write` 每个 pair 后）
5. 完成后 `pnpm exec vitest run scripts/doc-standard.spec.ts` GREEN，2/12 → 12/12

**已完成的 sample**（Cluster D apply 期间落地）：`packages/bundle/data-agent/README.{md,zh.md}` 作 correct skeleton 示例。

## 落地策略候选

**A. 一次性 mass retrofit**（~1-2 session）
- 按包组批量处理（llm/embedder/retrieval/query/data/client-ui/subagent…）
- 每包补 frontmatter + 3 sections（内容可留占位符 "TODO: fill in Summary..." 待作者补）
- 目标：Gate 3 一次到 GREEN

**B. 分包组渐进 retrofit**（~5-8 session，每 session 1 组）
- 按 phase-owner 分工（P4-P11 各自 owner 完善自家包 README）
- 每 session 收敛几个到几十个包
- Gate 3 长期红，逐渐减少

**C. Retrofit + tooling improvement**（~2-3 session）
- 加 `scripts/gen-package-readme-skeleton.ts` 自动补骨架
- 一次跑覆盖全 65 包
- 类似 gen-tsconfig-paths 的自维护模式
- 长期防止新增包漏 skeleton

**推荐**：C（工具化 + 一次性）——避免 A 的手工遗漏 + B 的长期红门。

## Acceptance

- `pnpm exec vitest run scripts/doc-standard.spec.ts` 全绿（12/12）
- 65 个 fork 包 README（md + zh.md）都有 frontmatter + 3 headings
- 若走 C：`scripts/gen-package-readme-skeleton.ts` 就位 + spec 增 verify 变体

## Estimated: ~1-2 session (option A) or ~2-3 session (option C)

---

## [2026-09-13] Phase-1 research → Phase-3 apply → Phase-6 decision-doc (generator scaffold LANDED, 130-file run REVERTED — bilingual bug)

Source: `wayfinder/data-agent/research/next-session-2026-09-14/readme-retrofit.json` (high-confidence read-only research) + a 2026-09-13 subagent apply attempt.

### Research findings (VERIFIED)

- **totalReadmes**: 329 at depth 3; **missingFrontmatterCount**: 65 (all depth-4 `packages/*/*/README.md`, VERIFIED; research's 65-figure confirmed — though note: 2 depth-3 GROUP READMEs, `packages/data/README.md` and `packages/eval/README.md`, ALSO lack frontmatter, a small adjacent gap the research's depth-4-focused enumeration missed; actual missing-frontmatter total across all package READMEs = 67).
- All 65 depth-4 packages resolve to `kind: 'package-reference'` (depth-4, no `dsh.bundle.patch`, none in `PACKAGE_LIBRARIES`).
- `expectedKind()` logic (shared with `scripts/doc-standard.spec.ts`): group iff depth≤3; bundle iff `dsh.bundle.patch`; library iff in frozen `PACKAGE_LIBRARIES` set; else reference.
- Descriptions sourceable from each package's `package.json` `description` field (VERIFIED present + non-empty 65/65).
- All 65 already carry `## Model Experience` + `## Known Limitations and Deferred Work` (VERIFIED 65/65) — must preserve.
- All 65 need `## Summary` + `## Table of Contents` + `## Dev Note` inserted (0/65 currently have them).

### Option C chosen — generator built (commit `d62c5c8760`)

`scripts/gen-package-readme-skeleton.ts` built (571 lines), modeled 1:1 on `scripts/gen-tsconfig-paths.ts` (write/`--check` shape). The generator: enumerates depth-4 READMEs, derives kind via shared `expectedKind()`, prepends 2-field frontmatter (description from `package.json`, kind), inserts `## Summary` (TODO placeholder + description) + `## Table of Contents` (auto-anchored from existing `## ` headings) + `## Dev Note` non-destructively, mirrors on `.zh.md` with 概述/目录/开发备注 + `TODO: translate:` markers, write (default) / `--check` modes.

### 🔴 KNOWN BUG — 130-file run REVERTED (16/65 pairs regressed bilingual pairing)

A subagent ran the generator across all 65 packages (130 files). The EN side is SOUND — 49/65 pairs retrofit cleanly. But 16/65 pairs REGRESSED `verify-translation-pairing` (previously-green pairs broke). The run was REVERTED; only the generator scaffold (with a prominent KNOWN-BUG note at the file top) was committed. The generator is intentionally UNWIRED (no `package.json` script, no `run-gates.ts` enrollment, no `gate-coverage.manifest.json` exemption) so it cannot trip a red gate.

**Root cause** (the `hasSummary` idempotency check in `insertSkeleton`): the check tests the ZH body for `^## 概述$`. 16 of 65 target packages already carry `## 概述` as their existing **Overview** heading (the ZH rendering of the EN `## Overview`). For those 16:
- ZH: the check matches `## 概述` → `hasSummary=true` → generator SKIPS inserting the Summary `## 概述`.
- EN: the existing `## Overview` ≠ `Summary` → `hasSummary=false` → generator INSERTS `## Summary`.

The asymmetry leaves ZH one H2 short of EN (ZH 5 vs EN 6) and drops the Overview entry from the ZH TOC → `verify-translation-pairing` fails on heading-count + link-target + list-item-count divergences.

The 16 affected packages (all have an existing ZH `## 概述` Overview heading): `packages/data/{audit,patrol-mode,phase-gate,result-cache-memory,tool-trigger-eval}`, `packages/embedder/{embedder,embedder-fakehash,embedder-http}`, `packages/eval/eval-runner-service`, `packages/goal/{goal-eval-context,goal-eval-policy}`, `packages/llm/llm-dashscope`, `packages/query/{query,query-maxcompute}`, `packages/retrieval/{retrieval,retrieval-inproc}`.

### Why the fix is a DESIGN DECISION, not a one-line patch

The fix is ZH-only. When an existing ZH `## 概述` is the Overview, the generator must:
1. RENAME it to `## Overview` (so a separate Summary `## 概述` can coexist without duplicate slugs), AND
2. rebuild the TOC to include the renamed Overview, AND
3. re-thread the positionally-paired `<a id>` anchors.

OR adopt a different Summary heading word for ZH that cannot collide (but `doc-standard.spec.ts` requires `## 概述` literally for the ZH Summary — so renaming the Summary word would fail the spec).

The rename (概述 → Overview) changes authored ZH heading text from Chinese to English, which needs a grilling call: is a Chinese-facing doc's Overview heading acceptable as English `## Overview` for pairing parity, or should the generator take a different approach (e.g., rename EN `## Overview` → `## Summary` and drop the separate Summary, but then EN fails the `^## Summary$` spec requirement — same tension)?

### Fix options for the follow-up session

- **Option F1 (rename ZH Overview)**: rename existing ZH `## 概述` (Overview) → `## Overview`, insert Summary `## 概述`, rebuild TOC. Makes both sides carry Summary + Overview. Changes authored ZH heading text. Simplest parity.
- **Option F2 (EN-side convergence)**: for EN files whose existing overview is `## Overview` (not `## Summary`), the generator could rename `## Overview` → `## Summary` (consolidating Overview into Summary) and NOT insert a separate Summary — but this loses the Overview section and the `## Summary` rename changes authored EN text. Then ZH keeps its single 概述. Both sides = 1 overview heading. But doc-standard requires `## Summary` literally, so the renamed EN heading satisfies it; ZH's existing 概述 satisfies it. This is the "consolidate, don't add" approach.
- **Option F3 (accept the 16 as manual)**: generator handles the 49 clean pairs; the 16 with existing 概述 Overview are hand-retrofit (insert Summary 概述 + keep Overview, rebuild TOC) in a separate manual pass. Bounded (16 files), avoids generator rework, but doesn't prevent recurrence on new packages with the same shape.

Recommended: F1 (rename ZH 概述 → Overview) — it's the generator's natural fix, makes both languages structurally parallel (Summary + Overview on both sides), and the rename is defensible (the EN side already uses `## Overview` for that section; matching it in ZH increases cross-language consistency). But confirm in a grilling session before wiring + running.

### Acceptance criteria (UNCHANGED, for the follow-up that wires + runs)

- `pnpm exec vitest run scripts/doc-standard.spec.ts` → 12/12 pass (currently 10/12 — the 2 pre-existing failures are this ticket's gap, unchanged by the scaffold-only commit)
- 65 fork package READMEs (md + zh.md) all have frontmatter + Summary/TOC/Dev Note
- `scripts/gen-package-readme-skeleton.ts` wired (`package.json` `gen-`/`verify-` scripts + `run-gates.ts` enrollment + `gate-coverage.manifest.json` exemption for the `gen-` write variant) AFTER the bilingual fix lands
- `verify-translation-pairing` corpus baseline does not regress (the 16 broken pairs must be green)

### Current state (post-this-session)

- `scripts/gen-package-readme-skeleton.ts` committed as an UNWIRED scaffold with a KNOWN-BUG note (commit `d62c5c8760`). EN logic sound (49/65 clean); ZH 概述/Overview collision bug documented.
- `package.json` / `scripts/run-gates.ts` reverted to master (no wiring) — so `verify-gate-coverage` stays green (scaffold invisible, no `package.json` entry).
- 130-file run reverted — `verify-translation-pairing` baseline restored to 21 pre-existing violations (no regressions from this ticket).
- `doc-standard.spec.ts` unchanged at 2 failed / 10 passed (the pre-existing baseline).

---

### [2026-09-14] apply 95% done — F1 implemented, commit 卡 lefthook, 改动 stash@{0}

**状态**：F1 apply 跑了（subagent + 主 session 修），generator fix + 130 README + wiring + depth-3 residual 全 done，verify 全 GREEN，但 **commit 卡在 lefthook pre-commit 3 项** → 改动 stash@{0}（`README-apply-95pct + G13`），master working tree clean。下 session `git stash pop` + 修 3 项 + commit + push。

**已 done（详见 prompts/next-session-2026-09-18-...-um.md 的 [2026-09-14] handoff 节）：**
- F1 5 generator diffs（extractPairPlan overviewCollisionIndices + retrofitPair rename+re-derive + ZH staging + 2 JSDoc）。
- 主 session 修 subagent 的 quality gap：删 dead code（stripSkeleton/stripAnchors，eslint no-unused-vars）+ 加 `MODEL_EXPERIENCE_VARIANTS` 常量（`['Model Experience', '模型体验', '模型经验']`，修 subagent 漏 eval-cli ZH `## 模型经验` 变体 → 90 diverges resolved）+ fix 5 wrong-locale links + 删 eval-cli 孤儿 anchor（changelog code block `<a id="yyyy-mm-dd">` + 错位 `<a id="model-experience">`）。
- wiring（package.json 2 scripts + run-gates.ts:759 enroll + gate-coverage.manifest.json gen- exemption + 删 generator UNWIRED/KNOWN-BUG note）。
- 130 README run（65 EN + 65 ZH）+ 70 i18n re-record + 4 depth-3 group frontmatter（data/eval × {md,zh.md}，kind:package-group）。
- subagent 额外 fix：Dev Note 位置（insertSkeleton 放 Dev Note 在 Model Experience 前，满足 verify-package-readme-model-experience 的 "final two H2" 规则）+ graft console.warn。

**verify 全 GREEN（commit 前）：** doc-standard 10/12→**12/12** ✓ + corpus pairing 21→**20**（-1 wrong-locale fix）✓ + idempotent（2nd run "0 current"）✓ + --check gate exit 0 ✓ + 64/65 README pairs consistent（eval-cli 1 pre-existing content gap，已删 anchor fix）✓ + verify-package-readme-limitations 329 conform ✓ + verify-gate-coverage green ✓。

**commit 卡 lefthook 3 项（下 session 修）：**
1. **lint `typescript(no-unnecessary-condition)`**：`MODEL_EXPERIENCE_VARIANTS.includes(heading)` 类型 narrow（heading:string vs readonly string[]，TS 推断 always-true）。修：`MODEL_EXPERIENCE_VARIANTS.indexOf(heading) >= 0` 或 `(MODEL_EXPERIENCE_VARIANTS as readonly string[]).includes(heading)` cast。
2. **eval-cli i18n.yaml out-of-sync**：删 anchor 后 content 变了，hash stale。修：`pnpm run verify-translation-pairing --write packages/eval/eval-cli/README.md`（re-record）。
3. **docs i18n.yaml hook 副作**：lefthook pre-commit 的 translation pairing hook re-record 了 `docs/config-catalog.i18n.yaml` + `docs/subsystems/README.i18n.yaml` + `docs/tool-catalog.i18n.yaml`（staged 触发 corpus 检查 → config-catalog/tool-catalog pre-existing structural diverge → hook fail）。修：unstage docs i18n（`git reset HEAD docs/{config-catalog,subsystems/README,tool-catalog}.i18n.yaml`，不 commit hook 副作）—— 它们是 corpus re-record 副作用，非 README apply。

**已知 quality issue（非 commit 阻塞，下 session generator polish）：**
- Dev Note 顺序 bug：generator 把 TOC 放 Summary 前（EN+ZH 都这样，pairing consistent 但阅读体验差）。
- anchor threading：eval-cli 孤儿 anchor 已删，但 generator `insertAnchorsBeforeHeadings` ZH flow order 可能对其他包有 latent bug（corpus 20 显示只 eval-cli 受影响）。

**蓝图（committed master `485caad34a`）：** `research/next-session-2026-09-18/readme-fix-F1.json`（winner 5 diffs + runPlan 11 步 + applyRisk）+ `readme-fix-judge.json`（verdict）。

**stash**：`git stash list` → `stash@{0}: On master: README-apply-95pct + G13 (lint-1err + eval-cli-re-record pending)`。

下 session：`git stash pop` → 修 3 项 → `git add`（generator + 130 README + wiring + 4 group + sidecars，**排除** docs i18n.yaml + G13）→ commit → push A-path（从 dsh-resync）→ PR → merge。然后 Step 2-4（LINT-B + §2 + §4）。
