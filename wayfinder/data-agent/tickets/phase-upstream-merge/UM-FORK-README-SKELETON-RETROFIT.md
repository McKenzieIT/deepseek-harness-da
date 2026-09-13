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
