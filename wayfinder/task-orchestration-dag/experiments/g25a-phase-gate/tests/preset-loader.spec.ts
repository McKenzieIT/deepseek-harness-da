/** Loader smoke for the generated arm presets under Node's tsx/esm hook. */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const SMOKE = resolve(import.meta.dirname, '../fixtures/preset-loader-smoke.mjs')

describe('G25a arm preset loading under tsx/esm', () => {
  it.each(['policy', 'floor'] as const)('mounts the generated %s preset and relative TypeScript row', async (arm) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      '--import',
      'tsx/esm',
      SMOKE,
      arm,
    ], {
      cwd: resolve(import.meta.dirname, '../../../../..'),
      timeout: 30_000,
    })
    expect(stderr).toBe('')
    expect(stdout).toBe('mounted\n')
  })
})
