/**
 * Emit the policy-only and diagnostic-floor arm compositions.
 *
 * The three arms must share one base persona. Arm A's base persona is
 * `BASE_PERSONA` in `packages/data/phase-gate/src/phase-gate.ts`, which the
 * plugin registers as a `deployment:persona-prefix` section, shadowing the
 * deployment default. It is NOT exported, and the ticket forbids modifying
 * phase-gate, so this generator extracts it from the source and writes it into
 * both presets verbatim. Byte equality therefore holds by construction rather
 * than by a hand copy, and `tests/persona-parity.spec.ts` re-extracts it to
 * fail loudly if phase-gate's persona ever changes underneath the presets.
 *
 * Why share it verbatim rather than strip its phase-mechanical clauses: the
 * ticket names the *extra* per-phase instructions, control markers, and
 * continuation injections as the measured intervention, which implies the base
 * persona is held constant. Authoring a stripped persona would make this
 * session the author of a second variable and risk handicapping one arm. The
 * one acknowledged incoherence is that the shared persona mentions route
 * tokens and an 【incomplete】 marker that only arm A has a gate for; the
 * policy plugin ignores them, so they advantage neither arm.
 *
 * The persona row uses `prefix:`, not `text:`. `text:` has been a dead config
 * key since commit 40792330c0 renamed it, and three shipped data-agent presets
 * still carry the stale spelling — a row using `text:` fails config validation
 * on the missing required `prefix` and `mountPreset` throws
 * `agent-preset/invalid`, so the preset never joins.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const HERE = dirname(new URL(import.meta.url).pathname)
const REPO = join(HERE, '../../../../..')
const PHASE_GATE_SRC = join(REPO, 'packages/data/phase-gate/src/phase-gate.ts')

/** Pull `BASE_PERSONA`'s template literal out of the phase-gate source. */
export function extractBasePersona(source) {
  const m = source.match(/const BASE_PERSONA = `([\s\S]*?)`\n/)
  if (m === null) throw new Error('BASE_PERSONA not found in phase-gate source — the generator needs updating')
  // The literal interpolates ${INCOMPLETE_MARKER}; resolve it to the same value
  // domain.ts declares so the emitted text matches what arm A's model sees.
  return m[1].replaceAll('${INCOMPLETE_MARKER}', '【incomplete】')
}

const persona = extractBasePersona(readFileSync(PHASE_GATE_SRC, 'utf8'))
if (persona.includes('${')) throw new Error(`persona still has an unresolved interpolation: ${persona.match(/\$\{\w+\}/)?.[0]}`)

/** The 15 tools every arm exposes, and the plugin row that registers each. */
const TOOL_ROWS = [
  ['tool-scope-routing', '@deepseek-ai/dsh-tool-scope-routing', 'list_scopes + switch_scope'],
  ['tool-search-data-sources', '@deepseek-ai/dsh-tool-search-data-sources', 'search_data_sources'],
  ['tool-load-table-definition', '@deepseek-ai/dsh-tool-load-table-definition', 'load_table_definition'],
  ['tool-load-event-definition', '@deepseek-ai/dsh-tool-load-event-definition', 'load_event_definition'],
  ['tool-update-table-config', '@deepseek-ai/dsh-tool-update-table-config', 'update_table_config'],
  ['tool-present-clarification', '@deepseek-ai/dsh-tool-present-clarification', 'present_clarification'],
  ['tool-resolve-term', '@deepseek-ai/dsh-tool-resolve-term', 'resolve_term'],
  ['tool-query-data', '@deepseek-ai/dsh-query-tool', 'query_data'],
  ['tool-present-decomposition', '@deepseek-ai/dsh-tool-present-decomposition', 'present_decomposition'],
  ['tool-present-table', '@deepseek-ai/dsh-tool-present-table', 'present_table'],
  ['tool-suggest-followups', '@deepseek-ai/dsh-tool-suggest-followups', 'suggest_followups'],
  ['tool-compute', '@deepseek-ai/dsh-tool-compute', 'compute'],
]

/** YAML double-quoted scalar: the persona contains no `"` but does contain `\n`. */
const q = (s) => `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`

function compose(arm) {
  const enforce = arm === 'policy'
  const header = enforce
    ? [
      '# G25a policy-only arm: an ordinary Agent loop with deterministic query admission.',
      '#',
      '# No phase enum, no phase index, no phase prompt substitution, no automatic',
      '# advance, no fallback, no phase-scoped tool whitelist. `guardrails-policy`',
      '# enforces exactly four admission rules before `query_data` may run:',
      '#   1. a successful load_table_definition or load_event_definition first',
      '#   2. critique_sql_tool confidence >= 0.6 for the SQL about to run',
      '#   3. evaluate_sql_quality score >= 60 for that same SQL',
      '#   4. the SQL handed to query_data equals the last SQL that cleared 2 and 3',
      '# Query errors go straight back to the model; the plugin injects nothing.',
    ]
    : [
      '# G25a diagnostic-floor arm: the policy arm minus every admission rule.',
      '#',
      '# Same persona, same 15 tools, same critic-context observer, same budget, but',
      '# no pre-query grounding / critic / quality / same-source enforcement. The',
      '# critic tools stay callable if the model chooses to call them. This arm only',
      '# explains where benefit comes from; it never triggers a retention verdict and',
      '# is excluded from the state-machine-minus-policy difference.',
    ]

  const lines = [
    ...header,
    '#',
    '# GENERATED by presets/generate-presets.mjs — do not hand-edit. The persona is',
    "# phase-gate's BASE_PERSONA verbatim so persona is not a variable across arms.",
    '',
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    `    prefix: ${q(persona)}`,
    '',
    '# The critic-context provider and its two consumer tools share one isolate',
    '# realm. This is not optional: a row publishing a service into the root realm',
    "# is rejected by dsh-agent-presets' leakedServices guard and the preset never",
    '# joins, and a consumer left outside the realm resolves a root realm this',
    '# preset never populated, so ctx.get(\'criticCtx\') returns undefined, every',
    '# referenced table is flagged table_not_in_candidates, confidence lands at or',
    '# below 0.5, and query admission never opens.',
    '- id: critic-context',
    '  name: cordis:group',
    '  group: true',
    '  isolate:',
    '    criticCtx: true',
    '  config:',
    '    - id: guardrails-policy',
    "      name: '../../src/guardrails-policy.ts'",
    '      config:',
    `        enforce_admission: ${enforce}`,
    '    - id: tool-critique-sql',
    "      name: '@deepseek-ai/dsh-tool-critique-sql'",
    '    - id: tool-evaluate-sql-quality',
    "      name: '@deepseek-ai/dsh-tool-evaluate-sql-quality'",
    '',
    '# Loose rows: these publish no service, so a realm around them would hide the',
    '# host tools/schema/query instances they resolve.',
  ]
  for (const [id, pkg, provides] of TOOL_ROWS) {
    lines.push(`- id: ${id}   # ${provides}`)
    lines.push(`  name: '${pkg}'`)
  }
  return `${lines.join('\n')}\n`
}

for (const arm of ['policy', 'floor']) {
  const dir = join(HERE, arm)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.cordis.yml'), compose(arm), 'utf8')
  console.log(`wrote presets/${arm}/agent.cordis.yml`)
}
console.log(`persona: ${persona.length} chars extracted from packages/data/phase-gate/src/phase-gate.ts`)
console.log(`tool rows: ${TOOL_ROWS.length} (registering 15 tool names — scope-routing registers 2)`)
