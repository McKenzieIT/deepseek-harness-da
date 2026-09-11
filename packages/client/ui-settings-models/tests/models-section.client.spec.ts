import { describe, expect, it } from 'vitest'
import { ModelsSection } from '../src/client/ModelsSection.tsx'

// Relocated from tests/invariant.client.spec.ts (deleted with the empty invariant
// companion in UM-INVARIANT-COMPANION-CLEANUP). This test covers the client
// component ModelsSection, not the companion, so it survives the retirement.
describe('ModelsSection', () => {
  it('renders null until the shell injects the section dependencies', () => {
    expect(ModelsSection({})).toBeNull()
  })
})
