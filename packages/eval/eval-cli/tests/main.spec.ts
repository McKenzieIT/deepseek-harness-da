/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'

const BIN = join(__dirname, '..', 'src', 'bin.ts')
const ROOT = join(__dirname, '..', '..', '..', '..')

const homes: string[] = []

/**
 * An isolated home directory for the CLI under test. main()'s credential
 * pre-flight reads `<home>/.dsh/.credentials.yaml` and nothing else — never
 * process.env — so an ambient home makes this suite assert whatever the host
 * happens to hold: green on a machine that has run an eval, red on every other.
 * Both `HOME` and `USERPROFILE` are set because os.homedir() reads the former on
 * POSIX and the latter on Windows, and this suite runs on both.
 * @param credentials - credential file contents, or omitted to leave the home bare.
 * @returns the environment overrides that point the CLI at this home.
 */
function isolatedHome(credentials?: string): Record<string, string> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-eval-cli-home-'))
  homes.push(home)
  if (credentials !== undefined) {
    mkdirSync(join(home, '.dsh'), { recursive: true })
    writeFileSync(join(home, '.dsh', '.credentials.yaml'), credentials, { mode: 0o600 })
  }
  return { HOME: home, USERPROFILE: home }
}

// Syntactically present and deliberately invalid: the pre-flight only requires a
// non-empty value, and no assertion here reaches a real DashScope call.
const HOME_WITH_KEY = isolatedHome('DASHSCOPE_API_KEY: "fake-for-test"\n')
const HOME_WITHOUT_KEY = isolatedHome()

afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

function run(args: string[], env: Record<string, string> = {}): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', ['--import', 'tsx/esm', BIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...HOME_WITH_KEY, ...env },
      encoding: 'utf8',
      timeout: 10_000,
    })
    return { stdout, status: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number }
    return { stdout: e.stdout ?? '', status: e.status ?? 1 }
  }
}

describe('CLI arg parsing', () => {
  it('--help exits 0 and prints usage', () => {
    const { stdout, status } = run(['--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('dsh-eval')
    expect(stdout).toContain('--cases')
    expect(stdout).toContain('--concurrency')
  })

  it('missing --cases exits 1', () => {
    const { status } = run([], { DASHSCOPE_API_KEY: 'fake' })
    expect(status).toBe(1)
  })

  it('missing DASHSCOPE_API_KEY exits 1', () => {
    // The bare home is what gives this assertion its meaning: the pre-flight gates
    // on the credential file alone, so an ambient key would let the run proceed and
    // exit 1 further downstream for an unrelated reason.
    const { status } = run(['--cases', 'packages/eval/eval/cases/k11-v2/', '--case', 'k11v2_059'], {
      DASHSCOPE_API_KEY: '',
      ...HOME_WITHOUT_KEY,
    })
    expect(status).toBe(1)
  })
})

describe('CLI case loading', () => {
  it('loads and runs with fake key (dry-run to LLM boundary)', () => {
    const { stdout, status } = run([
      '--cases', 'packages/eval/eval/cases/k11-v2/',
      '--schema', 'examples/k11-semantic-layer/',
      '--pass-k', '1',
      '--case', 'k11v2_059',
      '--skip-health-gate',
    ], { DASHSCOPE_API_KEY: 'fake-for-test', EVAL_LLM_PROVIDER: 'aga', EVAL_LLM_MODEL: 'qwen3.7-max' })
    expect(status).toBe(0)
    expect(stdout).toContain('Loading 1 case(s)')
    expect(stdout).toContain('k11v2_059')
    expect(stdout).toContain('Completed in')
  }, 60_000)

  it('--case filter with no match exits 1', () => {
    const { status } = run([
      '--cases', 'packages/eval/eval/cases/k11-v2/',
      '--case', 'nonexistent_case_xyz',
      '--skip-health-gate',
    ], { DASHSCOPE_API_KEY: 'fake' })
    expect(status).toBe(1)
  })
})
