/**
 * Verify scripts/generator-inputs.manifest.json: every non-spec gen-*.ts file
 * is registered, every registered script name exists in package.json (or is
 * null for the two typert generators not wired as scripts), and every listed
 * output artifact exists on disk. The manifest is the registry that makes
 * "input changed but not regenerated" detectable; this spec pins its shape.
 *
 * Manifest-reading pattern follows scripts/verify-doc-budgets.ts:
 *   const root = resolve(import.meta.dirname, '..')
 *   JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<...>
 *
 * Test structure follows scripts/gen-tsconfig-paths.spec.ts.
 */
import { existsSync, globSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = resolve(root, 'scripts/generator-inputs.manifest.json')

interface GeneratorEntry {
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly script: string | null
  readonly parameterizedScanRoot: boolean
  readonly writesI18nTriple: boolean
  readonly notes: string
}

type Manifest = Readonly<Record<string, GeneratorEntry>>

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest

const generatorFiles: readonly string[] = globSync('scripts/gen-*.ts', { cwd: root })
  .map(path => basename(path))
  .filter(name => !name.endsWith('.spec.ts'))
  .sort()

const generatorNames: readonly string[] = generatorFiles.map(file => file.replace(/\.ts$/, ''))

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
const packageScripts: ReadonlySet<string> = new Set(Object.keys(packageJson.scripts ?? {}))

describe('generator-inputs.manifest.json', () => {
  it('registers every non-spec gen-*.ts file (no extras, no missing)', () => {
    const registered = Object.keys(manifest).sort()
    expect(registered).toEqual([...generatorNames].sort())
  })

  it('every registered script name is a real package.json script (or null)', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      if (entry.script === null) continue
      expect(
        packageScripts.has(entry.script),
        `${name}: script "${entry.script}" is not in package.json scripts`,
      ).toBe(true)
    }
  })

  it('every listed output artifact exists on disk (literal or glob-matched)', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      for (const output of entry.outputs) {
        if (/^<.*>$/.test(output)) continue
        if (output.includes('*')) {
          const matches = globSync(output, { cwd: root })
          expect(
            matches.length > 0,
            `${name}: output glob "${output}" matched nothing`,
          ).toBe(true)
        } else {
          expect(
            existsSync(resolve(root, output)),
            `${name}: output "${output}" does not exist`,
          ).toBe(true)
        }
      }
    }
  })

  it('the two typert generators (not in package.json) have script: null', () => {
    expect(manifest['gen-evidence-query-typert']?.script).toBeNull()
    expect(manifest['gen-schema-gateway-typert']?.script).toBeNull()
  })

  it('gen-cordis-api (shim) has empty inputs/outputs (delegates to gen-cordis-catalog)', () => {
    const shim = manifest['gen-cordis-api']
    expect(shim).toBeDefined()
    expect(shim?.inputs.length ?? 1).toBe(0)
    expect(shim?.outputs.length ?? 1).toBe(0)
  })
})
