export const meta = {
  name: 'um11-branch-sweep-verify',
  description: 'UM11 post-merge cleanup: enumerate every worktree/branch, judge each by ancestry then by per-file absorption, and emit the ordered delete/keep matrix. READ-ONLY throughout -- it never removes a worktree or deletes a branch. The main session applies serially, per branch, after re-confirming.',
  phases: [
    { title: 'Enumerate', detail: 'one agent lists every worktree + branch with its ancestry verdict vs origin/master' },
    { title: 'Absorption', detail: 'one agent per non-ancestor branch: per-file absorption check, never a whole-tree diff' },
    { title: 'Matrix', detail: 'synthesize the ordered delete/keep matrix and the exact commands the main session should run' },
  ],
  whenToUse: 'Next session, for UM11. Run it to get a trustworthy delete/keep matrix; then delete branches yourself, one per commit, re-confirming absorption first because master moves under the eval.',
}

const IRON = [
  'ENVIRONMENT IRON LAWS:',
  'TOOL ACCESS: built-in Read/Write/Edit/Bash/Grep/Glob are BLOCKED. Call ToolSearch for',
  '"mcp__local__bash mcp__local__read_file mcp__local__write_file mcp__local__list_dir" and use ONLY those.',
  'mcp__local__grep is UNRELIABLE -> use grep -rEn inside mcp__local__bash. rg and grep -P do NOT exist.',
  'node v24 MANDATORY: prefix EVERY bash with: export PATH="/usr/local/bin:$PATH".',
  'Shell is sh NOT bash: no <(...); use temp files + sort/comm.',
  '',
  'READ-ONLY, ABSOLUTELY. Forbidden: git worktree remove, git branch -D, git commit/add/checkout/stash/reset,',
  'any build, any generator, any gate. Allowed: git log/show/diff/rev-list/rev-parse/merge-base/worktree list,',
  'and writing under /tmp.',
  'WHY it must stay read-only: the branch deletions are irreversible, they must be one-per-commit with a fresh',
  'absorption re-check, and the master worktree is owned by a perpetual evaluation whose tip moves under you.',
  '',
  'Two trees: /Users/mckenzie/workspace/deepseek-harness-da is master (perpetual eval, tip MOVES -- read only,',
  'never write); /Users/mckenzie/workspace/dsh-resync is the resync worktree (no eval). Branch refs and the',
  'worktree list are shared between them, so you can read either.',
  'NEVER analyse or propose anything about .worktrees/ or wayfinder/evaluation/ -- those belong to the eval.',
  '',
  'RUNNER: flaky on long calls -> keep every bash SHORT; long content to /tmp via mcp__local__write_file.',
  '',
  'STEP 0 PROBE: mcp__local__bash: export PATH="/usr/local/bin:$PATH"; echo PROBE_ALIVE; node -v',
  'If it fails or node is not v24.x, STOP and return: NO_MCP_LOCAL_ACCESS_OR_BAD_NODE plus what you saw.',
].join('\n')

const INVENTORY = {
  type: 'object',
  additionalProperties: false,
  required: ['entries', 'masterAhead', 'masterBehind', 'mergeTreeClean', 'resyncUnpushed'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['branch', 'worktree', 'tip', 'isAncestorOfOriginMaster', 'aheadCount', 'firstVerdict'],
        properties: {
          branch: { type: 'string' },
          worktree: { type: 'string' },
          tip: { type: 'string' },
          isAncestorOfOriginMaster: { type: 'boolean' },
          aheadCount: { type: 'integer' },
          firstVerdict: { type: 'string', description: 'safe-delete | needs-absorption-check | do-not-touch | active' },
        },
      },
    },
    masterAhead: { type: 'integer' },
    masterBehind: { type: 'integer' },
    mergeTreeClean: { type: 'boolean', description: 'git merge-tree --write-tree origin/master master exits 0' },
    resyncUnpushed: { type: 'array', items: { type: 'string' }, description: 'commits on the resync branch not yet on origin/master' },
  },
}

const ABSORPTION = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'touchedFiles', 'absorbedFiles', 'residualFiles', 'verdict', 'evidence'],
  properties: {
    branch: { type: 'string' },
    touchedFiles: { type: 'integer' },
    absorbedFiles: { type: 'integer' },
    residualFiles: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', description: 'fully-absorbed-safe-delete | residual-keep | unmerged-real-work' },
    evidence: { type: 'string' },
  },
}

phase('Enumerate')
const inv = await agent(IRON + `

=== TASK: enumerate every worktree and branch, with a first-pass verdict (READ-ONLY) ===

1. 'git worktree list --porcelain' -> every worktree and the branch it holds. There are more than a dozen and
   as of 2026-09-11 not one had been removed, so expect a long list.
2. For each branch, get its tip and run 'git merge-base --is-ancestor <tip> origin/master'.
     ancestor        -> firstVerdict 'safe-delete' (pure ancestry; nothing else to prove)
     NOT ancestor    -> firstVerdict 'needs-absorption-check' (see below)
   Also record 'git rev-list --count origin/master..<tip>' -- several recorded ahead-counts in the ticket are
   stale, so measure rather than quote.
3. Anything under .worktrees/ is the perpetual evaluation -> firstVerdict 'do-not-touch'. Name the branch it is
   on now but propose nothing. The resync worktree itself is 'active'.
4. Measure master vs origin/master: 'git rev-list --left-right --count master...origin/master' for ahead/behind,
   and 'git merge-tree --write-tree origin/master master' for whether the recommended MERGE is still clean
   (exit 0 = clean). Do NOT perform the merge.
5. List the commits on the resync branch not yet on origin/master:
   'git log --oneline origin/master..upstream/resync-2026-09-08'. The remote resync branch was deleted when the
   PR merged, so these need a fresh push + PR -- record them.

WHY ancestry alone is not enough for step 2: the Phase-2 collection commit gathered work by cherry-pick/squash,
so a fully-absorbed branch still reports 'not an ancestor'. Those get a per-file check in the next phase.

Write the inventory to /tmp/um11-inventory.md, then return the structured result.
`, { label: 'enumerate:worktrees', phase: 'Enumerate', schema: INVENTORY, agentType: 'general-purpose' })

if (inv === null) return { error: 'enumeration returned null' }

const needCheck = (inv.entries || []).filter(e => e.firstVerdict === 'needs-absorption-check')
log(`${(inv.entries || []).length} worktrees · ${needCheck.length} branches need a per-file absorption check · master ahead ${inv.masterAhead} / behind ${inv.masterBehind} · merge-tree clean: ${inv.mergeTreeClean} · resync unpushed: ${(inv.resyncUnpushed || []).length}`)

phase('Absorption')
const checks = await parallel(needCheck.map(e => () => agent(IRON + `

=== TASK: decide whether ONE branch is content-absorbed (READ-ONLY) ===

Branch: **${e.branch}**  (tip ${e.tip}, ahead ${e.aheadCount} of origin/master, worktree ${e.worktree})

METHOD -- follow it exactly, the shortcuts are known to lie:
1. Get the branch's OWN touched-file list: 'git merge-base <branch> origin/master' then
   'git diff --name-only <that-base> <branch>'. That is the only file set that matters.
2. For EACH of those files, compare the branch content against the collection point:
   'git diff <collector> <branch> -- <file>'. Empty diff = that file is absorbed.
   For 'refactor/p2-*' branches the collector is **eb9e4cf05c** (the Phase-2 collection commit).
   For every other branch the collector is **origin/master**.
3. Report touchedFiles, absorbedFiles, and the exact residualFiles list.

DO NOT run a whole-tree 'git diff eb9e4cf05c <branch>'. Master moves under the perpetual eval, so a whole-tree
diff returns a false negative like "117 files changed" and you will wrongly conclude the branch is unabsorbed.
Per-file only.

Verdict:
  fully-absorbed-safe-delete  every touched file has an empty diff vs the collector
  residual-keep               a few files differ, and the difference is minor/test-only -> route it to a debt ticket
  unmerged-real-work          the branch carries substantive unmerged behaviour -> a human must decide land-or-drop

SPECIAL CASE, check it directly if this is refactor/rda-admin-lazy-webserver-2026-09-08:
  Its commit is a lazy-webServer carrier refactor mirroring seam 3. Check whether HEAD still EAGERLY injects
  webServer: 'grep -n "export const inject" packages/data/admin/src/index.ts' and look for 'webServer' in the
  array, plus whether tests/admin.spec.ts still asserts toContain('webServer'). Quote the lines. If HEAD is
  still eager, this branch is unmerged real work, and the UM-ADAPT claim that "seam 3/4 landed" is false at
  branch level -- say so plainly, because a ticket is about to be closed on that claim.
`, { label: 'absorb:' + e.branch.split('/').pop(), phase: 'Absorption', schema: ABSORPTION, agentType: 'general-purpose' })))

const done = checks.filter(Boolean)
log(`${done.length}/${needCheck.length} absorption checks returned`)

phase('Matrix')
const matrix = await agent(IRON + `

=== TASK: synthesize the ordered delete/keep matrix and the commands a human should run (READ-ONLY) ===

Produce, as markdown written to /tmp/um11-matrix.md and summarised in your reply:

1. **Safe to delete now** -- branches that are ancestors of origin/master, plus branches the per-file check
   found fully absorbed. For each, the pair of commands in the ONLY order that works:
   'git worktree remove <dir>' BEFORE 'git branch -D <branch>'. A branch held by a worktree cannot be deleted;
   'git branch -D' refuses outright. Say this explicitly -- a previous prompt claimed branch -D was a pure ref
   op and it is not.
2. **Keep, with a reason** -- residual content, and which debt ticket should own it.
3. **Needs a human decision** -- branches carrying unmerged real work. State what would be lost by deleting.
4. **Do not touch** -- the evaluation worktrees, named but untouched.
5. **The two gated actions**, written as a checklist rather than commands to run blind:
   - master <- origin/master MERGE (master is ahead ${inv.masterAhead} / behind ${inv.masterBehind};
     merge-tree clean = ${inv.mergeTreeClean}). This is a git write on the eval-owned worktree.
   - push + PR for the resync commits not yet on origin/master: ${JSON.stringify(inv.resyncUnpushed || [])}.
     The remote resync branch was deleted at merge time, so this needs a fresh branch push.
     Note that this single action is also the only way to close UM12's oldest open item -- CI has never run the
     gate matrix on this content -- so it serves two tickets.

6. **The re-confirmation rule**, stated for whoever applies this: master moves under the eval, so absorption
   must be re-checked immediately before each deletion, one branch per commit, never in a batch.

ABSORPTION RESULTS (treat as claims and sanity-check the arithmetic):
${JSON.stringify(done, null, 1)}

INVENTORY:
${JSON.stringify(inv.entries, null, 1)}
`, { label: 'matrix:synthesize', phase: 'Matrix', agentType: 'general-purpose' })

return {
  worktrees: (inv.entries || []).length,
  safeByAncestry: (inv.entries || []).filter(e => e.firstVerdict === 'safe-delete').map(e => e.branch),
  absorption: done,
  master: { ahead: inv.masterAhead, behind: inv.masterBehind, mergeTreeClean: inv.mergeTreeClean },
  resyncUnpushed: inv.resyncUnpushed,
  matrix,
}
