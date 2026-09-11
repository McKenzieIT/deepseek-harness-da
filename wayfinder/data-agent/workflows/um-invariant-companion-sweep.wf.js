export const meta = {
  name: 'um-invariant-companion-sweep',
  description: 'UM-INVARIANT-COMPANION-CLEANUP: discover every empty invariant companion on resync, then retire them in disjoint package batches (4 edits per package, ~268 total). Discovery is read-only; the retire phase edits source only when args.mode === "apply". Gates + commit stay in the main session.',
  phases: [
    { title: 'Discover', detail: 'one agent enumerates the violating packages and which of the 4 edits each needs' },
    { title: 'Retire', detail: 'one agent per disjoint batch of ~6 packages' },
    { title: 'Cross-check', detail: 'independent agent re-derives the residue and hunts for the conditional-rule trap' },
  ],
  whenToUse: 'Next session, for UM-INVARIANT-COMPANION-CLEANUP. Run with args {mode:"analyze"} first to read the plan, then {mode:"apply"} to land it. Never let this workflow run a gate or a commit.',
}

// Battle-tested preamble from um-resync-parallel-sweep.wf.js, adapted: this workflow MAY edit source
// (disjoint packages) but still must never run a build, a generator, a gate, or any git write.
const IRON = [
  'ENVIRONMENT IRON LAWS:',
  'TOOL ACCESS: built-in Read/Write/Edit/Bash/Grep/Glob are BLOCKED. Call ToolSearch for',
  '"mcp__local__bash mcp__local__read_file mcp__local__write_file mcp__local__edit_file mcp__local__glob mcp__local__list_dir"',
  'to load their schemas, then use ONLY those.',
  'mcp__local__grep is UNRELIABLE -> use grep -rEn inside mcp__local__bash. rg and grep -P do NOT exist (BSD grep only).',
  'node v24 MANDATORY: prefix EVERY bash with: export PATH="/usr/local/bin:$PATH" (yields v24.15.0; system default v25 crashes tsdown).',
  'Shell is sh NOT bash: no <(...); use temp files + sort/comm.',
  'TREE: /Users/mckenzie/workspace/dsh-resync (branch upstream/resync-2026-09-08, NO eval session -> parallel edits are safe).',
  'NEVER touch /Users/mckenzie/workspace/deepseek-harness-da (master; a perpetual eval runs there and its tip moves).',
  'NEVER touch .worktrees/ or wayfinder/evaluation/.',
  '',
  'FORBIDDEN even in apply mode:',
  '  - any git WRITE (commit/add/checkout/stash/restore/reset/branch/worktree). Read-only git is fine.',
  '  - any build (pnpm run build*, tsc -b), any generator (pnpm run gen-*), any gate (pnpm run verify-*, check:ci:*, lint*).',
  '    WHY: concurrent gate runs on one tree read each other half-applied state. On 2026-09-11 a subagent reported',
  '    verify-config-catalog GREEN purely because it sampled during another process temporary regen. Gates and commits',
  '    belong to the main session, run once, serially. This is house rule 2/3, refined.',
  '',
  'RUNNER: flaky on long calls -> keep every bash SHORT. Long content goes to /tmp via mcp__local__write_file, then a short bash.',
  'Write /tmp output INCREMENTALLY so partial results survive a dropped call.',
  '',
  'STEP 0 PROBE FIRST: mcp__local__bash: export PATH="/usr/local/bin:$PATH"; echo PROBE_ALIVE; node -v',
  'If that fails or node is not v24.x, STOP and return exactly: NO_MCP_LOCAL_ACCESS_OR_BAD_NODE plus what you saw.',
].join('\n')

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['packages', 'peerDepOffenders', 'peerDepDeclarersTotal', 'specFiles', 'reproducedViolations'],
  properties: {
    packages: {
      type: 'array',
      description: 'one entry per package carrying an empty invariant companion',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dir', 'hasInvariantSrc', 'hasExportsEntry', 'hasFilesEntry', 'hasTsconfigRef', 'specFile'],
        properties: {
          dir: { type: 'string', description: 'repo-relative package dir, e.g. packages/data/audit' },
          hasInvariantSrc: { type: 'boolean' },
          hasExportsEntry: { type: 'boolean', description: 'package.json exports["./invariant"] present' },
          hasFilesEntry: { type: 'boolean', description: 'package.json files[] contains lib/invariant.js' },
          hasTsconfigRef: { type: 'boolean', description: 'tsconfig.json references the invariants project' },
          specFile: { type: 'string', description: 'tests/invariant* path, or empty string' },
        },
      },
    },
    peerDepOffenders: { type: 'array', items: { type: 'string' }, description: 'the packages whose dsh-invariants peerDependency the gate rejects' },
    peerDepDeclarersTotal: { type: 'integer', description: 'how many packages declare it at all -- the conditional-rule denominator' },
    specFiles: { type: 'array', items: { type: 'string' } },
    reproducedViolations: { type: 'integer', description: 'violation count you derived from source, NOT from running the gate' },
  },
}

const BATCH_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['dirs', 'editsApplied', 'skipped', 'mode', 'detail'],
  properties: {
    dirs: { type: 'array', items: { type: 'string' } },
    editsApplied: { type: 'integer' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'edits that did not apply, with why' },
    mode: { type: 'string' },
    detail: { type: 'string' },
  },
}

const mode = (args && args.mode) === 'apply' ? 'apply' : 'analyze'
const BATCH_SIZE = (args && args.batchSize) || 6

phase('Discover')
const plan = await agent(IRON + `

=== TASK: enumerate every empty invariant companion (READ-ONLY, no gate runs) ===

The gate 'pnpm run verify-package-invariants' reports 74 violations: 67 "empty install function is
unnecessary; omit the companion and its publication wiring" plus 7 "must not be a peerDependency under this
package dependency policy". DO NOT run the gate -- derive the list from source so the number is stable.

Find every package with a src/invariant.ts whose install function is EMPTY. Read scripts/package-invariants.ts
first to learn exactly what the rule considers empty, and what its paired rules are -- note especially the
rule around lines 120-126 ("files must omit lib/invariant.js when src/invariant.ts is absent"), because that
is why deleting the companion without also fixing package.json files[] just swaps one red for another.

For EACH such package report, by checking rather than assuming:
  - dir
  - hasInvariantSrc
  - hasExportsEntry     (package.json exports has a "./invariant" key)
  - hasFilesEntry       (package.json files[] contains "lib/invariant.js")
  - hasTsconfigRef      (that package tsconfig.json references the invariants project)
  - specFile            (a tests/invariant* file, or "")

THE TRAP YOU MUST QUANTIFY: the peerDependency rule is CONDITIONAL on usesFlattenedPackageDependencies.
Roughly 103 packages declare @deepseek-ai/dsh-invariants as a peerDependency and only ~7 are violations, so a
mass strip would break 96 correct declarations. Report peerDepOffenders (the violating ones, named) and
peerDepDeclarersTotal (all declarers). If your numbers differ from 7 and 103, trust yours and say so.

Write the full plan to /tmp/um-invariant-plan.md incrementally as you go, then return the structured result.
`, { label: 'discover:companions', phase: 'Discover', schema: PLAN, agentType: 'general-purpose' })

if (plan === null) return { error: 'discovery returned null -- nothing applied' }

const pkgs = plan.packages || []
const batches = []
for (let i = 0; i < pkgs.length; i += BATCH_SIZE) batches.push(pkgs.slice(i, i + BATCH_SIZE))
log(`mode=${mode} · ${pkgs.length} packages · ${batches.length} disjoint batches of <=${BATCH_SIZE} · peerDep offenders ${(plan.peerDepOffenders || []).length}/${plan.peerDepDeclarersTotal}`)

phase('Retire')
const results = await parallel(batches.map((batch, idx) => () => agent(IRON + `

=== TASK: retire the invariant companions in THIS batch only (batch ${idx + 1}/${batches.length}) ===

Mode: **${mode}**.
${mode === 'apply'
  ? 'APPLY: make the edits on disk. Every package below lives in its own directory, so no other agent touches your files -- but do not stray outside them.'
  : 'ANALYZE: make NO edit. Write the exact intended change per file to /tmp/um-invariant-patch-' + (idx + 1) + '.md (old text -> new text, verbatim), so a human can read the plan before it lands.'}

Your packages (touch NOTHING else):
${JSON.stringify(batch, null, 1)}

Per package, the four edits -- apply only the ones the flags say are present:
  1. delete src/invariant.ts
  2. remove the "./invariant" key from package.json exports
  3. remove "lib/invariant.js" from package.json files[]
  4. remove the invariants project reference from tsconfig.json
  plus: delete the tests/invariant* spec if specFile is non-empty.

DISCIPLINE:
  - Edit JSON by parsing and re-serialising ONLY if you preserve the exact existing formatting; otherwise prefer
    a byte-splice with an asserted unique anchor. This repo has been bitten by anchor drift -- assert the anchor
    occurs EXACTLY ONCE before writing, and fail loudly if not.
  - Do NOT remove the dsh-invariants peerDependency here. That rule is conditional and most declarations are
    correct; the offenders are handled separately.
  - Do NOT run any gate, build, generator, or git write. You cannot verify your own work here, and that is
    intentional -- the main session runs verify-package-invariants once, afterwards.
  - If a flag says an edit applies but you cannot find it, record it in skipped[] with the reason rather than
    guessing.
`, { label: 'retire:batch' + (idx + 1), phase: 'Retire', schema: BATCH_RESULT, agentType: 'general-purpose' })))

const landed = results.filter(Boolean)
const totalEdits = landed.reduce((n, r) => n + (r.editsApplied || 0), 0)
log(`${landed.length}/${batches.length} batches returned · ${totalEdits} edits ${mode === 'apply' ? 'applied' : 'planned'}`)

phase('Cross-check')
const crosscheck = await agent(IRON + `

=== TASK: independently re-derive the residue and hunt for what the sweep got wrong (READ-ONLY) ===

A sweep just ${mode === 'apply' ? 'APPLIED' : 'PLANNED'} the retirement of empty invariant companions.
Do NOT trust its self-report. Without running any gate:

1. Re-derive from source how many empty invariant companions remain. ${mode === 'apply' ? 'Expect 0.' : 'Expect the original count, since nothing was applied.'}
2. Find any package where the companion was ${mode === 'apply' ? 'deleted but package.json still lists "lib/invariant.js" in files[], or still exports "./invariant", or whose tsconfig.json still references the invariants project' : 'planned for deletion while one of its three companion edits was missed'}. Each of those is a red the paired rule will report.
3. Confirm no dsh-invariants peerDependency was stripped from a package that was NOT an offender. The offenders were:
   ${JSON.stringify(plan.peerDepOffenders || [])} out of ${plan.peerDepDeclarersTotal} declarers. Any other removal is a regression.
4. Confirm nothing outside the listed package directories changed: 'git status --porcelain' (read-only) and check
   every path against the batch lists.
5. Name the coupling the main session must respect: packages/client/ui-settings-models is ALSO owned by
   UM-UI-SETTINGS-MODELS-RE-PORT, and packages/subagent/subagent-qoder is ALSO owned by
   UM-QODER-SUBAGENT-RETIRE. Say whether either was touched, and what that means for the other ticket count.

Report what is broken, not what is fine. If you find nothing wrong, say what you checked so a human can judge
whether you looked hard enough.

BATCH SELF-REPORTS (treat as claims, not facts):
${JSON.stringify(landed, null, 1)}
`, { label: 'crosscheck:residue', phase: 'Cross-check', agentType: 'general-purpose' })

return {
  mode,
  packages: pkgs.length,
  reproducedViolations: plan.reproducedViolations,
  peerDep: { offenders: plan.peerDepOffenders, declarers: plan.peerDepDeclarersTotal },
  batches: landed.length,
  totalEdits,
  crosscheck,
  mainSessionMustRun: [
    'pnpm run verify-package-invariants   (expect 74 -> 7, the peerDep offenders remain)',
    'pnpm run verify-built-package-invariants',
    'node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -b tsconfig.host.json',
    'node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -b tsconfig.client.json',
    'pnpm run lint:contracts-ready        (must stay 0 errors 0 warnings)',
    'then regen whatever the deletions moved: gen-architecture-graph / gen-module-graph / gen-cordis-catalog --check first',
  ],
}
