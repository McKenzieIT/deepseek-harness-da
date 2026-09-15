# Next session — clear the now-visible CI red gates, then give upstream-merge a clean closeout

## Invocation

Use the `wayfinder` skill. Work from a **fresh isolated worktree created off freshly-fetched `origin/master`** (see Phase 0). This effort carries execution: fix the gates, verify the specialty, clean up, and seal it — do not stop after producing a plan.

## Current date and freshness rule

This prompt was written 2026-09-15T03:07Z. Treat **every** SHA, ticket status, gate result, branch list, and worktree state below as a checkpoint that **must be re-verified before you act on it**. This effort has repeatedly caught stale facts in its own prior prompts (the map once advertised "7 open" when 3 were open; a prior prompt said the first cron could not fire before 2026-09-21 when it had already fired on 2026-09-14). Trust tools, not this text.

## What is already true (verify, then build on it)

- **`origin/master` = `36412df46fda756d6e82ce8d3a91119929c7f508`** (PR #137, UM17 close). Re-fetch; it will have moved if other sessions landed work.
- **The upstream-merge specialty frontier is empty.** Ledger in `wayfinder/data-agent/tickets/phase-upstream-merge/`: **0 open** + 34 resolved/closed + 6 archived + 1 folded (+ 2 non-ticket docs). UM17 was the last open ticket.
- **The fork contains the latest upstream observed as of this writing.** `upstream/master` = `c291e7961a515f6d7af9304e7fd1d257929aef26`; `git merge-base --is-ancestor upstream/master origin/master` → 0; behind 0 / ahead 1189; `upstream-sync.json.current.upstreamSha` equals it. **This drifts** — upstream moves independently, so re-check (Phase 2). If it advanced, that is NOT this phase's work: open a fresh sync per UM15's durable method, do not reopen UM tickets.
- **CI actually runs now.** PR #135 fixed the `ci.yml`/`ci-master.yml` startup_failure, so `check:ci:static` runs in CI for the first time and **passes 51/51**. You will get real CI feedback on every PR — use it.
- **The scheduled monitor is live and proven.** `.github/workflows/upstream-monitor.yml`, daily `17 21 * * *` (21:17 UTC = 05:17 Asia/Shanghai). Real scheduled run 34910850105 succeeded on master, artifact `verdict = fresh (exit 0)`. No heartbeat cron is armed anymore.

## Safety contract (standing)

1. Never touch the user's primary worktree `/Users/mckenzie/workspace/deepseek-harness-da` (branch `feat/data-agent-afk-2026-09-14`, has uncommitted work). Do not edit, reset, clean, stash, or switch it.
2. Only `mcp__local__*` tools with absolute paths under the repo. Built-in Read/Write/Edit/Bash are blocked.
3. Never `--no-verify`, raw `--force`, `git reset --hard`, `git add -A`, or broad destructive cleanup. Commit with `git commit -F <file>` and explicit path arguments.
4. Edit `wayfinder/data-agent/map.md` **only** by Node Buffer byte-splice; its U+FFFD count must be exactly **13** before and after. `edit_file` is fine for tickets and other maps (repo-infra map has 0 U+FFFD).
5. `github.com:443` (git-over-HTTPS) has been intermittently unreachable while `api.github.com` and SSH stayed up. If `git push`/`fetch` over HTTPS times out, use SSH with an explicit URL (`git push git@github.com:McKenzieIT/deepseek-harness-da.git <branch>:refs/heads/<branch>`) — do **not** edit the remote config.
6. Re-verify each SHA / ticket status / gate with a tool before acting. Do not trust ticket `Status:` lines — re-run the gate or read the file.
7. Deleting remote branches and worktrees is hard to reverse. Confirm the safe-set by computation (below) and get explicit user confirmation before any mass deletion.

## Phase 0 — clean worktree

Follow `using-git-worktrees`. Native `EnterWorktree` targets the pod placeholder, not the user's repo, so use the git fallback: `git worktree add .worktrees/<name> -b codex/<name> <fresh origin/master>`. `pnpm install --frozen-lockfile`. Record the path, branch, `origin/master` SHA, and clean status.

## Phase 1 — clear the CI red gates (repo-infra, NOT upstream-merge)

These are pre-existing gates that were invisible until CI started running. They are **repo-infra tickets**; do not file them as UM tickets. Run a real CI PR early so you triage against CI truth, not local guesses. **Re-verify each ticket is still red on current master first** — concurrent sessions may have fixed some (T7/T8/T9 are marked open but predate CI visibility).

Owning tickets in `wayfinder/repo-infra/tickets/`:

- **T16 — duplication (jscpd 89 clones), `exit 1`.** A grilling ticket: answer its three scope questions first (does root `scripts/*.spec.ts` belong in the corpus given `ignore` is `**/tests/**` only; do 55-line type-declaration clones count as debt; do component boilerplate clones). It fail-fasts inside `lint and duplication`, hiding five further gates, so fixing it unblocks visibility. **Do not** flip `exitCode` to 0 or delete the gate.
- **T15 — doc-typecheck, remaining 2 fences.** Plan-sketch pollution is already excluded. Two real fences still fail: `docs/da-plugin-development-guidelines.md:148` (missing imports — `Context`/`Service` from `@deepseek-ai/cordis`, `CredentialRef`/`CredentialAddress` from `@deepseek-ai/dsh-credentials`) and `packages/client/result-cache/README.md:29` (`sessions` undefined). Make them compile; `ts ignore-check` is **not** available here (opt-out ratio is 49.7% against a 50% ceiling — the ticket has the arithmetic). Fence language tags must match across each bilingual `.md`/`.zh.md` pair or the `.zh.md` side stops deduping.
- **T10 — publint**, **T11 — test:coverage** (the two failing suites `scripts/gen-tsconfig-paths.spec.ts` + `scripts/generator-inputs.manifest.spec.ts`), **T7 — verify-export-jsdoc**, **T8 — readme-gates**, **T9 — built-package-invariants**, **T12 — windows-native-complete**. Verify-then-fix each.
- **`node-next types` — no ticket yet.** Seen failing in `windows node 24 / observational`. File a repo-infra ticket (next id T17) with its root cause before or instead of fixing, per this effort's "record with evidence, don't pre-file speculatively" habit.

Selection discipline: use `dsh-pre-push-checks` to run only the checks a diff invalidates; use `dsh-ci-test-reliability` before touching async/resource-owning tests. Land each fix as its own focused PR so a failure is attributable.

## Phase 2 — re-verify the specialty is genuinely done

From the clean worktree:

```sh
git fetch origin master && git fetch upstream master
git rev-parse origin/master upstream/master
git merge-base --is-ancestor upstream/master origin/master; echo "contains-upstream=$?"
git rev-list --count origin/master..upstream/master   # fork behind
pnpm run verify-upstream-sync-record                  # exit 0
pnpm run upstream-monitor                             # verdict = fresh (exit 0)
```

- Re-count the `phase-upstream-merge/` ledger by reading each ticket's own `Status:` line. Confirm **0 open**.
- If `contains-upstream` is non-zero (upstream advanced): **do not reopen this phase.** Record the new upstream SHA, and per UM15's durable method open a *fresh* upstream-sync effort from merged `origin/master` (new branch/PR, fresh impact report). Note it in the final report; it is out of this closeout's scope.
- Confirm the monitor's most recent scheduled run (`gh run list --workflow upstream-monitor.yml --event schedule`) is still green.

## Phase 3 — branch and worktree cleanup

**Worktrees** (`git worktree list`; re-verify each before removing):
- `dsh-resync` (`upstream/resync-2026-09-08`) — as of this writing MERGED into master and clean → **removable** (`git worktree remove`). It is the last leftover merge worktree.
- `.worktrees/um17-upstream-monitor` — the detached worktree this closeout work ran in; removable once its work is landed (it holds one untracked `upstream-sync/upstream-impact-*.md`, safe to discard).
- **Keep**: the user's primary worktree; `dsh-p2-present-table` and `dsh-p2-uism-vitest` (both ahead + dirty = active); `.worktrees/{g10-evaluation-core-publish, r10-harness-goodhart, t1-exec-grader}` (other efforts).

**Remote branches** — as of this writing **75 of ~81 are merged into `origin/master`** (stale) and 6 are unmerged. This is hard to reverse, so:
1. Recompute the merged set fresh: for each `refs/heads/*` except `master`, `git merge-base --is-ancestor <sha> origin/master`.
2. **Exclude** from deletion: `master`; any open-PR head (currently `feat/T1-exec-grader-impl` #114, `fix/cb1b-pwsh-pty-evaluation` #42 — re-list with `gh pr list`); any active-worktree branch; `backup/*` if the user wants a safety net; and **`upstream-merge-assets`** (it is intentionally unmergeable — an orphan assets branch, now holding an empty tree after the GIF was removed; its disposition is a **user decision**, not automatic deletion).
3. Present the computed delete-set to the user and get explicit confirmation before deleting. Delete over SSH if HTTPS is flaky.

## Phase 4 — the closeout ("perfect收官")

The specialty is a **phase within the data-agent map**, not its own map, so closeout is: prove the way is clear, seal it against accidental reopening, and record the standing posture.

1. **Seal the phase in the map** (byte-splice, U+FFFD=13): one closing entry stating the phase is complete — 0 open, fork on latest upstream (with the verified SHAs and date), the durable sync method (UM15) operational and monitored (workflow + last green scheduled run), and CI honestly green (all repo-infra gates from Phase 1 resolved, or the exact remainder named).
2. **Record the durable posture** so nobody reopens it: future upstream syncs are **not** new UM tickets — they are fresh runs of UM15's method (new branch/PR from merged master; the monitor tells you when). Put this one line where the next reader will see it (map + a note near the phase-upstream-merge ledger).
3. **Confirm the invariants hold on master after all Phase 1 PRs land**: `pnpm run check:ci:static` green in a real CI run (not just locally), `verify-upstream-sync-record` exit 0, `upstream-monitor` fresh. A closeout that claims "CI green" must cite a real green CI run.
4. Land the closeout as a docs-only PR; delete its branch after merge.

## Definition of done

- Every Phase 1 gate either fixed (with a real green CI run cited) or, if genuinely out of scope, ruled so with a one-line pointer to its owning effort — no gate left silently red.
- `phase-upstream-merge/` ledger: 0 open, re-verified by reading Status lines.
- Fork re-confirmed on latest `upstream/master` (or a fresh sync effort opened if it advanced), with exact SHAs and date.
- `dsh-resync` and the closeout worktree removed; the stale remote-branch set deleted after user confirmation; keep-list preserved.
- Map sealed with the phase-complete entry and the durable-posture line; U+FFFD=13; all links resolve.
- Final report in Chinese with: the SHAs, the ledger recount, each Phase-1 gate's outcome with its CI evidence, the cleanup result (worktrees + branch count deleted/kept), the upstream-currency verdict, and any remaining external blocker.

Do not claim completion while any Phase-1 gate is red without an owner, or while the fork's upstream currency is unverified.
