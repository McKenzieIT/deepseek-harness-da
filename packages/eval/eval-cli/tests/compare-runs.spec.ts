/**
 * `compareRuns` renders the only artifact a human reads when deciding whether an
 * eval change helped, so every character of that report is pinned here: the
 * per-category pass rates, the sign and magnitude of each delta, the column
 * padding, the gained/lost/new/removed lists and their 10-row caps, and the net
 * flip line. Whole-report equality — not substring probes — is what catches a
 * rate computed over the wrong denominator or a delta whose sign is inverted.
 *
 * Three behaviors the report depends on and that are asserted through it:
 *
 *   - The protocol guard. Two runs whose recorded protocols are known AND
 *     different is an error (`process.exit(2)`, overridable with
 *     `--allow-protocol-mismatch`), because a k=1 vs k=3 pass^k gap is ~12pp of
 *     protocol rather than quality. A run that records nothing only warns, so
 *     the ~169 baselines written before 2026-09-04 stay diffable.
 *   - The Voice EXEC / Voice DELIVERY split, which is read out of the case YAML
 *     found relative to the *current working directory*. A case counts as
 *     DELIVERY only when it declares `delivery_match` and no `match_mode`.
 *   - The fallback when that repo layout is not found: Voice stays one category
 *     instead of being guessed at, and the report still renders.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/compare-runs.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareRuns } from '../src/compare.ts'

interface FixtureCase {
  case_id: string
  verdict: string
}

interface FixtureConfig {
  pass_k?: number
  verdict_semantics?: string
}

interface Rendered {
  out: string[]
  err: string[]
  exitCodes: number[]
}

/** The protocol most fixtures share, so protocol noise stays out of table tests. */
const PROTOCOL_K3: FixtureConfig = { pass_k: 3, verdict_semantics: 'pass^k' }

/** Column layout: 2-space indent, 18-wide left-aligned label, 16/16/10 right-aligned. */
const TABLE_HEADER = '  Category' + ' '.repeat(25) + 'A' + ' '.repeat(15) + 'B' + ' '.repeat(5) + 'Delta'
const TABLE_RULE = '  ' + '─'.repeat(60)

/** Directory holding every run JSON fixture; run ids are globally unique. */
let runsDir: string
/** A directory whose `packages/` tree carries a k11-v2 cases dir, so Voice splits. */
let splitRoot: string
/** A cwd three levels below `splitRoot`: the cases dir is only reachable by walking up. */
let nestedWork: string
/** A cwd with no `packages/` in any ancestor, so the cases lookup fails. */
let bareRoot: string

/**
 * Write one run result file.
 * @param runId - run id, also the file stem.
 * @param timestamp - recorded run timestamp.
 * @param cases - per-case verdicts.
 * @param passRate - recorded overall pass rate (0..1).
 * @param config - recorded protocol; omit for a pre-2026-09-04 run with no `config` key.
 */
function writeRun(
  runId: string,
  timestamp: string,
  cases: FixtureCase[],
  passRate: number,
  config?: FixtureConfig | null,
): void {
  const correct = cases.filter(c => c.verdict === 'correct').length
  const body: Record<string, unknown> = {
    run_id: runId,
    timestamp,
    cases: cases.map(c => ({ case_id: c.case_id, verdict: c.verdict, pass_k_results: [] })),
    summary: { total: cases.length, correct, wrong: cases.length - correct, pass_rate: passRate },
  }
  if (config !== undefined) body.config = config
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(body))
}

/**
 * Run a comparison from a chosen working directory and capture everything it emits.
 * `process.exit` is neutered rather than fatal so the assertion can name the code.
 * @param cwd - working directory the repo-root walk starts from.
 * @param runIdA - baseline run id.
 * @param runIdB - new run id.
 * @returns stdout lines, stderr lines, and exit codes requested.
 */
function render(cwd: string, runIdA: string, runIdB: string): Rendered {
  const out: string[] = []
  const err: string[] = []
  const exitCodes: number[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((line?: string) => { out.push(line ?? '') })
  const error = vi.spyOn(console, 'error').mockImplementation((line?: string) => { err.push(line ?? '') })
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { exitCodes.push(code ?? 0) }) as typeof process.exit)
  const previousCwd = process.cwd()
  process.chdir(cwd)
  try {
    compareRuns(runIdA, runIdB, runsDir)
  } finally {
    process.chdir(previousCwd)
    log.mockRestore()
    error.mockRestore()
    exit.mockRestore()
  }
  return { out, err, exitCodes }
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'cmp-runs-'))
  splitRoot = mkdtempSync(join(tmpdir(), 'cmp-root-'))
  bareRoot = mkdtempSync(join(tmpdir(), 'cmp-bare-'))

  // The layout `findRepoRoot` looks for: a directory containing `packages`.
  const casesDir = join(splitRoot, 'packages', 'eval', 'eval', 'cases', 'k11-v2')
  mkdirSync(casesDir, { recursive: true })
  // Deliberately three levels below it, so a comparison run from a subdirectory
  // has to walk up to find the cases — the same thing that happens when the CLI
  // is invoked from inside a package rather than the repository root.
  nestedWork = join(splitRoot, 'nested', 'deep', 'work')
  mkdirSync(nestedWork, { recursive: true })
  // delivery_match and no match_mode → DELIVERY.
  writeFileSync(join(casesDir, 'voice-delivery.yaml'), 'case_id: k11v2_voice_deliv_1\nexpected:\n  delivery_match: chart.render\n')
  // delivery_match AND match_mode → still EXEC; the case is executed, not just delivered.
  writeFileSync(join(casesDir, 'voice-exec.yaml'), 'case_id: k11v2_voice_exec_1\nexpected:\n  delivery_match: chart.render\n  match_mode: strict\n')
  // match_mode only → EXEC (.yml is collected as well as .yaml).
  writeFileSync(join(casesDir, 'voice-exec-2.yml'), 'case_id: k11v2_voice_exec_2\nexpected:\n  match_mode: strict\n')
  // No `expected` block at all.
  writeFileSync(join(casesDir, 'original.yaml'), 'case_id: k11v2_orig_1\nprompt: total revenue by region\n')
  // Unparseable, and NOT YAML: reaching it would throw and silently collapse the
  // Voice split, so the EXEC/DELIVERY rows below also prove the extension filter.
  writeFileSync(join(casesDir, 'notes.txt'), '{ unclosed: [1, 2')

  writeRun('run-split-a', '2026-09-01T00:00:00Z', [
    { case_id: 'orig_stable', verdict: 'correct' },
    { case_id: 'orig_gain', verdict: 'wrong' },
    { case_id: 'k11v2_alias_drop', verdict: 'correct' },
    { case_id: 'k11v2_voice_exec_1', verdict: 'correct' },
  ], 0.75, PROTOCOL_K3)
  writeRun('run-split-b', '2026-09-02T00:00:00Z', [
    { case_id: 'orig_stable', verdict: 'correct' },
    { case_id: 'orig_gain', verdict: 'correct' },
    { case_id: 'k11v2_voice_exec_1', verdict: 'wrong' },
    { case_id: 'k11v2_voice_deliv_1', verdict: 'wrong' },
  ], 0.5, PROTOCOL_K3)

  // 100 correct Original cases make the A column label exactly 16 characters —
  // the width of the column — which is the only way to observe that a label at
  // or over the column width is emitted with no padding at all.
  const flatCases: FixtureCase[] = [
    ...Array.from({ length: 100 }, (_, i) => ({ case_id: `orig_${String(i).padStart(3, '0')}`, verdict: 'correct' })),
    { case_id: 'k11v2_voice_a1', verdict: 'correct' },
    { case_id: 'k11v2_voice_b2', verdict: 'wrong' },
  ]
  writeRun('run-flat-a', '2026-09-03T00:00:00Z', flatCases, 101 / 102, PROTOCOL_K3)
  writeRun('run-flat-b', '2026-09-04T00:00:00Z', flatCases, 101 / 102, PROTOCOL_K3)

  writeRun('run-drop-a', '2026-09-05T00:00:00Z', [
    { case_id: 'c_one', verdict: 'correct' },
    { case_id: 'c_two', verdict: 'correct' },
  ], 1, PROTOCOL_K3)
  writeRun('run-drop-b', '2026-09-06T00:00:00Z', [
    { case_id: 'c_one', verdict: 'wrong' },
    { case_id: 'c_two', verdict: 'wrong' },
  ], 0, PROTOCOL_K3)

  writeRun('run-cap-a', '2026-09-07T00:00:00Z', [
    { case_id: 'shared_case', verdict: 'correct' },
    ...Array.from({ length: 12 }, (_, i) => ({ case_id: `gone_${String(i).padStart(2, '0')}`, verdict: 'correct' })),
  ], 1, PROTOCOL_K3)
  writeRun('run-cap-b', '2026-09-08T00:00:00Z', [
    { case_id: 'shared_case', verdict: 'correct' },
    ...Array.from({ length: 13 }, (_, i) => ({ case_id: `newb_${String(i).padStart(2, '0')}`, verdict: 'wrong' })),
  ], 1 / 14, PROTOCOL_K3)

  const probe: FixtureCase[] = [{ case_id: 'p_case', verdict: 'correct' }]
  writeRun('run-proto-nokey', '2026-09-09T00:00:00Z', probe, 1)
  writeRun('run-proto-null', '2026-09-10T00:00:00Z', probe, 1, null)
  writeRun('run-proto-empty', '2026-09-11T00:00:00Z', probe, 1, {})
  writeRun('run-proto-k1flat', '2026-09-12T00:00:00Z', probe, 1, { pass_k: 1, verdict_semantics: 'flat' })
  writeRun('run-proto-k3', '2026-09-13T00:00:00Z', probe, 1, PROTOCOL_K3)
  writeRun('run-proto-konly', '2026-09-14T00:00:00Z', probe, 1, { pass_k: 1 })
  writeRun('run-proto-semonly', '2026-09-15T00:00:00Z', probe, 1, { verdict_semantics: 'pass^k' })
})

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true })
  rmSync(splitRoot, { recursive: true, force: true })
  rmSync(bareRoot, { recursive: true, force: true })
})

describe('compareRuns report', () => {
  it('renders rates, deltas, flips and the Voice EXEC/DELIVERY split read from case YAML found above the cwd', () => {
    const { out, err, exitCodes } = render(nestedWork, 'run-split-a', 'run-split-b')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toEqual([
      '\n  Eval Run Comparison',
      '  A (baseline): run-split-a  (2026-09-01T00:00:00Z)',
      '  B (new):      run-split-b  (2026-09-02T00:00:00Z)',
      '  Protocol:     A=pass_k=3 pass^k  B=pass_k=3 pass^k',
      '',
      '  Overall: 75.0% → 50.0%  (-25.0pp)',
      '',
      TABLE_HEADER,
      TABLE_RULE,
      // 1 of 2 Original correct in A, 2 of 2 in B.
      '  Original' + ' '.repeat(15) + '50.0% (1/2)' + ' '.repeat(4) + '100.0% (2/2)' + ' '.repeat(3) + '+50.0pp',
      // Alias exists only in A, so B shows the em-dash "no cases" rate, not 0%.
      '  Alias' + ' '.repeat(17) + '100.0% (1/1)' + ' '.repeat(9) + '— (0/0)' + ' '.repeat(2) + '-100.0pp',
      // k11v2_voice_exec_1 declares delivery_match AND match_mode → EXEC.
      '  Voice EXEC' + ' '.repeat(12) + '100.0% (1/1)' + ' '.repeat(6) + '0.0% (0/1)' + ' '.repeat(2) + '-100.0pp',
      // k11v2_voice_deliv_1 declares delivery_match only → DELIVERY, and exists only in B.
      '  Voice DELIVERY' + ' '.repeat(13) + '— (0/0)' + ' '.repeat(6) + '0.0% (0/1)' + ' '.repeat(4) + '+0.0pp',
      '',
      '  Gained (1):',
      '    + orig_gain  [Original]',
      '',
      '  Lost (1):',
      '    - k11v2_voice_exec_1  [Voice EXEC]',
      '',
      '  New cases in B (1):',
      '    ~ k11v2_voice_deliv_1  [wrong]',
      '',
      '  Removed from B (1):',
      '    × k11v2_alias_drop',
      '',
      '  Net: +1 / -1 = +0 flips',
      '',
    ])
  })

  it('keeps Voice as one category and omits every flip section when nothing moved', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-flat-a', 'run-flat-b')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toEqual([
      '\n  Eval Run Comparison',
      '  A (baseline): run-flat-a  (2026-09-03T00:00:00Z)',
      '  B (new):      run-flat-b  (2026-09-04T00:00:00Z)',
      '  Protocol:     A=pass_k=3 pass^k  B=pass_k=3 pass^k',
      '',
      '  Overall: 99.0% → 99.0%  (+0.0pp)',
      '',
      TABLE_HEADER,
      TABLE_RULE,
      // "100.0% (100/100)" is exactly the 16-wide column: emitted unpadded.
      '  Original' + ' '.repeat(10) + '100.0% (100/100)' + '100.0% (100/100)' + ' '.repeat(4) + '+0.0pp',
      // No cases dir above bareRoot, so the two k11v2_voice_* cases stay pooled
      // under one "Voice" row instead of being guessed into EXEC/DELIVERY.
      '  Voice' + ' '.repeat(18) + '50.0% (1/2)' + ' '.repeat(5) + '50.0% (1/2)' + ' '.repeat(4) + '+0.0pp',
      '',
      '  Net: +0 / -0 = +0 flips',
      '',
    ])
  })

  it('reports a negative net when every shared case regressed', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-drop-a', 'run-drop-b')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toEqual([
      '\n  Eval Run Comparison',
      '  A (baseline): run-drop-a  (2026-09-05T00:00:00Z)',
      '  B (new):      run-drop-b  (2026-09-06T00:00:00Z)',
      '  Protocol:     A=pass_k=3 pass^k  B=pass_k=3 pass^k',
      '',
      '  Overall: 100.0% → 0.0%  (-100.0pp)',
      '',
      TABLE_HEADER,
      TABLE_RULE,
      '  Original' + ' '.repeat(14) + '100.0% (2/2)' + ' '.repeat(6) + '0.0% (0/2)' + ' '.repeat(2) + '-100.0pp',
      '',
      '  Lost (2):',
      '    - c_one  [Original]',
      '    - c_two  [Original]',
      '',
      '  Net: +0 / -2 = -2 flips',
      '',
    ])
  })

  it('caps the new-case list at ten rows with a remainder line and the removed list at ten rows', () => {
    const { out } = render(bareRoot, 'run-cap-a', 'run-cap-b')

    const newStart = out.indexOf('  New cases in B (13):')
    expect(out.slice(newStart, newStart + 12)).toEqual([
      '  New cases in B (13):',
      '    ~ newb_00  [wrong]',
      '    ~ newb_01  [wrong]',
      '    ~ newb_02  [wrong]',
      '    ~ newb_03  [wrong]',
      '    ~ newb_04  [wrong]',
      '    ~ newb_05  [wrong]',
      '    ~ newb_06  [wrong]',
      '    ~ newb_07  [wrong]',
      '    ~ newb_08  [wrong]',
      '    ~ newb_09  [wrong]',
      '    ... and 3 more',
    ])
    expect(out).not.toContain('    ~ newb_10  [wrong]')

    const removedStart = out.indexOf('  Removed from B (12):')
    expect(out.slice(removedStart, removedStart + 11)).toEqual([
      '  Removed from B (12):',
      '    × gone_00',
      '    × gone_01',
      '    × gone_02',
      '    × gone_03',
      '    × gone_04',
      '    × gone_05',
      '    × gone_06',
      '    × gone_07',
      '    × gone_08',
      '    × gone_09',
    ])
    // The removed list has no remainder line, so the last two are simply absent.
    expect(out).not.toContain('    × gone_10')
    expect(out).not.toContain('    × gone_11')
  })
})

describe('compareRuns protocol guard', () => {
  it('warns without failing when neither run recorded a protocol', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-proto-nokey', 'run-proto-null')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toContain('\n  ⚠ protocol unverified: neither run records its run config (pre-2026-09-04).')
    expect(out).toContain('      A: unknown    B: unknown')
    expect(out).toContain('    If one is k=1 and the other k=3 pass^k, the delta below is')
    expect(out).toContain('    ~12pp of protocol artifact. Check what the run recorded.')
    expect(out).toContain('  Protocol:     A=unknown  B=unknown')
  })

  it('names A as the side missing its config when only the baseline predates run configs', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-proto-nokey', 'run-proto-k1flat')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toContain('\n  ⚠ protocol unverified: A does not record its run config (pre-2026-09-04).')
    expect(out).toContain('      A: unknown    B: pass_k=1 flat')
    expect(out).toContain('  Protocol:     A=unknown  B=pass_k=1 flat')
  })

  it('names B as the side missing its config when its config object records neither field', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-proto-k3', 'run-proto-empty')

    expect(err).toEqual([])
    expect(exitCodes).toEqual([])
    expect(out).toContain('\n  ⚠ protocol unverified: B does not record its run config (pre-2026-09-04).')
    expect(out).toContain('      A: pass_k=3 pass^k    B: unknown')
    expect(out).toContain('  Protocol:     A=pass_k=3 pass^k  B=unknown')
  })

  it('exits 2 on two known-and-different protocols, printing each side and a missing field as "?"', () => {
    const { out, err, exitCodes } = render(bareRoot, 'run-proto-konly', 'run-proto-semonly')

    expect(err).toEqual([
      '\n  ✗ PROTOCOL MISMATCH — these runs are not comparable',
      '      A (run-proto-konly): pass_k=1 ?',
      '      B (run-proto-semonly): pass_k=? pass^k',
      '    A k=1 vs k=3 pass^k gap is ~12pp of protocol, not quality.',
      '    Re-run one side under the other\'s protocol, or pass',
      '    --allow-protocol-mismatch if you know what you are doing.\n',
    ])
    expect(exitCodes).toEqual([2])
    // A mismatch is an error, never the "unverified" warning.
    expect(out).not.toContain('      A: pass_k=1 ?    B: pass_k=? pass^k')
    expect(out).toContain('  Protocol:     A=pass_k=1 ?  B=pass_k=? pass^k')
  })

  it('still prints the mismatch but does not exit when --allow-protocol-mismatch is on argv', () => {
    process.argv.push('--allow-protocol-mismatch')
    let rendered: Rendered
    try {
      rendered = render(bareRoot, 'run-proto-konly', 'run-proto-semonly')
    } finally {
      process.argv.pop()
    }

    expect(rendered.err).toContain('\n  ✗ PROTOCOL MISMATCH — these runs are not comparable')
    expect(rendered.err).toContain('      B (run-proto-semonly): pass_k=? pass^k')
    expect(rendered.exitCodes).toEqual([])
    expect(rendered.out).toContain('  Net: +0 / -0 = +0 flips')
  })
})
