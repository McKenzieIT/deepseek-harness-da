# GA-CL-batch — 18 条 CL 清理（通用性审计）

**Type**: cleanup (batch)  ·  **Phase**: misc  ·  **Status**: Resolved (9 of 18 this batch — CL1/3/4/6/8/10/12/14/18; 9 folded to G tickets; CL8 resolved (3/3 sites — round 5: eval-cli done))
**Source**: [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) §C — 15 medium + 3 low

批量 CL 清理（按文件分组，建议合并到相关 G 票分支一起做）：

| # | 文件:line | 问题 | 修复 |
|---|---|---|---|
| ✅ CL1 | semantic-layer/src/index.ts:339 | getRelationGraph 单条悬挂引用即抛 | skip+warn；收集到 health-check |
| CL2 | eval-cli/src/compare.ts:76 | classifyCase k11v2 子串分桶 | 从 case dimensions 取 |
| ✅ CL3 | eval/src/text_sim.ts:23 | char-trigram 阈值 0.35 不可注入 | 可注入 opts + 英文 word-level 预设 |
| ✅ CL4 | nl2sql-engine/src/bm25-linking.ts:72; tool-search-data-sources/src/index.ts:303 | tokenizer 丢日文 kana | CJK regex 加 hiragana/katakana |
| CL5 | semantic-layer/src/enrichment.ts:118 | mergeRefs '确定性' 前缀判定 | 加结构化 source 字段 |
| ✅ CL6 | phase-gate/src/index.ts:70 | scopeId 默认 'game-1' | 默认中性或必填 |
| ~~CL7~~ | ~~apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24~~ | ~~B preset 默认 'per-game' persona~~ | ~~→ absorbed by [GA-GT5](GA-GT5-domain-injection-seam.md) (ctx.domain seam)~~ |
| ✅ CL8 | llm-wiring-plugin.ts:36; expand-query.ts:27; eval-cli/main.ts:65 | LLM 默认 Qwen/DashScope 无 fail-loud | 集中部署 config + fail-loud |
| CL9 | nl2sql-engine/src/conventions.ts:33 | renderConventionsPrompt 中文段头 | 段头抽 locale bundle |
| ✅ CL10 | tool-suggest-followups/src/index.ts:63 | '≤8 中文字符' 约束 | locale-neutral '≤~20 chars' |
| CL11 | phase-gate/src/phase-gate.ts:118 | INTERPRETATION 中文 marker | locale-configurable 或中性符号 |
| ✅ CL12 | tool-load-event-definition/src/index.ts:354 | '埋点' gloss | 'instrumented event' |
| CL13 | eval/eval/cases/generate-k11.mjs | K11-only case 生成器 | 文档化 + scope-agnostic 模板 |
| ✅ CL14 | semantic-layer/src/snapshot.ts:173 | snapshot 缓存无界 | LRU / scope 移除清理 |
| CL15 | eval-cli/src/context.ts:221,375 | 重复中文扩展 prompt + [粒度] | 引用单一源 + localize |
| CL16 | nl2sql-engine/src/engine.ts:109; stand-in-odps.ts | OdpsExecutor 命名 | 重命名 SqlExecutor |
| CL17 | nl2sql-engine/src/index.ts:29; prompt.ts:18 | EngineConventions leaky import | 移入抽象 dsh-query 包 |
| ✅ CL18 | client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:23 | B→A autoFlipThreshold=3 不可配 | 暴露 host config |

**关联**（fold 进 G 票）: CL5/CL9/CL11/CL15 → GA-GRILL2；CL16/CL17 → GA-GT2；CL2/CL13 → GA-GT4；CL7 absorbed by GA-GT5。CL4/CL10/CL12 本 batch 已做（见 Resolution，不 fold）。**CL15 gap**（Round 3 发现）: 关联行原漏 CL15——已补登 CL15→GRILL2；GRILL2 票正文未记 CL15（`eval-cli/src/context.ts` 是 WIP，GRILL2 griled→resolved 时未覆盖）；需 WIP 落地后开 I18N 子票覆盖（见 Round 3）。

---

## Resolution (2026-09-01)

Committed: `fix(data-agent): CL-batch cleanups (CL1/3/4/6/8/10/12/14/18) from generalization audit`.

**Verification**: `npx tsc -b --force tsconfig.host.json` adds **0 new errors** (1 pre-existing WIP error in `packages/query/query-maxcompute` `maxc-args.mjs` TS7016, not this batch). Affected vitest (9 packages) green for the batch — 6 `phase-gate` `ctx.get is not a function` failures + `k11-cases` missing-`cases/k11`-dir suite-fail are pre-existing (WIP/env, confirmed via stash baseline). `pnpm verify-cordis-config` 3 failures are pre-existing (missing `tsconfig.base.json` path mappings for `dsh-evidence-query`/`dsh-client-ui-present-*`/`dsh-client-ui-suggest-followups` — packages this batch didn't touch; config files unmodified). oxlint adds **0 new errors** (7 pre-existing remain in committed/WIP code). A code-review subagent pass found **0 correctness bugs**.

- ✅ CL1 — `getRelationGraph` skip+warn dangling domain→concept refs (no throw) + `getDanglingDomainRefs()` health surface; valid-asset path unchanged. +2 `relation-graph.spec.ts` tests. tsc green; tests green.
- ✅ CL3 — `DERAILMENT_THRESHOLD` injectable via `TurnMatchOpts` (default 0.35 preserved, backward-compatible) + `ENGLISH_DERAILMENT_THRESHOLD` (0.55) / `derailmentThresholdFor()`; sole caller `session.ts` unchanged. +5 `text_sim.spec.ts` tests. tsc green; tests green.
- ✅ CL4 — CJK tokenizer regex broadened to hiragana (぀-ゟ) + katakana (゠-ヿ) in `bm25-linking.ts:tokenize` + `tool-search-data-sources:extractQueryTerms` (both regex sites); tokenizer architecture untouched (GA-GRILL2). +2 new kana spec files. tsc green; tests green.
- ✅ CL6 — `scopeId` default `game-1`→`default` (index.ts + phase-gate.ts + domain.ts) + game-specific docstrings neutralized; runtime behavior unchanged. +2 `phase-gate.spec.ts` Config-default tests. tsc green; tests green.
- 🟡 CL8 — **partial (2/3 sites)**: `llm-wiring-plugin.ts` + `expand-query.ts` fail-loud (`enrichment-llm-wiring: no provider/model configured`) via a shared `ENRICHMENT_LLM_PROVIDER`/`ENRICHMENT_LLM_MODEL` env contract duplicated locally in each file (no new cross-package dep); expand-query call-site catches the throw → degrades to the original query + `console.warn`; runtime-LLM graceful-degradation preserved. +2 spec files. **eval-cli/main.ts site DEFERRED** — its `--provider`/`--model` is the eval *responder* (model under test + SQL judge), not the enrichment LLM; fail-louding it breaks the committed `main.spec.ts` "loads and runs with fake key" smoke test (which assumes the silent `aga`/`qwen3.7-max` default), and that test is WIP-modified (path updates) so it can't be cleanly fixed without entangling WIP into this commit → reverted eval-cli to its committed defaults. tsc green (enrichment sites); eval-cli unchanged.
- ✅ CL10 — `tool-suggest-followups` "≤8 中文字符" → locale-neutral "≤~20 characters / ≤4 words" (tool description + `label` param description). tsc green; tests green.
- ✅ CL12 — `tool-load-event-definition` "埋点" gloss → "instrumented event" (comment + tool description). tsc green; tests green.
- ✅ CL14 — `_snapshotCache` bounded with `SNAPSHOT_CACHE_MAX=64`; eviction is branchless (`delete(oldest as string)`, no unreachable coverage gap — the just-set root is always at the insertion-order tail, so the head is a distinct key). +1 `snapshot.spec.ts` eviction test. tsc green; tests green.
- ✅ CL18 — `autoFlipThreshold` + `layoutMode` exposed as client-plugin `Config` fields (schemastery `z.union(['B','A','auto'])` + `z.number()`), threaded `apply`→`injected()`→`SemanticLayerShell`→`computeEffectiveMode`; `computeEffectiveMode` stays pure. +2 `useLayoutMode.client.spec.ts` tests. tsc green (per-pkg + client); tests green.

### Follow-ups (out of this batch — open tickets as needed)

- **CL8 eval-cli site** — needs responder-specific config (not `ENRICHMENT_LLM_*`) + `main.spec.ts` smoke test updated once the WIP lands. Recommend a follow-up ticket.
- **CL18 `apply()` config-override branches** — untested; `apply()` was already uncovered pre-batch (no test calls it), so not a new regression; the new behavior is covered at `computeEffectiveMode` level. Full `apply()` coverage is a separate effort.
- **CL8 expand-query call-site typeless catch** (code-review finding 7) — functionally correct today (only the resolver throws), but a future non-config throw would be mislabeled with the config message. Consider narrowing (`e.message` check before degrading).
- **Pre-existing failures NOT from this batch** (awareness only): `verify-cordis-config` 3 errors; `query-maxcompute` `maxc-args.mjs` TS7016 (WIP); `phase-gate` 6 `ctx.get` test-stub failures; `k11-cases` missing `cases/k11` dir; 7 oxlint errors in committed/WIP code.

---

## Round 2 — skeptic + coverage verification (2026-09-01)

Follow-up commit after `3f658a96df`, addressing the adversarial review (skeptic subagent) + full `vitest --coverage` findings.

**Skeptic review** (`.tmp/cl-batch/skeptic.md`): **6/9 CLs confirmed-resolved** (CL1/4/6/10/12/14 ✅). 5 of the first code-review pass's 7 findings were stale (already fixed in `3f658a96df`). Found **4 real coverage gaps + 1 latent bug** — all fixed this round:

- **CL3** `derailmentThresholdFor` `hasSpace && !isLatin` branch → +1 test (`'收入 最高'` / `'1 2 3'` → 0.35).
- **CL8** resolver `!provider || !model` partial-config sub-branches (×2 sites: expand-query + llm-wiring) → +4 partial-config tests.
- **CL8** expand-query call-site typeless `catch` → narrowed: config errors degrade+warn, others re-throw (no future mislabel).
- **CL18** `apply()` `??` branches (index.ts was 0%-covered pre-existing GUI debt) → +`apply.client.spec.ts` (mock ClientContext, capture `injected()`, assert config threading + defaults). CL18 now behavior-tested; index.ts 整体 0% 仍是预存 GUI debt (separate effort).
- **Q4 committed lint**: `text_sim.ts` 4× `String()` removed; `llm-wiring-integration:59` cleanup arrow braced (no-confusing-void-expression). tool-search `index.ts:627` `as SchemaCorpusSource | undefined` **left as-is** — removing it (fix 5c) let `schema` widen to `any` and introduced `no-unsafe-argument` at :648/:649 (net-negative: -1 unnecessary-assertion, +3 unsafe-argument); the assertion is load-bearing for narrowing.

**Coverage** (`vitest --coverage` on semantic-layer + ui-semantic-layer): CL14 `snapshot.ts` + CL1 `index.ts` new branches covered (no new uncovered); CL18 `apply()` `??` now covered. semantic-layer + ui-semantic-layer per-file 100% gate was already <100% pre-batch (pre-existing GUI debt — other `ui-*` `src/client/index.ts` are excluded with `TODO(gui)`, ui-semantic-layer is not) — not introduced by this batch.

**Verification**: 4 packages `tsc --noEmit` green; 41 affected tests green (text_sim 23, expand-query-config 7, llm-wiring-integration 9, apply.client 2); staged oxlint 0 new errors (1 pre-existing `no-unnecessary-type-assertion` at tool-search index.ts:631 `retrieval` — type-aware, staged hook `typeAware:false` doesn't flag).

**Q2 follow-up ticket**: [GA-CL8-eval-cli-responder-config.md](GA-CL8-eval-cli-responder-config.md) — CL8 eval-cli site (responder config, not enrichment; needs WIP `main.spec.ts` update once WIP lands).

---

## Round 3 — pre-existing CI debt cleanup (parallel subagents, 2026-09-01)

Follow-up commit after `fa074093cb`. Addressed pre-existing (non-batch) CI failures that were safe to fix (committed files, no WIP touch). 4 parallel subagents (file-independent, per-pkg verification, no WIP):

- **phase-gate `ctx.get` 6 failures** (pre-existing test-stub gap, not CL6): `gate()` helper's fake ctx had no `.get` → `buildSqlConventions` threw in GENERATION onAssemble. Fix: +`get: () => undefined` to the fake ctx (buildSqlConventions tolerates undefined schema → emits default conventions string). Only `tests/phase-gate.spec.ts` touched (+8 lines); source `phase-gate.ts` untouched. **6 failures → 0 (100 passed)**.
- **k11-cases ENOENT** (pre-existing; WIP renamed k11→k11-v2 but committed spec still pointed at `cases/k11`): k11-v2 is an **evolved** case set (not a rename), so fix updated path + filter (`k11_`→`k11v2_`) + assertions to match v2 actuals (count 161→168, case_id regex, intent set 7→8, skip 10 voice cases' empty `covered_assets`). Only `tests/k11-cases.spec.ts` touched. **ENOENT → 6 passed**. 2 review points flagged for case author (10 voice empty-assets; v2 intent taxonomy change).
- **ui-semantic-layer `client/index.ts` 0% coverage** (pre-existing GUI debt): other `ui-*` `src/client/index.ts` are in `vitest.config.ts` coverage.exclude with `TODO(gui)`; ui-semantic-layer was missing (consistency gap). Fix: +1 exclude line. `index.ts` no longer flagged. (`SemanticLayerShell.tsx` etc. still 0% — separate effort, not excluded.)
- **G-ticket fold audit** (read-only): 5/9 CLs explicitly referenced in G tickets (CL2/CL13→GT4, CL16/CL17→GT2, CL7→GT5); 3/9 semantic match no CL# (CL5/CL9/CL11→GRILL2, covered by GA-I18N-1/5); **1/9 CL15 "folded to nowhere"** — was not in `GA-CL-batch.md` 关联行 AND not in GRILL2 ticket (CL15 = `eval-cli/src/context.ts:221,375`, a WIP file; GRILL2 griled→resolved without covering it). 关联行 corrected above to add CL15→GRILL2; CL15 needs an I18N sub-ticket once `context.ts` WIP lands.

**Verification**: phase-gate + eval/eval `tsc --noEmit` green; phase-gate 100 passed (was 6 failed|94 passed); k11-cases 6 passed; ui-semantic-layer coverage `index.ts` no longer flagged; staged oxlint (`.oxlintrc.staged.json`) 0 errors; WIP untouched.

**Deferred (WIP-touched or root-config, not this round)**: query-maxcompute `maxc-args.mjs` TS7016 (WIP); CL8 eval-cli (WIP `main.spec.ts` — ticket opened); CL15 I18N sub-ticket (WIP `context.ts`); tool-search index.ts:631 `as` (load-bearing — removing introduces `no-unsafe-argument`, same as :627); cordis 3 `tsconfig.base.json` path mappings (root config, full-repo `tsc -b` verification — done serially as Round 4).

---

## Round 4 — cordis tsconfig path mappings (serial, 2026-09-01)

Fixed the 3 pre-existing `verify-cordis-config` errors (missing `tsconfig.base.json` path mappings — packages this batch didn't touch, committed config; the errors said "add a mapping so the tsx source launch does not depend on built lib/"). Added 4 paths mappings to `tsconfig.base.json` (after `dsh-attachment/types`):

- `@deepseek-ai/dsh-evidence-query/src/gateway.ts` → `./packages/data/evidence-query/src/gateway.ts`
- `@deepseek-ai/dsh-client-ui-present-decomposition` → `./packages/client/ui-present-decomposition/src/index.ts`
- `@deepseek-ai/dsh-client-ui-present-table` → `./packages/client/ui-present-table/src/index.ts`
- `@deepseek-ai/dsh-client-ui-suggest-followups` → `./packages/client/ui-suggest-followups/src/index.ts`

**Verification**: `pnpm verify-cordis-config` → `136 config files passed` (was 3 errors → 0). `npx tsc -b tsconfig.host.json` (full-repo) → still only the 1 pre-existing WIP error (`query-maxcompute` `maxc-args.mjs` TS7016) — **0 new errors** from the added paths. Root config change, full-repo verified (serial, not mixed with the parallel batch).

**Still deferred (WIP-touched only)**: query-maxcompute `maxc-args.mjs` TS7016 (WIP); CL8 eval-cli (WIP `main.spec.ts` — ticket [GA-CL8-eval-cli-responder-config.md](GA-CL8-eval-cli-responder-config.md)); CL15 I18N sub-ticket (WIP `context.ts`); tool-search index.ts:631 `as` (load-bearing).

---

## Round 5 — CL8 eval-cli 做满 + maxc-args.d.mts (2026-09-01)

Follow-up after `501c34672a`. With no concurrent session (WIP is static 遗留), the staging 死结 resolved by user authorization to carry `main.spec.ts`'s WIP path hunk (k11→k11-v2, a legitimate path fix matching `k11-cases.spec.ts` round 3).

**CL8 eval-cli site done (3/3)**: `eval-cli/src/main.ts` `--provider`/`--model` defaults removed (no silent `aga`/`qwen3.7-max`) + `resolveResponderLlmConfig` using **responder-specific** `EVAL_LLM_PROVIDER`/`EVAL_LLM_MODEL` env (NOT `ENRICHMENT_LLM_*` — that's enrichment-only; eval-cli's provider/model is the eval *responder* + SQL judge, the model under test) + fail-loud `'eval-cli: no responder provider/model configured'` (message distinct from enrichment's). dashscope hard import (line ~272 `await import('@deepseek-ai/dsh-llm-dashscope')`) + `DASHSCOPE_API_KEY` gate + import/exit logic untouched (GA-GT2 hard-import scope). `main.spec.ts` (WIP) "loads and runs" test +`EVAL_LLM_*` env (preserves WIP k11-v2 path hunk). +`cli-llm-config.spec.ts` (5 tests: no-input+env→throw, env-populated→used, override, partial provider-only/model-only→throw). **CL8 now ✅ 3/3.**

**query-maxcompute `maxc-args.mjs` TS7016 fixed**: +`packages/query/query-maxcompute/dev/maxc-args.d.mts` (`.mjs`→`.d.mts` is TS's declaration-extension mapping for ESM `.mjs`) declaring `buildMaxcArgs(subArgs: string[], config: string): string[]`. The `.mjs` is B-DA5's pure arg-builder (complete 遗留, JSDoc'd) — owned by WIP session but uncommitted; the `.d.mts` is the type side. Did NOT commit the larger query-maxcompute WIP (`maxc-sidecar.mjs` +41 / `src/index.ts` +75 — B-DA5/B-DA6's bigger changes, left untracked for the WIP session).

**Verification**: `cd packages/eval/eval-cli && npx tsc --noEmit` → main.ts **0 errors** (context.ts WIP ~30 pre-existing, untouched). eval-cli vitest **10 passed** (main.spec 5 + cli-llm-config 5). **`npx tsc -b tsconfig.host.json` → 0 errors** (was 1 query-maxcompute TS7016 — now gone via `.d.mts`; CL8 main.ts 0 new). `pnpm verify-cordis-config` → 136 passed. staged oxlint (`.oxlintrc.staged.json`) 0 errors on CL8 files. (pre-push also runs `tsdown` host build + `tsc -b tsconfig.client.json` — not run here; verify on push.)

**Still deferred (WIP-touched only, 2 left)**: CL15 I18N sub-ticket (WIP `context.ts` — ticket [GA-CL15-eval-cli-context-i18n.md](GA-CL15-eval-cli-context-i18n.md)); tool-search index.ts:631 `as` (load-bearing — removing introduces `no-unsafe-argument`, same as :627). query-maxcompute's larger WIP (`maxc-sidecar.mjs`/`src/index.ts` +75) left untracked for the WIP session (B-DA5/B-DA6).

---

## Round 6 — client tsc -b fix + GA-CL8 ticket Resolved (2026-09-01)

Follow-up after `842787c730`. `pnpm typecheck` (pre-push gate = `tsc -b host` + `tsdown` host + `tsc -b tsconfig.client.json`) revealed `apply.client.spec.ts` (CL18 test, round 2) failed `tsc -b tsconfig.client.json` under `noUncheckedIndexedAccess: true` — `captured[0]` possibly `undefined` (3 TS18048/TS2532 errors). round 2 only ran per-pkg tsc (green), missed the full client build.

**Fix**: `apply.client.spec.ts` +`sidebarSlot(captured)` helper that narrows `captured[0]` (throws a clear setup error if undefined) — no `!` non-null assertion (avoids `no-non-null-assertion` lint). Both tests use it.

**GA-CL8 ticket Resolved**: `GA-CL8-eval-cli-responder-config.md` status Open → Resolved (round 5 `842787c730` did eval-cli 3/3); caveat noted in the ticket: dashscope hard import (line ~272 `await import('@deepseek-ai/dsh-llm-dashscope')`) + `DASHSCOPE_API_KEY` gate still in (GA-GT2 hard-import scope, not CL8).

**Verification (full pre-push typecheck — all green)**: `pnpm typecheck` = `tsc -b tsconfig.host.json` (**0 errors**) + `tsdown --env.DSH_BUILD_FACE host` (**Build complete**) + `tsc -b tsconfig.client.json` (**0 errors**, was 3 in apply.client.spec.ts). apply.client vitest 2 passed. **pre-push typecheck gate now fully passes.**
