# Agent Note: Concurrent-session commit & citation discipline

Status: proposed

## Problem

Surfaced by the GA-MODEL1 / Kind 1 grilling session (commits `4dc531f097`, `33639da9ef`, `b09d54d3c2`); this complements [Per-session branch and worktree isolation for parallel work](2026-09-04-parallel-session-branching-policy.md), which owns worktree/branch isolation, while this note owns commit cadence and citation verification.

This repository is routinely worked by several concurrent agent sessions sharing one checkout. Two failure modes recurred in one session.

First, a logical correction was silently clobbered twice by another session's commit. A fix changing a replayed pass^k figure `47.6% → 56.5%` was overwritten and the erroneous version was committed by the other session. A retraction header added to `wayfinder/data-agent/research/kind1-grilling-brief.md` vanished entirely; `grep` later showed zero trace, so the brief stayed published with numbers already known to be wrong. Both edits reported success at the time. The gap between "edited" and "committed" is the risk window, and batching widens it.

Second, an evidence subagent returned a well-formatted table of prompt-corpus measurements that the session used as the factual backbone of a grilling conversation and wrote into four tickets without opening the file. An independent review found the CJK count `1129 / 1161 / 847` was actually 782 ideographs; `见方言规范` cited at `prompt.ts:111,113` was actually at `:54, :56, :145` (no claimed line contained it); `buildEvalPrompt` at `:159` was at `:180`; "27% of the Chinese" was 10.9%. Two qualitative claims were also false: "the 8 core rules are duplicated with no test guaranteeing consistency" — but `renderCoreRules` is a shared function called by both call sites and `prompt.spec.ts` byte-pins both outputs. That reversed a recommendation: had it been acted on, someone would have deleted real test coverage to fix a hazard that never existed. The tell was an asymmetry: the session recomputed every statistic it reasoned from (and caught two of its own errors that way), but numbers that arrived pre-formatted as a finished table were treated as already verified. The format did the persuading.

## Proposal

Two rules plus a staging corollary.

**Commit per logical unit, not per phase.** One logical unit = one commit: a ticket updated, a doc corrected, a bug fixed — commit before starting the next. Before editing a file touched earlier in the session, re-check `git status` / re-read it; the earlier edit may be gone. This narrows the "edited → committed" risk window that concurrent sessions exploit.

**Re-derive every number and `file:line` before writing it into a durable artifact.** A subagent's claim has the same epistemic status as a from-memory claim — unverified until re-derived. Wrong `file:line` is worse than a wrong adjective: the entire point of the citation format is that a later session can jump there and check, so one dead pointer discounts every other citation in the same document. Verification is usually one `node -e` counting one-liner; skipping it is never a time saving. When a claim is corrected, fix the evidence document too, not only the tickets — the brief is what people open for detail. Distinguish "the argument survives" from "the citation was right".

**Staging corollary.** The tree usually carries 100+ unrelated in-flight files from other sessions. Never `git add -A`. Stage explicitly by path; verify with `git diff --cached --name-only` before committing.

## Alternatives considered

**Commit per phase (batch) to amortize commit overhead.** It lost because the "edited → committed" gap is exactly the window concurrent sessions exploit, and batching widens it; both clobber incidents survived a successful `edit` and were lost before a delayed commit. Per-unit commits cost more commits, but agents do the labor, and a per-unit commit is recoverable where a batched one is not.

**Trust a subagent's pre-formatted table as already verified.** It lost because the format did the persuading: the same session recomputed statistics it reasoned from and caught its own errors, but accepted the pre-formatted table unread, and that table carried the worst errors (wrong counts, dead line pointers, a false "no test coverage" claim that reversed a recommendation). Format is not verification.

**`git add -A` for convenience.** It lost because the shared tree carries 100+ unrelated in-flight files from other sessions; `git add -A` sweeps another session's half-finished work into a commit that has no business landing it. Explicit-path staging with a `git diff --cached --name-only` check is the cost of a shared checkout.

## Acceptance criteria

- Each logical unit (a ticket update, a doc correction, a bug fix) is committed before the next is started.
- Before editing a file touched earlier in the session, `git status` is re-checked; a vanished earlier edit is detected before re-editing.
- Every number and `file:line` written into a ticket, map, README, or research note is re-derived at write time (a `node -e` counting one-liner or a grep), not transcribed from a subagent's table.
- A corrected claim updates the evidence document (brief or research note), not only the citing tickets.
- Staging is by explicit path; `git add -A` is not used; `git diff --cached --name-only` is run before each commit.

## Risks

- Per-unit commits raise commit count and can interrupt a flow state; the mitigation is that agents, not humans, pay the commit cost, and recoverability is the value bought.
- Re-derivation overhead is real but bounded — most checks are a one-line `node -e` count — and the alternative (a dead pointer that discounts every sibling citation) is more expensive in trust.
- The rules assume a shared checkout (the current harness contract, per [Durable Agent Teams](../../implemented/feature/2026-08-05-agent-teams.md)); per-worktree isolation, once adopted per the branching-policy note, narrows but does not eliminate the clobber window, because write scopes cannot prove semantic independence and the Lead remains the integration boundary.
