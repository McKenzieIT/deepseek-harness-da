/** Page-store join: directory × namespaces × credentials, with last-good rows on failure. */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { settingsSchema } from './settings-schema.client.ts'
import { messageOf, ModelsSettingsStore } from '../src/client/store.ts'

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}
function fail<T>(message: string): RemoteResult<T> {
  return { ok: false, error: new RemoteError('gateway/internal', message, {}) as unknown as RemoteFailure }
}

const DIRECTORY = [
  { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
  { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: true },
  { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], active: false },
  { provider: 'ghost', displayName: 'Ghost', settingsNs: '', settingsPath: [], active: true },
]

const NAMESPACES = [
  {
    ns: 'llm-deepseek',
    schema: {},
    value: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://base' },
    base: { baseURL: 'https://base' },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  },
  {
    ns: 'llm-pi-ai',
    schema: {},
    value: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } },
    user: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  },
]

function api(overrides: {
  providers?: () => Promise<RemoteResult<typeof DIRECTORY>>
  describeSettings?: () => Promise<RemoteResult<{ writable: boolean; hasDocument: boolean; namespaces: typeof NAMESPACES }>>
  describeCredentials?: (refs: string[]) => Promise<RemoteResult<Record<string, unknown>>>
} = {}) {
  const seenRefs: string[][] = []
  // The D1 fold joins the configurable-provider directory with the live
  // registry: `listConfigurableProviders` carries the directory rows and
  // `listProviders` carries the active set, so the bench stubs both halves.
  const activeProviders = DIRECTORY.filter(entry => entry.active).map(entry => ({ id: entry.provider }))
  const face = {
    llm: {
      listConfigurableProviders: overrides.providers ?? (() => Promise.resolve(ok(DIRECTORY))),
      listProviders: () => Promise.resolve(ok(activeProviders)),
      models: () => Promise.resolve(ok({ groups: [], failures: [] })),
    },
    settings: {
      describe: overrides.describeSettings ?? (() => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: NAMESPACES }))),
      update: () => Promise.resolve(fail('unused')),
      replace: () => Promise.resolve(fail('unused')),
    },
    credentials: {
      describe: (refs: string[]) => {
        seenRefs.push(refs)
        return (overrides.describeCredentials ?? (refs => Promise.resolve(ok(
          Object.fromEntries(refs.map(ref => [ref, { configured: ref === 'OPENAI_API_KEY', writable: true }])),
        ))))(refs)
      },
      set: () => Promise.resolve(ok({})),
      unset: () => Promise.resolve(ok({})),
    },
  }
  const wire = face as never
  const ctx = { remote: wire } as unknown as Context
  return { ctx, mirror: new SettingsDescribeMirror(ctx), seenRefs }
}

describe('ModelsSettingsStore', () => {
  it('joins rows with configured, removable, and credential state', async () => {
    const { ctx, mirror, seenRefs } = api()
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.writable).toBe(true)
    expect(state.credentialError).toBeNull()
    expect(seenRefs).toEqual([['DEEPSEEK_API_KEY', 'OPENAI_API_KEY']])
    const byProvider = new Map(state.rows.map(row => [row.entry.provider, row]))
    expect(byProvider.get('deepseek-official')).toMatchObject({
      configured: true,
      removable: false,
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      credential: { configured: false, writable: true },
    })
    expect(byProvider.get('openai')).toMatchObject({
      configured: true,
      removable: true,
      apiKeyEnv: 'OPENAI_API_KEY',
      credential: { configured: true },
    })
    expect(byProvider.get('anthropic')).toMatchObject({ configured: false, removable: false })
    expect(byProvider.get('anthropic')?.apiKeyEnv).toBeUndefined()
    expect(byProvider.get('ghost')).toMatchObject({ configured: false, removable: false })
    expect(state.namespaces.get('llm-pi-ai')?.ns).toBe('llm-pi-ai')
  })

  it('degrades the credential badge, not the page, when the credential domain fails', async () => {
    const { ctx, mirror } = api({ describeCredentials: () => Promise.resolve(fail('no provider')) })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.credentialError).toBe('no provider')
    expect(state.rows.every(row => row.credential === undefined)).toBe(true)
  })

  it('settles a credential transport rejection without leaving the store loading', async () => {
    const { ctx, mirror } = api({
      describeCredentials: () => Promise.reject(new Error('credential transport down')),
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      credentialError: 'credential transport down',
    })
  })

  it('stringifies a non-Error credential transport rejection', async () => {
    const { ctx, mirror } = api({
      describeCredentials: async () => { throw 'credential transport refusal' },
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.store.getSnapshot().credentialError).toBe('credential transport refusal')
  })

  it('surfaces a directory failure and keeps the last good rows', async () => {
    const { ctx, mirror } = api()
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot().rows).toHaveLength(4)
    const broken = api({ providers: () => Promise.resolve(fail('directory down')) })
    const failing = new ModelsSettingsStore(broken.ctx, settingsSchema, broken.mirror)
    await failing.load()
    expect(failing.store.getSnapshot()).toMatchObject({ status: 'error', error: 'directory down' })
    // The first store's snapshot is untouched by the second's failure.
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('lets the newest load win over a stale slow response', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    let call = 0
    const { ctx, mirror } = api({
      providers: async () => {
        call += 1
        if (call === 1) {
          await gate
          return fail('stale slow failure')
        }
        return ok(DIRECTORY)
      },
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    const first = store.load()
    const second = store.load()
    release?.()
    await Promise.all([first, second])
    expect(store.store.getSnapshot().status).toBe('ready')
  })
})

describe('edge joins', () => {
  it('treats a non-object profile as having no credential reference', async () => {
    const { ctx, mirror } = api({
      describeSettings: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [{
          ns: 'llm-pi-ai',
          schema: {},
          value: { providers: { weird: 'oops' } },
          applies: 'live' as const,
          secrets: [],
          revision: 0,
        }] as never,
      })),
      providers: () => Promise.resolve(ok([
        { provider: 'weird', displayName: 'weird', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'weird'], active: false },
      ] as never)),
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    const state = store.store.getSnapshot()
    expect(state.rows[0]).toMatchObject({ configured: true, removable: false })
    expect(state.rows[0]?.apiKeyEnv).toBeUndefined()
  })

  it('skips the credential describe entirely when no row names a reference', async () => {
    const { ctx, mirror, seenRefs } = api({
      describeSettings: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [
          { ns: 'llm-pi-ai', schema: {}, value: { providers: {} }, applies: 'live' as const, secrets: [], revision: 0 },
        ] as never,
      })),
      providers: () => Promise.resolve(ok([
        {
          provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'anthropic'], active: false,
        },
      ] as never)),
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    expect(seenRefs).toEqual([])
    expect(store.store.getSnapshot().status).toBe('ready')
  })

  it('surfaces a settings describe failure', async () => {
    const { ctx, mirror } = api({ describeSettings: () => Promise.resolve(fail('settings down')) })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'settings down' })
  })

  it('reports a terminally unavailable settings mirror precisely', async () => {
    const { ctx } = api()
    const store = new ModelsSettingsStore(
      ctx,
      settingsSchema,
      new SettingsDescribeMirror(ctx, 'memory'),
    )
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'settings are unavailable in this browser',
    })
  })

  it('reuses a held settings view after its refresh fails', async () => {
    let settingsCall = 0
    const { ctx, mirror } = api({
      describeSettings: () => {
        settingsCall += 1
        return Promise.resolve(settingsCall === 1
          ? ok({ writable: true, hasDocument: false, namespaces: NAMESPACES })
          : fail('settings refresh down'))
      },
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    await mirror.load()
    expect(mirror.getSnapshot().error).toBe('settings refresh down')
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: null })
    expect(store.store.getSnapshot().rows).toHaveLength(4)
  })

  it('stringifies a non-Error load failure', async () => {
    // The wire can surface non-Error throwables; the store must stringify them.
    const { ctx, mirror } = api({ providers: async () => { throw 'plain refusal' } })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'plain refusal' })
  })

  it('drops a stale successful response after a newer load finished', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    let call = 0
    const { ctx, mirror } = api({
      providers: async () => {
        call += 1
        if (call === 1) {
          await gate
          return ok([] as never)
        }
        return ok(DIRECTORY)
      },
    })
    const store = new ModelsSettingsStore(ctx, settingsSchema, mirror)
    const first = store.load()
    const second = store.load()
    await second
    release?.()
    await first
    // The stale empty directory never overwrote the newer join.
    expect(store.store.getSnapshot().rows).toHaveLength(4)
  })
})

describe('messageOf', () => {
  it('reads an Error message, and stringifies anything else a rejection may carry', () => {
    // The wire layer rejects with an Error, but a host or a runtime can reject
    // with any value, and the page still has to render something.
    expect(messageOf(new Error('connection lost'))).toBe('connection lost')
    expect(messageOf('the host refused')).toBe('the host refused')
    expect(messageOf(undefined)).toBe('undefined')
  })
})
