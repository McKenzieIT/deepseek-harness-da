/// <reference types="node" />
import { afterEach, describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BIN = join(__dirname, '..', 'src', 'bin.ts')
const ROOT = join(__dirname, '..', '..', '..', '..')
const homes: string[] = []

function dshHome(apiKey?: string): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-eval-cli-'))
  homes.push(home)
  if (apiKey !== undefined) {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, '.credentials.yaml'), `version: 1\nrefs:\n  DASHSCOPE_API_KEY: ${apiKey}\n`, { mode: 0o600 })
  }
  return home
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function run(args: string[], env: Record<string, string> = {}): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', ['--import', 'tsx/esm', BIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
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
    const { status } = run([], { DSH_HOME: dshHome('fake') })
    expect(status).toBe(1)
  })

  it('missing DASHSCOPE_API_KEY exits 1', () => {
    const { status } = run(['--cases', 'packages/eval/eval/cases/k11-v2/', '--case', 'k11v2_059'], {
      DSH_HOME: dshHome(),
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
    ], {
      DSH_HOME: dshHome('fake-for-test'),
      DASHSCOPE_BASE_URL: 'http://127.0.0.1:1',
      EVAL_LLM_PROVIDER: 'aga',
      EVAL_LLM_MODEL: 'qwen3.7-max',
    })
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
    ], { DSH_HOME: dshHome('fake') })
    expect(status).toBe(1)
  })
})
