export const meta = {
  name: 'um-ui-settings-models-report',
  description: 'UM-UI-SETTINGS-MODELS-RE-PORT: classify every file in packages/client/ui-settings-models against merge-base 141eb6fef8 and upstream c389f96bf3, then propose + adversarially review a merge per diverged file. ANALYZE-ONLY: writes proposals to /tmp, never edits the repo. The main session applies, gates, and commits.',
  phases: [
    { title: 'Classify', detail: 'one agent buckets every file: three-way-merge / adopt-upstream / restore / delete / already-equal' },
    { title: 'Propose', detail: 'one agent per diverged file: read all three versions, write a proposed merge to /tmp' },
    { title: 'Challenge', detail: 'per proposal, a reviewer hunts for semantic loss and for fork work being reverted' },
  ],
  whenToUse: 'Next session, for UM-UI-SETTINGS-MODELS-RE-PORT. This is a semantic re-merge, so it stays analyze-only by design -- read the proposals, then apply them yourself.',
}

const IRON = [
  'ENVIRONMENT IRON LAWS:',
  'TOOL ACCESS: built-in Read/Write/Edit/Bash/Grep/Glob are BLOCKED. Call ToolSearch for',
  '"mcp__local__bash mcp__local__read_file mcp__local__write_file mcp__local__glob mcp__local__list_dir"',
  'to load their schemas, then use ONLY those.',
  'mcp__local__grep is UNRELIABLE -> use grep -rEn inside mcp__local__bash. rg and grep -P do NOT exist (BSD grep only).',
  'node v24 MANDATORY: prefix EVERY bash with: export PATH="/usr/local/bin:$PATH".',
  'Shell is sh NOT bash: no <(...); use temp files.',
  'TREE: /Users/mckenzie/workspace/dsh-resync (branch upstream/resync-2026-09-08, no eval session).',
  'NEVER touch /Users/mckenzie/workspace/deepseek-harness-da (master; perpetual eval).',
  '',
  'ANALYZE-ONLY, ABSOLUTELY: modify NO file in the repo. Write ONLY under /tmp.',
  'Read-only git is fine (show/diff/cat-file/log). Any git WRITE is forbidden.',
  'No build, no generator, no gate, no commit. Concurrent gate runs on one tree read each other half-applied',
  'state -- on 2026-09-11 a subagent reported a gate GREEN only because it sampled during another process',
  'temporary regen. Gates belong to the main session, run once. House rule 2/3.',
  '',
  'RUNNER: flaky on long calls -> keep every bash SHORT; long content goes to /tmp via mcp__local__write_file.',
  'Write /tmp INCREMENTALLY so partial results survive.',
  '',
  'STEP 0 PROBE: mcp__local__bash: export PATH="/usr/local/bin:$PATH"; echo PROBE_ALIVE; node -v',
  'If it fails or node is not v24.x, STOP and return: NO_MCP_LOCAL_ACCESS_OR_BAD_NODE plus what you saw.',
].join('\n')

// Verified 2026-09-11 by the um-ticket-workflow-inputs run: the fan-out is NOT fully independent.
// Proposals can still be produced in parallel (they only write /tmp), but APPLY has a topological order,
// and every proposer must know these couplings or it will propose something incoherent.
const COUPLINGS = [
  'store.ts BEFORE slot-contract.ts: HEAD store.ts has NO ProviderDirectoryEntry, and upstream slot-contract.ts imports it (import type { ProviderDirectoryEntry } from ./store.ts). Restoring slot-contract.ts first does not compile.',
  'README.md Extension-slots section MUST land in the SAME commit as the slot-contract.ts restore -- it links to that file, so verify-md-links goes red if they split.',
  'index.ts AFTER operations.ts and slot-contract.ts: upstream index.ts imports createModelsOperations from ./operations.ts and re-exports types from ./slot-contract.ts.',
  'README.i18n.yaml LAST: its whole delta is the recorded sha1 pair. Never hand-merge it -- regenerate after BOTH READMEs land, via an explicit scoped verify-translation-pairing --write on the pair you actually reviewed. Never --all.',
  'package.json: the exports[./invariant] + files[lib/invariant.js] + peerDependencies[dsh-invariants] trio is UM-INVARIANT-COMPANION-CLEANUP scope, NOT this ticket. Re-port-owned here: upstream drops dsh-client-ui-renderer and dsh-client-connection from peerDependencies and adds dsh-util-values to devDependencies (the restored operations.ts needs it). KEEP the fork version 0.1.0-rc.8 -- do NOT adopt upstream 0.1.3-alpha.2, versions are release-managed.',
  'tests/apply.client.spec.ts is DOUBLE-OWNED: upstream 15f2997bcb added the host-Loader-inert assertion here as the landing site for the deleted invariant spec (UM-INVARIANT work), while its inject list must separately grow 5 -> 8 entries (re-port work).',
  'src/client/ProviderEditor.tsx is the one file M1 resolved as ours, so its fork side is deliberate rather than an artifact of the package-wide revert. Read both diffs before touching it.',
]

// The central semantic axis upstream introduced: it replaced ctx-threading with an operations facade.
// Every injected-props file below is a consumer of that one decision, so they must move together or not at all.
const AXIS = 'Upstream swapped `ctx` for an `operations` facade (createModelsOperations in src/client/operations.ts): ModelsSectionInjected, DeepSeekOnboardingInjected and CustomProviderCard all receive `operations` upstream where HEAD receives `ctx`. Adopting it piecemeal leaves the package internally inconsistent -- decide the facade once, then apply it across every consumer in the same change.'

const PKG = 'packages/client/ui-settings-models'
const BASE = '141eb6fef8'   // merge-base: the fork point this package was reverted to by M1
const UP = 'c389f96bf3'     // upstream revision the fork is re-porting against

const CLASSIFICATION = {
  type: 'object',
  additionalProperties: false,
  required: ['files', 'counts', 'couplings', 'notes'],
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'bucket', 'evidence'],
        properties: {
          path: { type: 'string' },
          bucket: { type: 'string', description: 'three-way-merge | adopt-upstream | restore | delete | already-equal | owned-elsewhere' },
          evidence: { type: 'string', description: 'the diff/cat-file result that decided it' },
        },
      },
    },
    counts: { type: 'string', description: 'count per bucket' },
    couplings: { type: 'array', items: { type: 'string' }, description: 'files another ticket owns' },
    notes: { type: 'string' },
  },
}

const PROPOSAL = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'patchFile', 'forkIntentKept', 'upstreamIntentKept', 'conflicts', 'confidence'],
  properties: {
    path: { type: 'string' },
    patchFile: { type: 'string', description: '/tmp path holding the proposed content' },
    forkIntentKept: { type: 'string', description: 'what fork-only behaviour the merge preserves' },
    upstreamIntentKept: { type: 'string', description: 'what upstream change the merge adopts' },
    conflicts: { type: 'array', items: { type: 'string' }, description: 'genuine semantic conflicts a human must rule on' },
    confidence: { type: 'string', description: 'high | medium | low, and why' },
  },
}

const CHALLENGE = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'revertsForkWork', 'losesUpstreamChange', 'breaksSlotContract', 'refuted', 'detail'],
  properties: {
    path: { type: 'string' },
    revertsForkWork: { type: 'boolean' },
    losesUpstreamChange: { type: 'boolean' },
    breaksSlotContract: { type: 'boolean' },
    refuted: { type: 'boolean' },
    detail: { type: 'string' },
  },
}

phase('Classify')
const cls = await agent(IRON + `

=== TASK: bucket every file in ${PKG} (READ-ONLY) ===

Three revisions matter: merge-base **${BASE}** (the fork point M1 reverted this package to), upstream
**${UP}**, and current **HEAD**. Put every file under ${PKG} in exactly one bucket:

  three-way-merge  diverged from BOTH ${BASE} and ${UP} -> a real semantic merge is needed
  adopt-upstream   still byte-identical to ${BASE} while upstream moved -> take upstream
  restore          exists at ${UP}, absent at HEAD
  delete           upstream deleted it, fork still ships ${BASE} bytes
  already-equal    HEAD already equals ${UP} -> no work
  owned-elsewhere  another ticket owns this file (see couplings below)

Decide with 'git cat-file -e' and 'git diff --stat <rev> HEAD -- <path>'. Do not eyeball.

COUPLINGS you must detect and bucket as owned-elsewhere, not merge:
  - src/invariant.ts and tests/invariant.client.spec.ts -- upstream DELETED both, and both are in the ~67
    empty-companion set owned by UM-INVARIANT-COMPANION-CLEANUP. That ticket should land FIRST; if this one
    merges them it will re-litigate or wrongly restore them.
  - package.json is also one of UM-INVARIANT's 7 peerDependency offenders.

TRAP -- do not silently revert fork work that landed after the ticket was written:
  commit 5fe9b32e44 (UM-LINT-A) edited tests/components.client.spec.tsx and tests/provider-form.client.spec.tsx
  by REMOVING a 'ctx as never' cast at each site, because the cast only existed to paper over a host/client
  Cordis Context collision that has since been fixed at the root. A naive three-way merge against upstream can
  reintroduce those casts. Flag both files explicitly in notes.

ALREADY-VERIFIED COUPLINGS -- confirm each still holds and bucket accordingly, do not re-derive from scratch:
${COUPLINGS.map(c => '  - ' + c).join('\n')}

THE CENTRAL AXIS: ${AXIS}

Also settle and quote in notes: do docs/subsystems/slots.md and slots.zh.md around line 126-127 still advertise
'settings.models.provider-card' and 'settings.models.footer', and does slot-catalog.ts actually declare either?

Write the full classification to /tmp/um-uism-classification.md, then return the structured result.
`, { label: 'classify:ui-settings-models', phase: 'Classify', schema: CLASSIFICATION, agentType: 'general-purpose' })

if (cls === null) return { error: 'classification returned null' }

const toMerge = (cls.files || []).filter(f => f.bucket === 'three-way-merge')
log(`${(cls.files || []).length} files classified · ${toMerge.length} need a semantic merge · couplings: ${(cls.couplings || []).join(', ') || 'none'}`)

phase('Propose')
const reviewed = await pipeline(
  toMerge,
  f => agent(IRON + `

=== TASK: propose a merge for ONE file (ANALYZE-ONLY) ===

File: **${f.path}**
Why it is here: ${f.evidence}

Read all three versions: 'git show ${BASE}:${f.path}', 'git show ${UP}:${f.path}', and HEAD on disk.
Then write the proposed merged content to /tmp/um-uism/<flattened-path> using mcp__local__write_file.
Create the directory first if needed. **Do not touch the repo file.**

THE CENTRAL AXIS you are merging against: ${AXIS}

COUPLINGS that constrain your proposal (do not propose something that violates one):
${COUPLINGS.map(c => '  - ' + c).join('\n')}

What a good merge does here: keep the fork behaviour that was added after ${BASE}, adopt the upstream
refactor, and do not quietly drop either. Name both sides explicitly in your answer -- if you cannot say what
fork intent you preserved, you have probably just taken upstream wholesale.

Report genuine semantic conflicts in conflicts[] rather than picking a side. Slot contract changes and
provider-card mount-point moves are the two known ways this package conflicts non-trivially.

If this file is tests/components.client.spec.tsx or tests/provider-form.client.spec.tsx: HEAD deliberately has
NO 'ctx as never' cast (commit 5fe9b32e44 removed it because the underlying type collision is fixed). Your
merge must not reintroduce it. Say so explicitly.
`, { label: 'propose:' + f.path.split('/').pop(), phase: 'Propose', schema: PROPOSAL, agentType: 'general-purpose' }),
  (prop, f) => prop === null ? null : agent(IRON + `

=== TASK: try to REFUTE this proposed merge. Default to refuted if unsure. ===

File: **${f.path}**
Proposal is at: ${prop.patchFile}

Read the proposal, plus '${BASE}', '${UP}' and HEAD versions yourself. Then answer:
  1. revertsForkWork      -- does it drop behaviour HEAD has and ${BASE} did not?
  2. losesUpstreamChange  -- does it drop a change ${UP} made?
  3. breaksSlotContract   -- does it assume a slot, prop, or mount point that slot-catalog.ts does not declare?
  4. For the two spec files: does it reintroduce 'ctx as never'? That is an automatic refutation.

Be concrete: quote the lines. Set refuted true if a human should not apply this as-is.

PROPOSAL CLAIMS (treat as claims, not facts):
${JSON.stringify(prop, null, 1)}
`, { label: 'challenge:' + f.path.split('/').pop(), phase: 'Challenge', schema: CHALLENGE, agentType: 'general-purpose' })
    .then(v => ({ path: f.path, proposal: prop, challenge: v })),
)

const ok = reviewed.filter(Boolean)
const clean = ok.filter(r => r.challenge && !r.challenge.refuted)
const blocked = ok.filter(r => r.challenge && r.challenge.refuted)
log(`${clean.length} proposals survived review · ${blocked.length} refuted · ${ok.length - clean.length - blocked.length} inconclusive`)

return {
  classification: { counts: cls.counts, couplings: cls.couplings, notes: cls.notes },
  mechanical: (cls.files || []).filter(f => ['adopt-upstream', 'restore', 'delete'].indexOf(f.bucket) !== -1),
  ownedElsewhere: (cls.files || []).filter(f => f.bucket === 'owned-elsewhere'),
  merges: { clean, blocked },
  couplings: COUPLINGS,
  axis: AXIS,
  // Proposals are produced in parallel, but APPLY is ordered. This is the order, derived from COUPLINGS.
  applyOrder: [
    '1. UM-INVARIANT-COMPANION-CLEANUP lands first (it owns src/invariant.ts, tests/invariant.client.spec.ts and the package.json invariant trio here).',
    '2. store.ts -- must gain ProviderDirectoryEntry before anything can import it.',
    '3. operations.ts (restore) + slot-contract.ts (restore) -- slot-contract.ts imports ProviderDirectoryEntry from step 2.',
    '4. README.md + README.zh.md, in the SAME commit as step 3, because the Extension-slots section links to slot-contract.ts.',
    '5. index.ts -- imports createModelsOperations and re-exports slot-contract types, so it needs steps 2-3.',
    '6. the operations-facade consumers together: ModelsSection.tsx, CustomProviderCard.tsx, DeepSeekOnboardingDialog.tsx, ModelListEditor.tsx, ProviderEditor.tsx.',
    '7. the specs, including the 5 -> 8 inject-list growth in tests/apply.client.spec.ts.',
    '8. the mechanical bucket (adopt-upstream / restore / delete) may go any time; it needs no judgement.',
    '9. README.i18n.yaml LAST: regenerate the recorded pair, scoped to the pair you reviewed. Never --all.',
  ],
  mainSessionMustDo: [
    'Land UM-INVARIANT-COMPANION-CLEANUP first if it owns src/invariant.ts here -- otherwise this re-port re-litigates it.',
    'Apply the mechanical bucket (adopt-upstream / restore / delete) directly; it needs no judgement.',
    'Read each surviving proposal before applying it. The refuted ones need a human ruling, not a retry.',
    'Then: tsc -b tsconfig.client.json, lint:contracts-ready (must stay 0/0), gen-doc-graphs --check, and',
    'restore the README "Extension slots" section (e17f0fa16c deleted it) plus the bilingual .zh.md + .i18n.yaml pair.',
    'Finally decide the docs/subsystems/slots{,.zh}.md:126-127 lines: delete them, or make them true.',
  ],
}
