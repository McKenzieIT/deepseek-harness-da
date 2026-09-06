import { describe, expect, it } from 'vitest'
import { PLATFORM_MODULES } from '../src/platform.ts'
import { getStaticModules } from '../src/seed.ts'

// CB-4 regression guard. Plugin client bundles (e.g. api-remotes) inline the
// typert-generated /remote contributions, whose wire schemas reference zod.z.
// Rolldown's ESM→CJS interop emits require("zod"), which the browser shell
// must answer from its frozen module table. zod carries runtime identity
// (schema instances, the _zod property), so a single shared instance seeded
// by the shell is correct — not one inlined per bundle. If zod is removed
// from PLATFORM_MODULES or getStaticModules, every plugin bundle's wire
// schemas throw "require("zod") missed the module table" at boot and the
// whole plugin group fails to load (buttons disappear).
describe('CB-4: zod is a shared platform module', () => {
  it('PLATFORM_MODULES includes zod (so the bundler treats zod as external and the shell seeds it)', () => {
    expect(PLATFORM_MODULES).toContain('zod')
  })

  it('getStaticModules seeds zod into the frozen module table', () => {
    expect(getStaticModules()).toHaveProperty('zod')
  })
})
