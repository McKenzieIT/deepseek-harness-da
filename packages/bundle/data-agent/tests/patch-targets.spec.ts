/**
 * Every row the data-agent patch addresses must exist in the composition it
 * patches. `boot()` reports a patch that matches no row through `warn` and
 * keeps going, so a renamed entry id in a layer below would silently leave the
 * row this bundle means to disable or reconfigure mounted as-is.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { loadOverlayPatches, renderConfigDump } from '@deepseek-ai/dsh-app-boot'

const NAME = 'dsh-data-agent-patch-test'
const bundles = fileURLToPath(new URL('../..', import.meta.url))

const tempRoots: string[] = []
afterAll(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** The empty profile root every base-backed profile starts from. */
function emptyProfileRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-data-agent-patch-'))
  tempRoots.push(dir)
  const root = join(dir, 'cordis.yml')
  writeFileSync(root, '[]\n')
  return root
}

function layer(bundle: string): { label: string; patches: ReturnType<typeof loadOverlayPatches> } {
  return { label: bundle, patches: loadOverlayPatches(NAME, join(bundles, bundle, 'cordis.patch.yml')) }
}

describe('data-agent patch targets', () => {
  it('addresses only rows the web composition mounts', () => {
    const skipped: string[] = []

    renderConfigDump(NAME, emptyProfileRoot(), [layer('base'), layer('web-app'), layer('data-agent')], (line) => {
      skipped.push(line)
    })

    expect(skipped).toEqual([])
  })

  it('leaves only the web-only preset row unmatched on the headless composition', () => {
    const skipped: string[] = []

    renderConfigDump(NAME, emptyProfileRoot(), [layer('base'), layer('headless'), layer('data-agent')], (line) => {
      skipped.push(line)
    })

    // The web-app bundle mounts `agent-presets`; the headless surface does not,
    // so this bundle's preset-default override has no row to patch there.
    expect(skipped).toEqual([`${NAME}: [data-agent] patch: entry "agent-presets" not found`])
  })

  it('reports a target no layer below mounts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-data-agent-patch-'))
    tempRoots.push(dir)
    const renamed = join(dir, 'renamed.patch.yml')
    writeFileSync(renamed, '- id: ptc-runtime-under-its-old-name\n  disabled: true\n')
    const skipped: string[] = []

    renderConfigDump(NAME, emptyProfileRoot(), [
      layer('base'),
      layer('headless'),
      { label: 'renamed.patch.yml', patches: loadOverlayPatches(NAME, renamed) },
    ], (line) => {
      skipped.push(line)
    })

    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toContain('ptc-runtime-under-its-old-name')
  })
})
