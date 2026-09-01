import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const BIN = join(__dirname, '..', 'bin', 'eval.ts')
const ROOT = join(__dirname, '..', '..', '..', '..')

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
    const { status } = run([], { DASHSCOPE_API_KEY: 'fake' })
    expect(status).toBe(1)
  })

  it('missing DASHSCOPE_API_KEY exits 1', () => {
    const { status } = run(['--cases', 'packages/eval/eval/cases/k11-v2/', '--case', 'k11v2_059'], {
      DASHSCOPE_API_KEY: '',
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
