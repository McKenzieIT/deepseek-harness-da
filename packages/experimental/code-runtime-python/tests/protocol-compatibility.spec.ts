/** Compatibility exports for consumers of the experimental package root. */

import { describe, expect, it } from 'vitest'
import * as protocol from '@deepseek-ai/dsh-code-runtime-python-protocol'
import {
  checkDoneValue,
  encodeJsonPlain,
  hasNonLosslessNumber,
  hasUnsafeIntegerToken,
  jsonStringBytesUpTo,
  logTruncationMarker,
  validateChildFrame,
} from '../src/index.ts'

const compatibilityExports = {
  checkDoneValue,
  encodeJsonPlain,
  hasNonLosslessNumber,
  hasUnsafeIntegerToken,
  jsonStringBytesUpTo,
  logTruncationMarker,
  validateChildFrame,
}

describe('experimental protocol compatibility exports', () => {
  it('re-exports the released protocol implementations by identity', () => {
    for (const [name, implementation] of Object.entries(compatibilityExports)) {
      expect(implementation, name).toBe(protocol[name as keyof typeof compatibilityExports])
    }
  })
})
