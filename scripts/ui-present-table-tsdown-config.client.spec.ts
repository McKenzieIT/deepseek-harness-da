import { describe, expect, it } from 'vitest'
import config from '../packages/client/ui-present-table/tsdown.config.ts'

describe('ui-present-table tsdown config', () => {
  it('disables Rolldown code splitting for the browser module-table artifact', () => {
    const configs = config({ env: { DSH_BUILD_FACE: 'client' } })
    const client = configs.find(candidate => candidate.name === '@deepseek-ai/dsh-client-ui-present-table/client')

    expect(client).toBeDefined()
    expect(client?.outputOptions).toMatchObject({ codeSplitting: false })
  })
})
