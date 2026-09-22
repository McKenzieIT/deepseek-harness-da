/// <reference types="node" />
/**
 * The pure / argv / filesystem helpers in `src/main.ts` — everything the CLI
 * entry composes except `main()` itself (covered separately in main-entry).
 *
 *  - `findRepoRoot` walks up for a directory holding BOTH `packages` and
 *    `examples`; the found, walked-up, and not-found-fallback outcomes are each
 *    driven from a synthetic checkout under a temp dir, never the real repo, so
 *    the walk is actually exercised rather than answered by the ambient cwd.
 *  - `parseCliArgs` reads `process.argv`; every exit path (`--help`, missing
 *    `--cases`, bad `--responder`, bad/absent `--variant` under harness) and the
 *    full defaults-vs-overrides mapping are pinned. `process.exit` is stubbed to
 *    THROW a sentinel rather than record-and-continue, because a neutered exit
 *    would fall through to `resolve(casesVal)` with `casesVal` undefined and
 *    throw a TypeError of its own — the throw stops execution exactly where the
 *    production `process.exit` would.
 *  - `str` coerces a parseArgs value (`strict:false` can hand a boolean to a
 *    string option); `formatToday` renders the local date as YYYYMMDD under a
 *    pinned clock + TZ; `printUsage` writes the help block; `globCasePaths`
 *    filters/sorts case files and exits when an explicit `--case` matches none.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/main-cli.spec.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  findRepoRoot,
  formatToday,
  globCasePaths,
  parseCliArgs,
  printUsage,
  str,
  type CliArgs,
} from '../src/main.ts'

/** Thrown by the stubbed `process.exit` so a test can name the code and stop where exit would. */
class ExitSignal extends Error {
  constructor(readonly code: number) { super(`process.exit(${code})`) }
}

interface Captured<T> { result: T | undefined; out: string[]; err: string[]; exit: number | null }

/** Run `fn` with console + `process.exit` (throw-on-call) captured, restoring all three after. */
function capture<T>(fn: () => T): Captured<T> {
  const out: string[] = []
  const err: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(' ')) })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { err.push(a.map(String).join(' ')) })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => { throw new ExitSignal(typeof code === 'number' ? code : 0) })
  let result: T | undefined
  let exit: number | null = null
  try {
    result = fn()
  } catch (e) {
    if (e instanceof ExitSignal) exit = e.code
    else throw e
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }
  return { result, out, err, exit }
}

/** Drive `parseCliArgs` with a chosen argv (parseArgs reads `process.argv.slice(2)`). */
function runCli(argv: string[]): Captured<CliArgs> {
  const savedArgv = process.argv
  process.argv = ['node', 'dsh-eval', ...argv]
  try {
    return capture(() => parseCliArgs())
  } finally {
    process.argv = savedArgv
  }
}

/** Run `fn` from a chosen cwd, restoring the original afterward. */
function withCwd<T>(dir: string, fn: () => T): T {
  const previous = process.cwd()
  process.chdir(dir)
  try {
    return fn()
  } finally {
    process.chdir(previous)
  }
}

const tmpDirs: string[] = []
function tmp(prefix: string): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('str', () => {
  it('returns a string value unchanged', () => {
    expect(str('aga', 'fallback')).toBe('aga')
    expect(str('', 'fallback')).toBe('')
  })

  it('falls back for a boolean or undefined value', () => {
    expect(str(true, 'fallback')).toBe('fallback')
    expect(str(false, 'fallback')).toBe('fallback')
    expect(str(undefined, 'fallback')).toBe('fallback')
  })
})

describe('findRepoRoot', () => {
  it('returns the cwd when it holds both packages/ and examples/', () => {
    const root = tmp('mrr-here-')
    mkdirSync(join(root, 'packages'))
    mkdirSync(join(root, 'examples'))
    withCwd(root, () => {
      expect(findRepoRoot()).toBe(process.cwd())
    })
  })

  it('walks up from a nested subdirectory to the marked root', () => {
    const root = tmp('mrr-nested-')
    mkdirSync(join(root, 'packages'))
    mkdirSync(join(root, 'examples'))
    const nested = join(root, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })
    withCwd(nested, () => {
      expect(findRepoRoot()).toBe(root)
    })
  })

  it('falls back to the cwd when no ancestor carries the repo markers', () => {
    const bare = tmp('mrr-bare-')
    withCwd(bare, () => {
      // No packages/ + examples/ anywhere up the temp path, so the walk reaches
      // the filesystem root, breaks, and returns resolve('.') === the cwd.
      expect(findRepoRoot()).toBe(process.cwd())
    })
  })
})

describe('formatToday', () => {
  afterEach(() => { vi.useRealTimers() })

  it('renders the local date as zero-padded YYYYMMDD', () => {
    const savedTz = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-07T12:00:00.000Z'))
    try {
      // Month 03 and day 07 both exercise the padStart.
      expect(formatToday()).toBe('20260307')
    } finally {
      if (savedTz === undefined) delete process.env.TZ
      else process.env.TZ = savedTz
    }
  })

  it('leaves an already-two-digit month and day unpadded', () => {
    const savedTz = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-25T12:00:00.000Z'))
    try {
      expect(formatToday()).toBe('20261225')
    } finally {
      if (savedTz === undefined) delete process.env.TZ
      else process.env.TZ = savedTz
    }
  })
})

describe('printUsage', () => {
  it('prints the dsh-eval usage block to stdout', () => {
    const { out } = capture(() => { printUsage() })
    const text = out.join('\n')
    expect(text).toContain('dsh-eval — standalone eval CLI runner')
    expect(text).toContain('--cases <dir>')
    expect(text).toContain('--variant <A|B|C|D>')
  })
})

describe('parseCliArgs', () => {
  it('parses a minimal invocation with every default', () => {
    const { result, exit } = runCli(['--cases', 'packages/eval/eval/cases/k11-v2'])
    expect(exit).toBeNull()
    const a = result!
    expect(a.cases).toBe(resolve('packages/eval/eval/cases/k11-v2'))
    expect(a.output).toBe(resolve('eval-results/'))
    expect(a.passK).toBe(3)
    expect(a.concurrency).toBe(1)
    expect(a.responder).toBe('engine')
    expect(a.variant).toBeNull()
    expect(a.scopeId).toBe('k11')
    expect(a.provider).toBe('')
    expect(a.model).toBe('')
    expect(a.caseFilter).toBeNull()
    expect(a.runId).toBeNull()
    expect(a.skipHealthGate).toBe(false)
    expect(a.withQuery).toBe(false)
    expect(a.sidecarPath).toBeNull()
    expect(a.noSqlJudge).toBe(false)
    expect(a.queryExpansion).toBe(true)
    expect(a.today).toMatch(/^\d{8}$/)
    expect(a.schema.endsWith(join('examples', 'k11-semantic-layer'))).toBe(true)
  })

  it('maps every override, coercing and resolving as documented', () => {
    const { result, exit } = runCli([
      '--cases', 'c', '--schema', 's', '--output', 'o', '--pass-k', '5',
      '--case', 'k11v2_059', '--skip-health-gate', '--provider', 'aga',
      '--model', 'qwen3.7-max', '--today', '20260101', '--run-id', 'run-x',
      '--concurrency', '4', '--column-semantics', 'positional', '--max-stored-rows', '17',
      '--with-query', '--sidecar', '/tmp/side.mjs', '--no-sql-judge',
      '--no-query-expansion', '--scope-id', 'k99',
    ])
    expect(exit).toBeNull()
    const a = result!
    expect(a).toEqual({
      cases: resolve('c'),
      schema: resolve('s'),
      output: resolve('o'),
      passK: 5,
      caseFilter: 'k11v2_059',
      skipHealthGate: true,
      provider: 'aga',
      model: 'qwen3.7-max',
      today: '20260101',
      runId: 'run-x',
      concurrency: 4,
      columnSemantics: 'positional',
      maxStoredRows: 17,
      withQuery: true,
      sidecarPath: '/tmp/side.mjs',
      noSqlJudge: true,
      queryExpansion: false,
      responder: 'engine',
      variant: null,
      scopeId: 'k99',
    })
  })

  it('prints usage and exits 0 on --help', () => {
    const { out, exit } = runCli(['--help'])
    expect(exit).toBe(0)
    expect(out.join('\n')).toContain('dsh-eval — standalone eval CLI runner')
  })

  it('errors and exits 1 when --cases is missing', () => {
    const { err, exit } = runCli([])
    expect(exit).toBe(1)
    expect(err.join('\n')).toContain('Error: --cases <dir> is required')
  })

  it('rejects an unknown --responder', () => {
    const { err, exit } = runCli(['--cases', 'c', '--responder', 'bogus'])
    expect(exit).toBe(1)
    expect(err.join('\n')).toContain("Error: --responder must be 'engine' or 'harness', got 'bogus'")
  })

  it('requires --variant when --responder harness', () => {
    const { err, exit } = runCli(['--cases', 'c', '--responder', 'harness'])
    expect(exit).toBe(1)
    expect(err.join('\n')).toContain('Error: --variant must be one of A, B, C, D when --responder harness')
  })

  it('rejects an invalid --variant under harness', () => {
    const { exit } = runCli(['--cases', 'c', '--responder', 'harness', '--variant', 'Z'])
    expect(exit).toBe(1)
  })

  it('accepts a lowercase --variant under harness and upper-cases it', () => {
    const { result, exit } = runCli(['--cases', 'c', '--responder', 'harness', '--variant', 'b'])
    expect(exit).toBeNull()
    expect(result!.responder).toBe('harness')
    expect(result!.variant).toBe('B')
  })

  it('rejects an unknown --column-semantics policy', () => {
    const { err, exit } = runCli(['--cases', 'c', '--column-semantics', 'unknown'])
    expect(exit).toBe(1)
    expect(err.join('\n')).toContain("Error: --column-semantics must be 'by-name' or 'positional', got 'unknown'")
  })
})

describe('globCasePaths', () => {
  function caseDir(): string {
    const dir = tmp('mgc-')
    for (const name of ['k11_001.yaml', 'k11_002.yaml', 'k11v2_059.json', 'foo_1.yml', 'summary.yaml', 'notacase.txt', 'README.md']) {
      writeFileSync(join(dir, name), 'case_id: x\n')
    }
    return dir
  }

  it('keeps only <name>_<digits> YAML/JSON files, sorted', () => {
    const dir = caseDir()
    expect(globCasePaths(dir, null)).toEqual([
      join(dir, 'foo_1.yml'),
      join(dir, 'k11_001.yaml'),
      join(dir, 'k11_002.yaml'),
      join(dir, 'k11v2_059.json'),
    ])
  })

  it('applies a --case substring filter', () => {
    const dir = caseDir()
    expect(globCasePaths(dir, 'k11_00')).toEqual([
      join(dir, 'k11_001.yaml'),
      join(dir, 'k11_002.yaml'),
    ])
  })

  it('errors and exits 1 when the filter matches nothing', () => {
    const dir = caseDir()
    const { err, exit } = capture(() => globCasePaths(dir, 'nonexistent_case'))
    expect(exit).toBe(1)
    expect(err.join('\n')).toContain(`Error: no case file matching "nonexistent_case" in ${dir}`)
  })
})
