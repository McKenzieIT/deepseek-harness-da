/** Release dependency isolation for the data Python provider. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  version?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest

const EXPERIMENTAL_RUNTIME = '@deepseek-ai/dsh-experimental-code-runtime-python'
const PROTOCOL_PACKAGE = '@deepseek-ai/dsh-code-runtime-python-protocol'

describe('data Python release dependencies', () => {
  it('uses the released protocol package without an experimental package edge', () => {
    expect(manifest.dependencies?.[PROTOCOL_PACKAGE]).toBe('workspace:^')
    for (const section of [
      manifest.dependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
      manifest.devDependencies,
    ]) {
      expect(section ?? {}).not.toHaveProperty(EXPERIMENTAL_RUNTIME)
    }
  })
})
