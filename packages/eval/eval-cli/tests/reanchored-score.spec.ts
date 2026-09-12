/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../dev/reanchored-score.mjs', import.meta.url))

describe('reanchored-score', () => {
  it('reads scalar values from persisted execution artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'reanchored-score-'))
    const artifactPath = join(dir, 'run.json')
    const auditPath = join(dir, 'audit.log')
    writeFileSync(artifactPath, JSON.stringify({
      cases: [{
        case_id: 'eval_10000251_125',
        verdict: 'wrong',
        pass_k_results: [{
          generated_sql: 'SELECT 1 FROM ods_10000251_all_view',
          execution_artifact: { rows: [{ coin_change_role_uv: 4327 }] },
        }],
      }],
    }))
    writeFileSync(auditPath, '[125] live=4327 expected=4000 rows=1\n')

    try {
      const stdout = execFileSync(process.execPath, [script, artifactPath, auditPath], { encoding: 'utf8' })
      expect(stdout).toContain('got=[4327]')
      expect(stdout).toContain('re-anchored: 1/1 = 100.0%')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
