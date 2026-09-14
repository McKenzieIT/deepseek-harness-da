import { describe, expect, it } from 'vitest'
import { hostFrameParseCeiling } from '../src/index.ts'

describe('hostFrameParseCeiling', () => {
  it('caps the parse at the protocol limit on a default heap and lower on a constrained one', () => {
    // The raw-byte frame cap does not protect the host heap: JSON.parse of a
    // wide-object frame materializes several times the raw bytes in property
    // storage, so the effective cap is min(protocol cap, heap-derived
    // ceiling). A default Node heap (~4 GiB) never binds.
    expect(hostFrameParseCeiling(4 * 1024 * 1024 * 1024)).toBe(64 * 1024 * 1024)
    // A constrained host (--max-old-space-size=256 reports a ~304 MiB limit)
    // derives floor((304 - 64) / 16) = 15 MiB: a 50 MiB budget would be
    // rejected at load, where the address-space gate alone would admit it.
    expect(hostFrameParseCeiling(304 * 1024 * 1024)).toBe(15 * 1024 * 1024)
    // A tiny heap leaves almost no parse room — the load gate fails loud.
    expect(hostFrameParseCeiling(128 * 1024 * 1024)).toBe(4 * 1024 * 1024)
  })
})
