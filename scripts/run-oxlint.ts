import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const oxlintCli = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024 * 1024
const FIX_FLAGS = new Set(['--fix', '--fix-dangerously', '--fix-suggestions'])

function isFixInvocation(args: readonly string[]): boolean {
  return args.some(arg => FIX_FLAGS.has(arg))
}

function hasOutputFormat(args: readonly string[]): boolean {
  return args.some(arg =>
    arg === '-f'
    || arg.startsWith('-f=')
    || arg === '--format'
    || arg.startsWith('--format='))
}

/** Complete Oxlint child-process arguments and environment. */
export interface OxlintInvocation {
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

/**
 * Apply the repository worker bound to both Oxlint backends.
 * @param args - Oxlint CLI arguments requested by the caller.
 * @param env - Environment inherited by the Oxlint process.
 * @returns the complete CLI arguments and child environment.
 */
export function resolveOxlintInvocation(args: readonly string[], env: NodeJS.ProcessEnv): OxlintInvocation {
  const resolvedArgs = [...args]
  if (env.CI === 'true' && !hasOutputFormat(args)) resolvedArgs.push('--format=default')
  const raw = env.DSH_OXLINT_THREADS
  if (raw === undefined || raw === '') return { args: resolvedArgs, env: { ...env } }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== raw) {
    throw new Error(`run-oxlint: DSH_OXLINT_THREADS must be a positive integer, got ${JSON.stringify(raw)}.`)
  }
  if (args.some(arg => arg === '--threads' || arg.startsWith('--threads='))) {
    throw new Error('run-oxlint: use DSH_OXLINT_THREADS instead of passing --threads directly.')
  }
  return {
    args: [...resolvedArgs, `--threads=${raw}`],
    env: { ...env, GOMAXPROCS: raw },
  }
}

/**
 * The strict type-aware override globs, copied from `.oxlintrc.json` `overrides[0].files`.
 *
 * Every file these claim is linted with the full type-aware rule set, so every
 * one of them must also be claimed by a real `tsconfig`. A file no program
 * claims is still linted, but tsgolint resolves its types through
 * `CreateInferredProjectProgram` — an option-less program with no `paths`, no
 * `types`, and no `strict` — so the type-aware half of the gate reports green
 * while checking next to nothing (UM-LINT-B).
 *
 * `scripts/oxlint-contract.spec.ts` pins this list to the configuration file, so
 * widening `overrides[0].files` without widening this constant fails at test
 * time instead of quietly shrinking the fence below.
 */
export const STRICT_OVERRIDE_GLOBS = [
  'packages/*/*/src/**/*.{ts,tsx}',
  'packages/*/*/tests/**/*.{ts,tsx}',
  'apps/*/src/**/*.{ts,tsx}',
  'apps/*/tests/**/*.{ts,tsx}',
  'examples/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx}',
  'website/**/*.{ts,tsx}',
] as const

/**
 * The strict-override files no TypeScript program claims yet — KNOWN-RED.
 *
 * `tsconfig.host.json` includes every package's `tests` tree but then excludes
 * the whole `packages/eval/eval-cli` package, and that package's own
 * `tsconfig.json` includes only its `src`, so neither side owns its tests. The
 * fix is a sibling `tsconfig.tests.json`, which has to be agreed with the eval
 * team first because that package is the perpetually running eval machine — see
 * `wayfinder/data-agent/tickets/phase-upstream-merge/UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md`.
 * Delete this allowlist together with that ticket. A seventh unclaimed
 * strict-override file still fails the fence, which is the regrowth it exists to
 * stop: this list grew silently once already.
 */
export const EVAL_CLI_PENDING_FIX: readonly string[] = [
  'packages/eval/eval-cli/tests/cli-llm-config.spec.ts',
  'packages/eval/eval-cli/tests/compare.spec.ts',
  'packages/eval/eval-cli/tests/harness-responder.spec.ts',
  'packages/eval/eval-cli/tests/main.spec.ts',
  'packages/eval/eval-cli/tests/report.spec.ts',
  'packages/eval/eval-cli/tests/scope-id.spec.ts',
]

/**
 * How one glob of program-less files was adjudicated (UM-LINT-B buckets ii, iii).
 *
 * `glob` is prose for a human reader. `sample` is the machine-checked half: one
 * real path from the reproduced unmatched list, asserted by
 * `scripts/oxlint-contract.spec.ts` to fall outside {@link STRICT_OVERRIDE_GLOBS}.
 * That assertion is what keeps the disposition honest — these files are not
 * under-checked relative to intent, because the strict rules never claimed them.
 * A refactor that moves one of them under a strict override glob fails the spec
 * and forces the disposition to be decided again.
 */
export interface UnmatchedDisposition {
  /** Repository-relative glob covering the adjudicated files. */
  readonly glob: string
  /** `waive` — deliberately outside the tsconfig graph. `keep` — support tooling that stays default-linted. */
  readonly disposition: 'waive' | 'keep'
  /** How many files the glob covered in the reproduced unmatched list. */
  readonly count: number
  /** One real path from that list, checked against the strict override globs. */
  readonly sample: string
  /** Why the files stay out of a TypeScript program. */
  readonly rationale: string
}

/**
 * Every program-less file that is NOT in the strict type-aware override, and why
 * it stays that way. Reproduced 2026-09-14 on `2886e5b8e5`: 55 unmatched files
 * total — 34 waived, 15 kept default-only, plus the 6 in
 * {@link EVAL_CLI_PENDING_FIX}, which are the only ones the override claims.
 *
 * `waive` means the file is intentionally outside the repository tsconfig graph:
 * a prototype, a research one-off, a benchmark, a throwaway probe. Adding a
 * tsconfig would open a "prototypes are compiled" precedent for no bug-finding
 * return. `keep` means support or build tooling that is deliberately left on the
 * default rules only; `.d.mts` and `.cjs` files there are outside the override's
 * TypeScript extensions regardless. Neither bucket is a FIX: the leak surface is
 * the default rule set with the correctness category already `off`.
 */
export const UNMATCHED_DISPOSITIONS: readonly UnmatchedDisposition[] = [
  {
    glob: 'packages/eval/eval-cli/{bin,dev}/**',
    disposition: 'waive',
    count: 3,
    sample: 'packages/eval/eval-cli/bin/compare.ts',
    rationale: 'Throwaway dev and triage probe harnesses. A tsconfig here would couple the eval machine build to throwaway probes.',
  },
  {
    glob: 'packages/eval/retrieval-experiment/scripts/**',
    disposition: 'waive',
    count: 9,
    sample: 'packages/eval/retrieval-experiment/scripts/run-baseline.ts',
    rationale: 'Retrieval research one-offs (baseline, gradient, A/B, label enrichment). Experiment scaffolds, deliberately out of the graph.',
  },
  {
    glob: 'packages/query/query-maxcompute/dev/**',
    disposition: 'waive',
    count: 3,
    sample: 'packages/query/query-maxcompute/dev/fake-credentials.ts',
    rationale: 'Dev-only fake credentials and scenarios plus one .d.mts argument declaration; none of it ships.',
  },
  {
    glob: 'packages/query/query-tool/dev/**',
    disposition: 'waive',
    count: 1,
    sample: 'packages/query/query-tool/dev/query-tool-smoke.ts',
    rationale: 'Hand-run smoke script.',
  },
  {
    glob: 'packages/util/deque/benchmarks/**',
    disposition: 'waive',
    count: 1,
    sample: 'packages/util/deque/benchmarks/drain.ts',
    rationale: 'Benchmark harness; benchmarks are intentionally out of the graph.',
  },
  {
    glob: 'prototypes/d2c-retrieve-baseline/**',
    disposition: 'waive',
    count: 2,
    sample: 'prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts',
    rationale: 'Throwaway retrieval-baseline probes under the top-level prototypes tree.',
  },
  {
    glob: 'wayfinder/data-agent/prototypes/**',
    disposition: 'waive',
    count: 12,
    sample: 'wayfinder/data-agent/prototypes/p-da4-scope-routing/src/index.ts',
    rationale: 'Scope-routing, phase-gate, and keychain prototypes. Tracker scaffolds that were never meant to compile.',
  },
  {
    glob: 'wayfinder/data-agent/research/**',
    disposition: 'waive',
    count: 3,
    sample: 'wayfinder/data-agent/research/exp1-phase1/run-judge-calibration.ts',
    rationale: 'Judge-calibration and prompt-variant experiment scripts.',
  },
  {
    glob: 'apps/desktop/**/*.d.mts',
    disposition: 'keep',
    count: 7,
    sample: 'apps/desktop/scripts/desktop-build-paths.d.mts',
    rationale: 'Desktop build, release, and signing declarations. Pulling build-config declarations into a strict program buys no real bugs.',
  },
  {
    glob: 'snapshots/**',
    disposition: 'keep',
    count: 5,
    sample: 'snapshots/acp/acp.snapshot.ts',
    rationale: 'Serialized snapshot and snapshot-support sources under the top-level snapshots tree, not authored product code.',
  },
  {
    glob: 'vitest.shared.ts',
    disposition: 'keep',
    count: 1,
    sample: 'vitest.shared.ts',
    rationale: 'Repository-root shared Vitest harness; a top-level file that no program glob reaches.',
  },
  {
    glob: 'scripts/coverage-uncovered-locations.cjs',
    disposition: 'keep',
    count: 1,
    sample: 'scripts/coverage-uncovered-locations.cjs',
    rationale: 'Coverage tooling. CommonJS, so outside the override TypeScript extensions even though it sits under scripts.',
  },
  {
    glob: 'eval-results/p11d-calibration/**',
    disposition: 'keep',
    count: 1,
    sample: 'eval-results/p11d-calibration/analyze.ts',
    rationale: 'Calibration analysis script beside its results; support tooling rather than product source.',
  },
]

/** Placeholders that survive regex escaping while a glob is tokenized. */
const DESCENDANTS_TOKEN = '\u0000'
const SEGMENT_TOKEN = '\u0001'
const EXTENSION_TOKEN = '\u0002'

/**
 * Compile one {@link STRICT_OVERRIDE_GLOBS} entry into an anchored RegExp.
 *
 * Oxlint resolves override globs against the configuration file's own directory,
 * verified by probe: a file under `packages/eval/retrieval-experiment/scripts`
 * does NOT pick up the `scripts` override, while the same file under the
 * repository's own `scripts` does. Anchoring both ends reproduces that. Only a
 * single `*`, a descendant wildcard, and the `{ts,tsx}` list occur across the
 * seven globs, so this stays a few lines rather than a dependency — neither
 * `minimatch` nor `picomatch` is directly resolvable in this pnpm-strict
 * workspace. Anything richer throws instead of silently under-matching.
 * @param glob - one strict type-aware override glob.
 * @returns a RegExp over repository-relative POSIX paths.
 */
function strictOverrideGlobToRegex(glob: string): RegExp {
  const tokenized = glob
    .replaceAll('{ts,tsx}', EXTENSION_TOKEN)
    .replaceAll('**/', DESCENDANTS_TOKEN)
    .replaceAll('*', SEGMENT_TOKEN)
  if (/[^A-Za-z0-9._/\-\u0000-\u0002]/.test(tokenized)) {
    throw new Error(
      `run-oxlint: .oxlintrc.json overrides[0].files entry ${JSON.stringify(glob)} uses glob syntax the UM-LINT-B`
      + ' program-coverage fence cannot compile; it understands one path segment, a descendant wildcard, and the'
      + ' {ts,tsx} extension list. Add minimatch as a direct devDependency and move this matcher onto it.',
    )
  }
  const pattern = tokenized
    .replaceAll('.', '\\.')
    .replaceAll(DESCENDANTS_TOKEN, '(?:[^/]+/)*')
    .replaceAll(SEGMENT_TOKEN, '[^/]+')
    .replaceAll(EXTENSION_TOKEN, '(?:ts|tsx)')
  return new RegExp(`^${pattern}$`)
}

const STRICT_OVERRIDE_REGEXES = STRICT_OVERRIDE_GLOBS.map(strictOverrideGlobToRegex)

/**
 * Whether the strict type-aware override claims a path.
 * @param path - repository-relative POSIX path.
 * @returns true when at least one {@link STRICT_OVERRIDE_GLOBS} entry matches.
 */
export function matchesStrictOverrideGlob(path: string): boolean {
  return STRICT_OVERRIDE_REGEXES.some(pattern => pattern.test(path))
}

/** The debug line tsgolint prints for a file no TypeScript program claims. */
const UNMATCHED_FILE_LINE = /Unmatched file:\s*(.+)/

/**
 * Fail the run when the strict type-aware override claims a file but no
 * TypeScript program does.
 *
 * Costs one extra `OXC_LOG=debug` pass. Its stderr goes to a temporary file
 * rather than a captured pipe because the debug stream for this repository's
 * ~344 programs runs to a couple of megabytes. The pass's own exit status is
 * irrelevant: program assignment happens before any rule runs, so the log is
 * worth parsing either way.
 * @param invocation - the arguments and environment the lint pass just used.
 */
function assertNoStrictOverrideUnmatched(invocation: OxlintInvocation): void {
  const directory = mkdtempSync(join(tmpdir(), 'oxlint-program-coverage-'))
  try {
    const logPath = join(directory, 'debug.log')
    const logFd = openSync(logPath, 'w')
    try {
      const result = spawnSync(process.execPath, [oxlintCli, ...invocation.args], {
        env: { ...invocation.env, OXC_LOG: 'debug' },
        stdio: ['ignore', 'ignore', logFd],
      })
      if (result.error !== undefined) throw result.error
    } finally {
      closeSync(logFd)
    }
    const unmatched: string[] = []
    for (const line of readFileSync(logPath, 'utf8').split('\n')) {
      const captured = UNMATCHED_FILE_LINE.exec(line)?.[1]
      if (captured === undefined) continue
      unmatched.push(relative(repositoryRoot, captured.trim()).replaceAll('\\', '/'))
    }
    const violations = unmatched.filter(path =>
      !EVAL_CLI_PENDING_FIX.includes(path) && matchesStrictOverrideGlob(path))
    if (violations.length === 0) return
    process.stderr.write(
      `run-oxlint: ${violations.length} file(s) match .oxlintrc.json overrides[0].files, so the full type-aware rule`
      + ' set ran over them, but no TypeScript program claims them — tsgolint resolved their types through an'
      + ' option-less inferred program, so the type-aware half of this gate reported green without checking them:\n'
      + violations.map(path => `  ${path}\n`).join('')
      + '  Give each one a real tsconfig owner; see'
      + ' wayfinder/data-agent/tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md.\n',
    )
    process.exitCode = 1
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function completeFrom(result: { readonly signal: NodeJS.Signals | null; readonly status: number | null }): void {
  if (result.signal !== null) {
    process.kill(process.pid, result.signal)
    return
  }
  process.exitCode = result.status ?? 1
}

function main(): void {
  const invocation = resolveOxlintInvocation(process.argv.slice(2), process.env)
  if (!isFixInvocation(invocation.args)) {
    const result = spawnSync(process.execPath, [oxlintCli, ...invocation.args], {
      env: invocation.env,
      stdio: 'inherit',
    })
    if (result.error !== undefined) throw result.error
    completeFrom(result)
    // A green lint is precisely when a silently under-checked file hides, so the
    // fence runs there and may still turn the run red. CI only: the extra debug
    // pass roughly doubles the wall clock, and a local run's fast feedback is
    // worth more than a fence CI re-checks minutes later.
    if (invocation.env.CI === 'true' && result.signal === null && result.status === 0) {
      assertNoStrictOverrideUnmatched(invocation)
    }
    return
  }

  const first = spawnSync(process.execPath, [oxlintCli, ...invocation.args], {
    encoding: 'utf8',
    env: invocation.env,
    maxBuffer: MAX_CAPTURED_OUTPUT_BYTES,
  })
  if (first.error !== undefined) throw first.error
  if (first.signal !== null) {
    completeFrom(first)
    return
  }
  if (first.status === 0) {
    process.stdout.write(first.stdout)
    process.stderr.write(first.stderr)
    process.exitCode = 0
    return
  }

  // Overlapping JS-plugin fixes can expose one more fixable diagnostic after the first pass.
  const second = spawnSync(process.execPath, [oxlintCli, ...invocation.args], {
    env: invocation.env,
    stdio: 'inherit',
  })
  if (second.error !== undefined) throw second.error
  completeFrom(second)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)) main()
