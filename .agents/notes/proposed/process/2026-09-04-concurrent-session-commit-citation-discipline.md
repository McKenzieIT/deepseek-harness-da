# Concurrent-session commit & citation discipline

**Date**: 2026-09-04
**Status**: proposed (process)
**Surfaced by**: GA-MODEL1 / Kind 1 grilling session (commits `4dc531f097`, `33639da9ef`, `b09d54d3c2`)

## Two hard-won constraints

### 1. Commit per logical unit, not per phase

This repo is routinely worked by several concurrent agent sessions. During one session the **same correction was silently clobbered twice** by another session's commit:

- A fix changing a replayed pass^k figure `47.6% → 56.5%` was overwritten; the *erroneous* version got committed by the other session.
- A retraction header added to `wayfinder/data-agent/research/kind1-grilling-brief.md` vanished entirely — `grep` later showed zero trace, so the brief stayed published with numbers already known to be wrong.

Both edits reported success at the time. The gap between "edited" and "committed" is the risk window; batching widens it.

**Rule**: one logical unit = one commit. A ticket updated, a doc corrected, a bug fixed — commit before starting the next. Before editing a file touched earlier in the session, re-check `git status` / re-read it; the earlier edit may be gone.

### 2. Re-derive every number and `file:line` before writing it into a durable artifact

An evidence subagent returned a well-formatted table of prompt-corpus measurements. The session used it as the factual backbone of a grilling conversation and wrote it into four tickets **without opening the file**. An independent review found:

- CJK count `1129 / 1161 / 847` → actually **782** ideographs
- `见方言规范` cited at `prompt.ts:111,113` → actually `:54, :56, :145` — **no claimed line contained it**
- `buildEvalPrompt` at `:159` → `:180`; "27% of the Chinese" → 10.9%

Worse, two *qualitative* claims were false: "the 8 core rules are duplicated with no test guaranteeing consistency" — but `renderCoreRules` is a **shared function** called by both call sites, and `prompt.spec.ts` byte-pins both outputs. That reversed a recommendation: had it been acted on, someone would have deleted real test coverage to fix a hazard that never existed.

The tell was an asymmetry: the session independently recomputed every statistic *it* was going to reason from (and caught two of its own errors that way), but numbers that arrived **pre-formatted as a finished table** got treated as already verified. The format did the persuading.

**Rule**: a subagent's claim has the same epistemic status as a from-memory claim — unverified until re-derived. Wrong `file:line` is worse than a wrong adjective: the entire point of the citation format is that a later session can jump there and check, so one dead pointer discounts every other citation in the same document. Verification is usually one `node -e` counting one-liner; skipping it is never a time saving. When a claim *is* corrected, fix the **evidence document too**, not only the tickets — the brief is what people open for detail. Distinguish "the argument survives" from "the citation was right".

## Staging rule (concurrent-session corollary)

The tree usually carries 100+ unrelated in-flight files from other sessions. Never `git add -A`. Stage explicitly by path; verify with `git diff --cached --name-only` before committing.
