import { describe, expect, it } from 'vitest'
import { ModelsSection, type ModelsSectionProps } from '../src/client/ModelsSection.tsx'

// Relocated from tests/invariant.client.spec.ts (deleted with the empty invariant
// companion in UM-INVARIANT-COMPANION-CLEANUP). This test covers the client
// component ModelsSection, not the companion, so it survives the retirement.
// The props are cast through `unknown` because ModelsSectionProps requires a
// `renderSlot` (the shell supplies it at injection time); the null-guard below
// returns before renderSlot is ever read, so an absent renderSlot is safe here.
describe('ModelsSection', () => {
  it('renders null until the shell injects the section dependencies', () => {
    expect(ModelsSection({} as unknown as ModelsSectionProps)).toBeNull()
  })
})
