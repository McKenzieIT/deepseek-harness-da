# Next session — finish the upstream merge, verify latest upstream, and prove scheduled monitoring

## Invocation

Use the `wayfinder` skill and execute this prompt from the isolated checkout `/Users/mckenzie/workspace/dsh-s3-resync`. This effort explicitly carries execution through merge, post-merge validation, monitoring implementation, real workflow proof, tracker closeout, and cleanup; do not stop after producing a plan.

## Current date and freshness rule

The current date is 2026-09-14. Treat every PR state, branch SHA, CI conclusion, remote upstream SHA, workflow inventory, and worktree status below as a checkpoint that must be verified again before acting.

## Objective

Finish the remaining upstream-merge specialty work without carrying known-red debt: publish truthful final-head GUI evidence or a disclosed redacted equivalent, merge PR #130 only while its exact head and required checks remain valid, prove whether the merged fork contains the then-current `upstream/master`, implement an actionable scheduled upstream monitor, run that monitor through GitHub, classify the observed data-agent phase recovery loop, close UM15 and UM17 with evidence, and safely clean up the completed merge branch and worktree.

## Repository and current checkout

- Primary repository: `/Users/mckenzie/workspace/deepseek-harness-da`
- Current isolated worktree: `/Users/mckenzie/workspace/dsh-s3-resync`
- Current branch: `upstream/resync-2026-09-18`
- PR: `#130` — `merge: resync upstream through 2026-09-14`
- PR URL: `https://github.com/McKenzieIT/deepseek-harness-da/pull/130`
- Verified PR head on 2026-09-14: `1c6185d6f462fc59b8983986249428879912334e`
- PR state at handoff: open, mergeable, `mergeStateStatus=CLEAN`

## Required skills and documents

Read these before changing state:

- `.agents/skills/wayfinder/SKILL.md`
- `.agents/skills/dsh-pre-push-checks/SKILL.md`
- `.agents/skills/verification-before-completion/SKILL.md`
- `.agents/skills/record-browser-gif/SKILL.md`
- `.agents/skills/diagnosing-bugs/SKILL.md` before diagnosing the recovery loop
- `.agents/skills/dsh-ci-test-reliability/SKILL.md` before changing asynchronous tests or workflow fixtures
- `.agents/skills/dsh-prose-standard/SKILL.md` before editing prompts, tracker prose, diagnostics, or workflow descriptions
- `wayfinder/data-agent/tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md`
- `wayfinder/data-agent/tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md`
- `wayfinder/data-agent/map.md`
- `upstream-sync.json`
- `scripts/upstream-status.ts`
- `scripts/upstream-sync-record.ts`
- `scripts/verify-upstream-sync-record.ts`
- `.github/workflows/`

## Safety contract

1. Preserve the user's uncommitted primary worktree; do not edit, reset, clean, stash, or switch `/Users/mckenzie/workspace/deepseek-harness-da`.
2. Use isolated worktrees for all new code and post-merge evidence.
3. Do not use `--no-verify`, raw `--force`, `git reset --hard`, `git add -A`, or broad destructive cleanup.
4. Commit with `git commit -F <message-file>` and explicit path arguments.
5. Use normal push for ordinary history. A rewritten independent branch may use an exact `--force-with-lease` only after verifying the remote SHA and only when rewriting is actually required.
6. Never rewrite `master`. If upstream advanced, start a new branch and PR from merged `origin/master`.
7. Keep credentials, browser tokens, authorization URLs, and credential payloads out of logs, commits, PR bodies, artifacts, and final replies.
8. Edit `wayfinder/data-agent/map.md` only with Node Buffer byte-splicing. Its U+FFFD count must remain exactly 13 before and after the edit.
9. Do not call an always-zero report command a monitor. Monitoring requires an actionable failure, durable notification, or equivalent explicit signal.
10. Run the smallest sufficient checks selected by `dsh-pre-push-checks`; do not reflexively run the full repository suite.
11. Do not merge while required checks are pending, failing, missing because the PR conflicts, or attached to a different head SHA.
12. Do not publicly upload the unredacted final GIF unless the user explicitly authorizes publishing the named internal application identifier, table/schema metadata, and SQL content to the GitHub assets branch.

## Checkpoint: completed implementation and validation

The following was completed before this handoff and must not be repeated unless a later edit invalidates it:

- Upstream record points to upstream `c291e7961a515f6d7af9304e7fd1d257929aef26` and merge `1f731901a76109fefa168fc9bbd785dbfdefc889`.
- All 65 formal fork packages use release version `0.1.5-rc.2`.
- `@deepseek-ai/dsh-code-runtime-python-protocol` owns the published fd-3 Python wire protocol; the released data-python provider no longer depends on a private experimental package.
- Client UI i18n findings were reduced from 83 to 0.
- Translation-pairing findings were reduced from 12 to 0.
- Data-agent presets are bundle-owned, published, resolved from the installed package, and covered by the profile e2e suite.
- `ui-present-table` emits one Client bundle through `outputOptions.codeSplitting: false`.
- eval-cli resolves `DSH_HOME`, versioned credentials, and installed variant presets correctly.
- `pnpm run check:ci:static` passed 51/51.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build:official` passed.
- Release verify resolved 332 DSH members and 9 vendor members.
- Local release pack produced 332 DSH tarballs and 9 vendor tarballs with payload validation.
- GitHub `Dependency layout`, DSH `Pack npm tarballs`, vendor `Pack npm tarballs`, and all four native platform jobs passed on head `1c6185d6f462fc59b8983986249428879912334e`.
- The pre-push hook passed without bypasses.
- The incorrectly future-dated prompt `next-session-2026-09-22-unblock-push-and-residuals.md` was replaced by `session-2026-09-14-unblock-push-and-residuals.md`.

## Local final-head GUI evidence

A real Qwen3.7-Max run was recorded from exact PR head `1c6185d6f462fc59b8983986249428879912334e` with a fresh isolated `DSH_HOME`, fresh session state, the real built Web application, and the shipped browse directory-picker provider.

- GIF: `.playwright-mcp/pr130-final-1c6185d-capture2/artifacts/pr130-data-agent-final-head.gif`
- Absolute path: `/Users/mckenzie/workspace/dsh-s3-resync/.playwright-mcp/pr130-final-1c6185d-capture2/artifacts/pr130-data-agent-final-head.gif`
- SHA-256: `d2bc42debf006853e13c9644e4879453ee62968075fc8204723cedea1b286798`
- Size: 221,406 bytes
- Dimensions: 1200×750
- Duration: 15.5 seconds
- Source: six screenshots from one server, one state root, one workspace, one session, and one model-backed scenario

The recording proves that `取数模式` and `语义层管理` are discoverable, the Client loads without the present-table module-table crash, the model switches scope, searches data sources, loads grounding, constructs SQL, passes SQL Critic with confidence 1.00 and quality 100/100, reaches `query_data`, and reports `spawn maxc ENOENT` because the external `maxc` executable is unavailable on the host.

The recording also surfaced a possible repeated generation/execution recovery loop after the infrastructure failure. The loop was manually stopped to prevent further model consumption. Classify that behavior later in this prompt; do not hide it or describe the run as returning a DAU result.

The current PR body still embeds the older GIF recorded from commit `489f632036fbe096215f97a78e86d423363973b8`. Replace or relabel it before merge; do not attribute that older artifact to the final head.

## Phase 1 — re-establish live PR and local state

Run:

```sh
cd /Users/mckenzie/workspace/dsh-s3-resync
git status --short --branch
git rev-parse HEAD
git ls-remote origin 'refs/heads/upstream/resync-2026-09-18'
gh pr view 130 --json state,mergedAt,mergeCommit,headRefOid,baseRefName,mergeable,mergeStateStatus,url,title,body
gh pr checks 130
```

Completion criteria:

- The worktree is clean except for this handoff prompt if it was intentionally left uncommitted.
- The PR is either still open at exact head `1c6185d6f462fc59b8983986249428879912334e` with all required checks green, or its merge commit is recorded.
- Any remote-head movement is investigated before publishing evidence or merging.

## Phase 2 — resolve final GIF publication safely

The unredacted GIF visibly contains the internal application identifier, table/schema metadata, and SQL. Approval to record or send the prompt to Qwen3.7-Max does not by itself authorize public GitHub publication.

If the user invokes this prompt with an explicit statement equivalent to “允许将包含应用标识、表/schema 元数据和 SQL 的最终 GIF 公开上传到 GitHub assets 分支并合并 PR #130”, treat that as publication authorization. Otherwise ask one concise confirmation immediately before the upload, naming the destination `upstream-merge-assets` and the data categories.

### Authorized unredacted publication path

1. Recompute the GIF SHA-256 and require it to equal `d2bc42debf006853e13c9644e4879453ee62968075fc8204723cedea1b286798`.
2. Re-read PR #130 live head and require `1c6185d6f462fc59b8983986249428879912334e`.
3. Use a fresh shallow single-branch scratch clone of `upstream-merge-assets` under `/private/tmp`.
4. Verify `git ls-tree -r --name-only HEAD` contains media only.
5. Copy the GIF as `pr-130-data-agent-final-head.gif`, verify source/destination checksums match, stage only that file, commit normally, and push normally. Never force-push or rewrite the assets branch.
6. Verify the remote blob's size, checksum, HTTP status, and `image/gif` content type using authenticated GitHub access when needed.
7. Update PR #130 to embed `https://github.com/McKenzieIT/deepseek-harness-da/blob/upstream-merge-assets/pr-130-data-agent-final-head.gif?raw=true`.
8. State exact provenance: commit `1c6185d6f462fc59b8983986249428879912334e`, worktree, fresh isolated state, real Qwen3.7-Max round, six screenshot frames, no playback-speed claim, and the final `maxc` infrastructure failure.
9. Re-read the PR head after editing and require it to remain unchanged.
10. Render the PR body through GitHub Markdown and confirm the expected image element is present.

### Safer redacted publication path

If public release of internal metadata is not authorized, create a disclosed redacted GIF from the existing final-head source frames without issuing another model request. Mask the application identifier, table/schema names, and SQL while preserving visible evidence of preset discovery, Qwen3.7-Max use, tool progression, critic scores, `query_data`, and the stable `maxc ENOENT` outcome. Visually inspect every encoded frame, state the redactions beside the embed, publish only after confirming no sensitive value remains, and keep the exact final-head provenance.

Completion criteria:

- PR #130 contains final-head GUI evidence with truthful provenance.
- The older `489f632036...` GIF is removed or explicitly labeled historical rather than final-head evidence.
- No unauthorized internal value is published.

## Phase 3 — merge PR #130

Immediately before merge, run:

```sh
gh pr view 130 --json state,headRefOid,mergeable,mergeStateStatus
gh pr checks 130
```

Require:

- `state=OPEN`
- `headRefOid=1c6185d6f462fc59b8983986249428879912334e`
- mergeable and clean
- all required checks completed successfully
- final-head GIF publication resolved

Then merge normally:

```sh
gh pr merge 130 --merge
```

After merge, record:

```sh
gh pr view 130 --json state,mergedAt,mergeCommit,headRefOid,url
git fetch origin master
git rev-parse origin/master
```

Completion criterion: the exact PR merge commit is known and is an ancestor of `origin/master`.

## Phase 4 — start post-merge work from a clean checkout

Do not use the pre-merge resync worktree as ancestry evidence. Create a new isolated worktree from freshly fetched `origin/master`, following `.agents/skills/using-git-worktrees/SKILL.md`. Use a new branch such as `codex/um17-upstream-monitor`; never switch or clean the dirty primary worktree.

Record the new worktree path, branch, `origin/master` SHA, and clean status before continuing.

## Phase 5 — prove latest-upstream ancestry

From the clean post-merge worktree, run:

```sh
git fetch origin master
git fetch upstream master
git rev-parse origin/master
git rev-parse upstream/master
git show -s --format='%H %cI %s' origin/master
git show -s --format='%H %cI %s' upstream/master
git merge-base origin/master upstream/master
git merge-base --is-ancestor upstream/master origin/master
printf 'ancestor_exit=%s\n' "$?"
git rev-list --count origin/master..upstream/master
git rev-list --count upstream/master..origin/master
```

Read the exact recorded SHAs from `upstream-sync.json` and report:

- PR #130 merge commit
- `origin/master`
- fetched `upstream/master`
- `upstream-sync.json.current.upstreamSha`
- `upstream-sync.json.current.mergeSha`
- merge-base
- fork-behind count
- timestamps for the relevant commits

If fetched `upstream/master` is an ancestor of `origin/master`, record that the fork contains the latest upstream observed by this session and that the behind count is zero.

If upstream advanced, preserve UM15 and PR #130 history. Open a new upstream-sync effort from merged `origin/master`, record the new upstream SHA, generate a fresh impact report, create the required Wayfinder tickets, and use a new branch/PR. Do not amend the completed resync merge to pretend it included later commits.

## Phase 6 — verify upstream record and report behavior

Run:

```sh
pnpm run verify-upstream-sync-record
pnpm run upstream-status
pnpm run upstream-status -- --no-fetch
```

Report output fields, not only exit codes: recorded upstream, fetched upstream, behind count, freshness, unknown/fetch failure, and owed remediation.

Use the owning specs and fixtures to prove at least:

1. fresh upstream
2. stale upstream
3. remote probe failure
4. malformed sync record
5. merge SHA mismatch
6. recorded upstream absent from merge ancestry
7. `--no-fetch` behavior

Use fixture remotes or test seams; do not mutate the real remotes to manufacture failures.

## Phase 7 — design and implement actionable scheduled monitoring

First inspect the live merged tree:

```sh
rg -n 'schedule:|workflow_dispatch:|upstream-status|upstream-sync' .github/workflows package.json scripts
```

Known checkpoint: before merge, no workflow declared `schedule:`, and `upstream-status` intentionally behaved as a report with exit code 0. Reconfirm both facts.

If an actionable monitor is still absent, implement the recommended design:

- one workflow supports both `schedule` and `workflow_dispatch`
- minimum permissions, normally `contents: read`
- concurrency prevents duplicate runs for the same ref/event
- a report is always retained as a GitHub Actions artifact, including failure runs
- a separate wrapper or gate converts threshold-exceeded stale state, invalid record state, and unavailable remote state into a non-zero job result
- preserve `upstream-status` report semantics unless its owning contract explicitly changes
- scheduling the report alone is not sufficient
- document the UTC cron and its Asia/Shanghai equivalent
- avoid automatic Issue creation unless the design includes permissions, deduplication, update, and closure behavior

Use TDD. Start with a focused test that fails when an always-zero report is treated as monitoring, then implement the wrapper/workflow and make the focused lane green. Cover fresh, stale-threshold, unknown remote, invalid record, artifact-on-failure, permissions, and concurrency.

A new `workflow_dispatch` workflow generally must exist on the default branch before GitHub will dispatch it reliably. If the workflow is new, open a focused PR, pass its selected checks, merge it normally, fetch the resulting `origin/master`, and then dispatch the workflow from the merged default branch. Do not claim a new unmerged workflow was exercised if GitHub could not dispatch it.

## Phase 8 — run the real monitor

After the workflow exists on the default branch, run and inspect it:

```sh
gh workflow list
gh workflow run <workflow-file> --ref master
gh run list --workflow <workflow-file> --branch master --limit 10
gh run watch <run-id>
gh run view <run-id> --json status,conclusion,url,headSha,event,jobs,artifacts
```

Download and inspect the report artifact. Confirm the run event, exact head SHA, permissions, concurrency behavior, artifact retention, and actionable conclusion.

A successful manual run proves the workflow path and fresh-state behavior. A real cron path is proven only after a scheduled run occurs on the default branch. If the cron has not fired yet, state “manual dispatch verified; first scheduled trigger pending” and create a Codex heartbeat monitor that stays quiet while unchanged and notifies only on a scheduled run, failure, completion, or required user action.

## Phase 9 — classify the phase recovery loop

Use `.agents/skills/diagnosing-bugs/SKILL.md`. Build a tight, deterministic reproducer from the recorded session or the owning phase-gate/preset tests before forming a fix.

The observed sequence included a valid grounded SQL, clean critique, `query_data`, `spawn maxc ENOENT`, fallback to generation, another critique, execution retry, and repeated recovery. Determine whether the loop is finite expected recovery, an existing data-agent defect, or a regression introduced by the upstream merge.

Inspect:

- phase advance and fallback events
- `turn/end`
- preset-autojoin `pendingSwitch` state
- transport error classification
- guard/iteration budget
- stop/cancellation behavior
- whether an infrastructure `ENOENT` can ever become recoverable through SQL regeneration

If the loop is an unbounded or wasteful defect, create a separate ticket and use TDD. The desired terminal behavior is a stable incomplete/infrastructure result after a bounded attempt; absence of `maxc` must not become success, and it must not repeatedly consume model rounds.

If the loop is pre-existing and outside the upstream-merge destination, record that ownership explicitly and leave an executable ticket without blocking the ancestry and monitor proof. If it is merge-introduced, fix it before closing the specialty.

## Phase 10 — tracker closeout

Update the authoritative files after evidence exists:

- `wayfinder/data-agent/tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md`
- `wayfinder/data-agent/tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md`
- `wayfinder/data-agent/map.md`
- any new upstream-sync ticket if upstream advanced
- any new recovery-loop ticket if required

Before and after editing the map, run:

```sh
node -e '
const fs = require("fs");
const text = fs.readFileSync("wayfinder/data-agent/map.md", "utf8");
console.log((text.match(/\uFFFD/g) || []).length);
'
```

Require 13 both times. Use Node Buffer byte-splicing for the map edit.

Close UM17 only when the merged-fork ancestry verdict, record verification, actionable monitor, real manual workflow URL/artifact, and scheduled-path status are all recorded. Close UM15 only when its durable method, operational workflow, merge result, and cleanup status agree.

## Phase 11 — validation, push, and cleanup

Use `dsh-pre-push-checks` against each live PR base. Run only checks invalidated by the actual diff. Expected minimum for monitor/workflow changes:

```sh
pnpm run typecheck
pnpm run lint
pnpm run check:ci:static
pnpm run verify-upstream-sync-record
pnpm run doc-sync
git diff --check
git status --short --branch
```

Add focused workflow/wrapper specs and any recovery-loop owning tests. Do not repeat unrelated suites already proven on PR #130 unless new changes reach them.

Push normally and allow hooks to run. Inspect CI and diagnose every new failure before merge.

After all follow-up PRs are merged:

1. verify their merge commits are ancestors of `origin/master`
2. verify the old `dsh-s3-resync` worktree is clean
3. remove only the completed upstream-merge worktree
4. delete the old remote branch only after confirming PR #130 is merged and no task depends on it
5. preserve all other active worktrees and user changes
6. record the cleanup in UM15/UM17

## Final completion report

Return in Chinese with exact evidence:

- PR #130 merge commit and merge time
- final GUI artifact URL, demonstrated commit, checksum, and redaction/publication status
- `origin/master`, `upstream/master`, recorded upstream, recorded merge, and merge-base SHAs
- ancestry verdict and both ahead/behind counts
- `verify-upstream-sync-record` and `upstream-status` results
- monitoring workflow file and schedule
- manual workflow run URL, event, head SHA, conclusion, and artifact
- first real scheduled-run status or the heartbeat that is waiting for it
- phase recovery-loop classification and ticket/fix if needed
- follow-up PRs and merge commits
- exact validation commands actually run
- worktree/branch cleanup result
- remaining external blocker, if any

Do not claim completion while any required proof is pending. If a real scheduled trigger is the only remaining external wait, leave UM17 open, create the quiet heartbeat, and report the precise pending condition.
