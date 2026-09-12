import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectGateCoverageViolations } from './verify-gate-coverage.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function scaffold(
  root: string,
  options: {
    scripts: Record<string, string>
    enrolled: readonly string[]
    exemptions: readonly { script: string; reason: string; coveredBy: string }[]
  },
): void {
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: options.scripts }))
  const runGatesLines = options.enrolled
    .map(name => `    pnpmScript('gate-${name}', '${name}', { label: '${name}' }),`)
    .join('\n')
  writeFileSync(
    join(root, 'scripts/run-gates.ts'),
    `function gates(): Gate[] {\n  return [\n${runGatesLines}\n  ]\n}`,
  )
  writeFileSync(
    join(root, 'scripts/gate-coverage.manifest.json'),
    JSON.stringify({ exemptions: options.exemptions }),
  )
}

describe('gate coverage meta-gate', () => {
  it('passes when every verify-*/gen-* script is enrolled or exempted', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-clean-'))
    roots.push(root)
    scaffold(root, {
      scripts: {
        'verify-enrolled': 'tsx enrolled.ts',
        'verify-exempted': 'tsx exempted.ts',
        'gen-exempted': 'tsx gen-exempted.ts',
        build: 'build',
      },
      enrolled: ['verify-enrolled', 'build'],
      exemptions: [
        { script: 'verify-exempted', reason: 'enrolled elsewhere', coveredBy: 'other gate' },
        { script: 'gen-exempted', reason: 'generator', coveredBy: 'verify-enrolled gate' },
      ],
    })

    expect(collectGateCoverageViolations(root)).toEqual([])
  })

  it('fails on a script neither enrolled nor exempted (blind spot)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-blind-'))
    roots.push(root)
    scaffold(root, {
      scripts: {
        'verify-enrolled': 'tsx enrolled.ts',
        'verify-blind': 'tsx blind.ts',
      },
      enrolled: ['verify-enrolled'],
      exemptions: [],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0] ?? '').toContain('verify-blind')
    expect(failures[0] ?? '').toContain('not enrolled')
  })

  it('fails on a manifest exemption for a deleted script (stale exemption)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-stale-del-'))
    roots.push(root)
    scaffold(root, {
      scripts: { 'verify-present': 'tsx present.ts' },
      enrolled: ['verify-present'],
      exemptions: [{ script: 'verify-deleted', reason: 'gone', coveredBy: 'none' }],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0] ?? '').toContain('verify-deleted')
    expect(failures[0] ?? '').toContain('no longer a verify-*/gen-* script')
  })

  it('fails on a manifest exemption for a now-enrolled script (stale exemption)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-stale-enr-'))
    roots.push(root)
    scaffold(root, {
      scripts: { 'verify-now-enrolled': 'tsx now.ts' },
      enrolled: ['verify-now-enrolled'],
      exemptions: [{ script: 'verify-now-enrolled', reason: 'was blind', coveredBy: 'none' }],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0] ?? '').toContain('verify-now-enrolled')
    expect(failures[0] ?? '').toContain('now enrolled')
  })
})
