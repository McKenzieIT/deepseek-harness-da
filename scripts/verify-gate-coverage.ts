/**
 * Meta-gate: assert every `verify-*` / `gen-*` package script is either enrolled
 * in at least one `run-gates.ts` mode (via `pnpmScript`) or explicitly exempted
 * in `scripts/gate-coverage.manifest.json`. Prevents the "wrote a gate nobody
 * runs" blind spot (UM12 out-of-group gate list).
 * @module scripts/verify-gate-coverage
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** Matches a `pnpmScript('gateId', 'scriptName', …)` call, capturing the
 *  second argument (the package.json script name). Single-quoted only, which
 *  matches the repo convention; variable arguments (e.g. `lintGate`'s `script`
 *  param) are intentionally skipped. */
const PNPM_SCRIPT_CALL_PATTERN = /pnpmScript\(\s*'[^']*',\s*'([^']*)'/g

/** Matches a `pnpmExec('gateId', […], …)` call, capturing the first argument
 *  (the gate identifier). Gates enrolled via `pnpmExec` do not correspond to
 *  package.json script names, but their identifier is still an enrolled gate
 *  for the purposes of Check 4 (knownRed enrolled-gate assertion). */
const PNPM_EXEC_CALL_PATTERN = /pnpmExec\(\s*'([^']*)'/g

/** Package script names this gate accounts for. Generators (`gen-*`) are
 *  write operations, not gates; they are exempted with their `--check`
 *  variant as `coveredBy`. */
const GATE_SCRIPT_PATTERN = /^(?:verify-|gen-)/

interface GateCoverageExemption {
  readonly script: string
  readonly reason: string
  readonly coveredBy: string
}

interface KnownRedEntry {
  readonly script: string
  readonly state: string
  readonly rationale: string
  readonly ticket: string
  readonly reopenTrigger: string
  readonly reviewBy: string
}

interface GateCoverageManifest {
  readonly exemptions: readonly GateCoverageExemption[]
  readonly knownRed?: readonly KnownRedEntry[]
}

/**
 * Extract the set of gate identifiers and package.json script names enrolled
 * in `run-gates.ts`. `pnpmScript` contributes its second argument (the
 * package.json script name); `pnpmExec` contributes its first argument (the
 * gate identifier). The union is the set Check 4 tests knownRed entries
 * against, and Checks 1–3 use the pnpmScript subset (gate scripts never
 * collide with pnpmExec identifiers, so the union is safe for all checks).
 * @param runGatesSource - the full text of `scripts/run-gates.ts`.
 * @returns the set of enrolled script names and gate identifiers.
 */
function collectEnrolledScriptNames(runGatesSource: string): Set<string> {
  const enrolled = new Set<string>()
  for (const match of runGatesSource.matchAll(PNPM_SCRIPT_CALL_PATTERN)) {
    const script = match[1]
    if (typeof script === 'string') enrolled.add(script)
  }
  for (const match of runGatesSource.matchAll(PNPM_EXEC_CALL_PATTERN)) {
    const id = match[1]
    if (typeof id === 'string') enrolled.add(id)
  }
  return enrolled
}

/**
 * Return every `verify-*` / `gen-*` script name in the root `package.json`.
 * @param root - the repository root directory.
 * @returns the set of gate-like script names.
 */
function collectGateScriptNames(root: string): Set<string> {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  return new Set(Object.keys(manifest.scripts).filter(script => GATE_SCRIPT_PATTERN.test(script)))
}

/**
 * Return gate-coverage violations as human-readable strings. A violation is
 * either an unaccounted gate (enrolled nowhere, exempted nowhere) or a stale
 * manifest exemption (pointing at a deleted script or a now-enrolled script).
 * @param root - the repository root directory.
 * @returns failure messages, one per violation.
 */
export function collectGateCoverageViolations(root: string): string[] {
  const failures: string[] = []

  const runGatesSource = readFileSync(resolve(root, 'scripts/run-gates.ts'), 'utf8')
  const enrolled = collectEnrolledScriptNames(runGatesSource)

  const gateScripts = collectGateScriptNames(root)

  const manifest = JSON.parse(
    readFileSync(resolve(root, 'scripts/gate-coverage.manifest.json'), 'utf8'),
  ) as GateCoverageManifest
  const exempted = new Map<string, GateCoverageExemption>()
  for (const entry of manifest.exemptions) {
    exempted.set(entry.script, entry)
  }

  // Check 1 — every verify-*/gen-* script must be enrolled or exempted.
  for (const script of gateScripts) {
    if (enrolled.has(script)) continue
    if (exempted.has(script)) continue
    failures.push(
      `${script}: not enrolled in any run-gates.ts mode and not exempted in scripts/gate-coverage.manifest.json`
        + ' — either enroll it via pnpmScript in run-gates.ts or add an exemption with a reason.',
    )
  }

  // Check 2 — every manifest exemption must reference an existing verify-*/gen-* script.
  for (const entry of manifest.exemptions) {
    if (gateScripts.has(entry.script)) continue
    failures.push(
      `${entry.script}: exempted in scripts/gate-coverage.manifest.json but no longer a verify-*/gen-* script in package.json`
        + ' (renamed or deleted? remove the stale exemption).',
    )
  }

  // Check 3 — no exemption for a script that is now enrolled.
  for (const entry of manifest.exemptions) {
    if (!enrolled.has(entry.script)) continue
    failures.push(
      `${entry.script}: exempted in scripts/gate-coverage.manifest.json but is now enrolled in run-gates.ts`
        + ' — remove the stale exemption.',
    )
  }

  // Check 4 — every knownRed entry must name an enrolled gate (pnpmScript or pnpmExec).
  const knownRed = manifest.knownRed ?? []
  for (const entry of knownRed) {
    if (enrolled.has(entry.script)) continue
    failures.push(
      `${entry.script}: listed in knownRed[] but not enrolled in run-gates.ts`
        + ' (not found as a pnpmScript script name or pnpmExec gate identifier)'
        + ' — remove the stale knownRed entry or enroll the gate.',
    )
  }

  return failures
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const failures = collectGateCoverageViolations(ROOT)
  if (failures.length > 0) {
    process.stderr.write('verify-gate-coverage: gate coverage violations:\n')
    for (const failure of failures) process.stderr.write(`  ${failure}\n`)
    process.exit(1)
  }

  process.stdout.write(
    'verify-gate-coverage: every verify-*/gen-* script is enrolled or explicitly exempted.\n',
  )
}
