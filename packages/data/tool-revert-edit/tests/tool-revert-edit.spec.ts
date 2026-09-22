/**
 * `revert_edit` tool contract suite: the registered tool definition is driven
 * through `apply` (no Cordis container) against the REAL audit snapshot store
 * (`:memory:` SQLite) and the REAL semantic-layer write substrate rooted at a
 * throwaway temp directory. `validateAssetName` and `formatRevertEdit` are
 * module-private, so they are driven through the only doors the package opens:
 * `execute(args)` for validation and `output.render(args, value)` for
 * formatting — the assertions pin the exact strings those functions produce,
 * never a rule re-implemented in the test.
 *
 * The `snapshot store integration` / `revert round-trip (unit)` blocks below
 * exercise the audit substrate (`data/audit`'s record/get/list) that the revert
 * path stands on; they are kept as real behavior checks of that seam.
 *
 * Run: `pnpm vitest run packages/data/tool-revert-edit`
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { openAuditDatabase, SQLiteAuditStore } from '../../audit/src/store.ts'
import { apply } from '../src/index.ts'

// ── Dispose to quiescence ───────────────────────────────────────────────────

/**
 * Every acquired handle registers its release the instant it is acquired, so a
 * failing assertion mid-test still frees the SQLite handle / temp tree. Drained
 * LIFO; one failing disposer never strands the others.
 */
const disposers: Array<() => void> = []
afterEach(() => {
  let failure: unknown
  for (const dispose of disposers.splice(0).reverse()) {
    try {
      dispose()
    } catch (error) {
      failure ??= error
    }
  }
  if (failure !== undefined) throw failure
})

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * The audit double the tool sees as `ctx.audit`: a REAL `SQLiteAuditStore` over
 * an in-memory database (so `recordSnapshot`/`getSnapshot`/`listSnapshots` are
 * the shipping implementation) plus a spy for the Tier-2 write recorder.
 * `close()` is idempotent: the explicit `audit.close()` calls in the substrate
 * tests below stay valid alongside the afterEach release.
 */
function createMockAudit() {
  const db = openAuditDatabase(':memory:')
  const store = new SQLiteAuditStore(db)
  let closed = false
  const audit = {
    store,
    recordTier2Write: vi.fn(),
    close() {
      if (closed) return
      closed = true
      db.close()
    },
  }
  disposers.push(() => { audit.close() })
  return audit
}

/** A throwaway semantic-layer root; removed in afterEach even on failure. */
function createSemanticRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'revert-edit-'))
  disposers.push(() => { rmSync(root, { recursive: true, force: true }) })
  return root
}

/** The `ctx.schema` surface `execute` touches: two loaders + the write root. */
interface SchemaStub {
  semanticRoot: string
  loadTableDefinition: (name: string) => Record<string, unknown> | null
  loadEventDefinition: (name: string) => Record<string, unknown> | null
}

/** A `SemanticLayerService`-shaped double whose loaders default to "absent". */
function createMockSchema(semanticRoot: string, overrides: Partial<SchemaStub> = {}): SchemaStub {
  return {
    semanticRoot,
    loadTableDefinition: () => null,
    loadEventDefinition: () => null,
    ...overrides,
  }
}

/** The model-facing value shape `revert_edit` returns (both modes). */
interface RevertValue {
  readonly reverted?: boolean
  readonly asset_name?: string
  readonly kind?: string
  readonly from_version?: number
  readonly to_version?: number
  readonly message?: string
  readonly versions?: ReadonlyArray<{ version: number; kind: string; created_at: string; log_id: string | null }>
}

/** The subset of the registered tool definition this suite exercises. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (args: unknown, value: unknown) => readonly { readonly type: string; readonly text: string }[]
    readonly presentationMeta?: (args: unknown, value: unknown) => unknown
  }
  readonly execute: (args: Record<string, unknown>, exec: { readonly signal: AbortSignal }) => Promise<RevertValue>
  readonly presentCall: (args: unknown) => unknown
  readonly presentResult: (
    args: unknown,
    result: { content: never[]; isError: boolean; meta?: unknown },
  ) => unknown
}

/**
 * Capture the definition `apply` registers — no real Cordis container. Services
 * omitted from `services` stay absent on the context, which models "that
 * service is not mounted" (the tool declares `inject`, so production always has
 * them; the omission pins what happens when it does not).
 */
function registerTool(services: { schema?: unknown; audit?: unknown } = {}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: { register: (d: ToolDef) => { def = d } },
    ...services,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) throw new Error('apply did not register a tool')
  return def
}

/** A completed `ToolResult` for the presenters (content is never read). */
function toolResult(result: { isError?: boolean; meta?: unknown }): { content: never[]; isError: boolean; meta?: unknown } {
  return { content: [], isError: result.isError ?? false, ...('meta' in result ? { meta: result.meta } : {}) }
}

/** A live `AbortSignal`, and its already-aborted twin. */
function liveExec() {
  return { signal: new AbortController().signal }
}

/**
 * `SQLiteAuditStore.recordSnapshot` types `kind` as `'table' | 'event'`, but
 * the `definition_snapshot.kind` column is free-form `TEXT`: a concept snapshot
 * (and any future kind) is representable on disk, which is exactly what the
 * tool's kind dispatch has to cope with.
 */
function recordSnapshotOfKind(store: SQLiteAuditStore, asset: string, kind: string, content: string): number {
  return (store.recordSnapshot as unknown as (a: string, k: string, c: string) => number)(asset, kind, content)
}

const TABLE_SNAPSHOT_YAML = 'table_name: dws_pay\ndescription: original\n'
const EVENT_SNAPSHOT_YAML = 'name: user_login\ndescription: original login event\n'
const CONCEPT_SNAPSHOT_YAML = 'name: churn\ndefinition: 用户流失\n'

describe('tool-revert-edit', () => {
  describe('snapshot store integration', () => {
    it('records and retrieves a snapshot for revert', () => {
      const audit = createMockAudit()
      const v1 = audit.store.recordSnapshot('dws_pay', 'table', 'table_name: dws_pay\ndescription: original\n')
      expect(v1).toBe(1)

      audit.store.recordSnapshot('dws_pay', 'table', 'table_name: dws_pay\ndescription: edited\n')

      const snap = audit.store.getSnapshot('dws_pay', 1)
      expect(snap).not.toBeNull()
      expect(snap!.content).toContain('description: original')
      expect(snap!.kind).toBe('table')

      audit.close()
    })

    it('returns null for non-existent version', () => {
      const audit = createMockAudit()
      expect(audit.store.getSnapshot('no_such_asset', 1)).toBeNull()
      audit.store.recordSnapshot('dws_pay', 'table', 'content')
      expect(audit.store.getSnapshot('dws_pay', 5)).toBeNull()
      audit.close()
    })

    it('lists snapshots newest-first', () => {
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', 'v1')
      audit.store.recordSnapshot('dws_pay', 'table', 'v2')
      audit.store.recordSnapshot('dws_pay', 'table', 'v3')
      const list = audit.store.listSnapshots('dws_pay')
      expect(list).toHaveLength(3)
      expect(list[0]!.version).toBe(3)
      expect(list[2]!.version).toBe(1)
      audit.close()
    })
  })

  describe('apply', () => {
    it('registers the revert_edit tool with its presenters and output projection', () => {
      const def = registerTool()
      expect(def.name).toBe('revert_edit')
      expect(def.description).toContain('Roll back a data asset definition (table or event) to a prior snapshot.')
      expect(def.output.schema).toBeDefined()
      expect(typeof def.output.render).toBe('function')
      expect(typeof def.output.presentationMeta).toBe('function')
      expect(typeof def.execute).toBe('function')
      expect(typeof def.presentCall).toBe('function')
      expect(typeof def.presentResult).toBe('function')
    })
  })

  describe('execute: asset-name validation', () => {
    it('rejects an empty asset name and reports to_version 0 when none was given', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: '' }, liveExec())
      expect(result).toEqual({
        reverted: false,
        asset_name: '',
        kind: 'unknown',
        to_version: 0,
        message: 'invalid asset name: ""',
      })
    })

    it('rejects a whitespace-only asset name and echoes the requested to_version', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: '   ', to_version: 7 }, liveExec())
      expect(result).toEqual({
        reverted: false,
        asset_name: '   ',
        kind: 'unknown',
        to_version: 7,
        message: 'invalid asset name: "   "',
      })
    })

    it('rejects a forward-slash path in the asset name', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: 'foo/bar', to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe('invalid asset name: "foo/bar"')
    })

    it('rejects a backslash path in the asset name', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: 'foo\\bar', to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe('invalid asset name: "foo\\\\bar"')
    })

    it('rejects a NUL byte in the asset name', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: 'evt\u0000name', to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe('invalid asset name: "evt\\u0000name"')
    })

    it('rejects a parent-directory segment in the asset name', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: '..', to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe('invalid asset name: ".."')
    })

    it('rejects a lone dot as the asset name', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: '.', to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe('invalid asset name: "."')
    })

    it('rejects an asset name longer than 200 characters', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const tooLong = 'a'.repeat(201)
      const result = await def.execute({ asset_name: tooLong, to_version: 1 }, liveExec())
      expect(result.reverted).toBe(false)
      expect(result.message).toBe(`invalid asset name: "${tooLong}"`)
    })

    it('accepts an asset name of exactly 200 characters', async () => {
      const audit = createMockAudit()
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const atLimit = 'a'.repeat(200)
      const result = await def.execute({ asset_name: atLimit, list_versions: true }, liveExec())
      expect(result).toEqual({ asset_name: atLimit, versions: [] })
    })

    it('trims the asset name before using it as the snapshot key', async () => {
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const result = await def.execute({ asset_name: '  dws_pay  ', list_versions: true }, liveExec())
      expect(result.asset_name).toBe('dws_pay')
      expect(result.versions).toHaveLength(1)
    })
  })

  describe('execute: control flow before the write', () => {
    it('rejects an aborted call before touching the audit store', async () => {
      const audit = createMockAudit()
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const controller = new AbortController()
      controller.abort()
      await expect(def.execute({ asset_name: 'dws_pay', to_version: 1 }, { signal: controller.signal }))
        .rejects.toThrow(/^revert_edit aborted$/)
      expect(audit.store.listSnapshots('dws_pay')).toEqual([])
    })

    it('lists the asset snapshot versions newest-first in list mode', async () => {
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', 'v1 content')
      audit.store.recordSnapshot('dws_pay', 'table', 'v2 content')
      audit.store.recordSnapshot('dws_pay', 'table', 'v3 content')
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const result = await def.execute({ asset_name: 'dws_pay', list_versions: true }, liveExec())
      expect(Object.keys(result)).toEqual(['asset_name', 'versions'])
      expect(result.asset_name).toBe('dws_pay')
      expect(result.versions!.map(v => v.version)).toEqual([3, 2, 1])
      expect(result.versions!.map(v => v.kind)).toEqual(['table', 'table', 'table'])
      expect(result.versions![0]!.log_id).toBeNull()
    })

    it('demands to_version when neither a version nor list mode was requested', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit: createMockAudit() })
      const result = await def.execute({ asset_name: 'dws_pay' }, liveExec())
      expect(result).toEqual({
        reverted: false,
        asset_name: 'dws_pay',
        kind: 'unknown',
        to_version: 0,
        message: 'to_version is required (or set list_versions=true to see available versions)',
      })
    })

    it('reports a missing snapshot for the requested version', async () => {
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const result = await def.execute({ asset_name: 'dws_pay', to_version: 4 }, liveExec())
      expect(result).toEqual({
        reverted: false,
        asset_name: 'dws_pay',
        kind: 'unknown',
        to_version: 4,
        message: 'no snapshot found for "dws_pay" at version 4',
      })
    })

    it('refuses to revert a snapshot whose kind is neither table, event nor concept', async () => {
      const audit = createMockAudit()
      recordSnapshotOfKind(audit.store, 'dws_pay__revenue', 'metric', 'name: dws_pay__revenue\n')
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()), audit })
      const result = await def.execute({ asset_name: 'dws_pay__revenue', to_version: 1 }, liveExec())
      expect(result).toEqual({
        reverted: false,
        asset_name: 'dws_pay__revenue',
        kind: 'metric',
        to_version: 1,
        message: 'cannot revert asset of kind "metric" (only table/event/concept are supported)',
      })
    })

    it('fails loud when the audit service is not mounted', async () => {
      const def = registerTool({ schema: createMockSchema(createSemanticRoot()) })
      await expect(def.execute({ asset_name: 'dws_pay', list_versions: true }, liveExec()))
        .rejects.toThrow(/^Cannot read properties of undefined \(reading 'store'\)$/)
    })
  })

  describe('execute: table revert', () => {
    it('writes the snapshot back, pre-snapshots the current definition and records the Tier-2 write', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      const schema = createMockSchema(root, {
        loadTableDefinition: () => ({ table_name: 'dws_pay', description: 'edited' }),
      })
      const def = registerTool({ schema, audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result).toEqual({
        reverted: true,
        asset_name: 'dws_pay',
        kind: 'table',
        from_version: 2,
        to_version: 1,
      })
      // The snapshot content — not the current definition — landed on disk.
      expect(readFileSync(join(root, 'tables', 'dws_pay.yaml'), 'utf8')).toBe(TABLE_SNAPSHOT_YAML)
      // The pre-revert snapshot holds the YAML dump of the CURRENT definition,
      // so the revert itself can be undone by reverting to v2.
      expect(audit.store.getSnapshot('dws_pay', 2)).toMatchObject({
        content: 'table_name: dws_pay\ndescription: edited\n',
        kind: 'table',
      })
      expect(audit.recordTier2Write.mock.calls).toEqual([
        ['revert_edit', { asset_name: 'dws_pay', to_version: 1 }],
      ])
    })

    it('omits from_version when the table has no current definition to pre-snapshot', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      const def = registerTool({ schema: createMockSchema(root), audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result).toEqual({ reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 1 })
      expect('from_version' in result).toBe(false)
      // No second snapshot was recorded: v1 is still the only version.
      expect(audit.store.listSnapshots('dws_pay').map(v => v.version)).toEqual([1])
      expect(readFileSync(join(root, 'tables', 'dws_pay.yaml'), 'utf8')).toBe(TABLE_SNAPSHOT_YAML)
    })

    it('still reverts when the pre-revert snapshot step throws (fail-silent)', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      const schema = createMockSchema(root, {
        loadTableDefinition: () => { throw new Error('loader exploded') },
      })
      const def = registerTool({ schema, audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result).toEqual({ reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 1 })
      expect(readFileSync(join(root, 'tables', 'dws_pay.yaml'), 'utf8')).toBe(TABLE_SNAPSHOT_YAML)
    })

    it('still reverts when the Tier-2 audit write throws (fail-silent)', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      audit.recordTier2Write.mockImplementation(() => { throw new Error('audit log is full') })
      const def = registerTool({ schema: createMockSchema(root), audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result).toEqual({ reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 1 })
      expect(audit.recordTier2Write).toHaveBeenCalledTimes(1)
    })

    it('reports the underlying message verbatim when the write throws', async () => {
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', TABLE_SNAPSHOT_YAML)
      // The write root is unreachable: reading it faults the whole write step.
      const schema = {
        get semanticRoot(): string { throw new Error('semantic layer unavailable') },
        loadTableDefinition: () => null,
        loadEventDefinition: () => null,
      }
      const def = registerTool({ schema, audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result).toEqual({
        reverted: false,
        asset_name: 'dws_pay',
        kind: 'table',
        to_version: 1,
        message: 'write error: semantic layer unavailable',
      })
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })

    it('reports a table-schema validation failure as a write error', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      audit.store.recordSnapshot('dws_pay', 'table', '- not\n- a\n- table\n')
      const def = registerTool({ schema: createMockSchema(root), audit })

      const result = await def.execute({ asset_name: 'dws_pay', to_version: 1 }, liveExec())

      expect(result.reverted).toBe(false)
      expect(result.kind).toBe('table')
      expect(result.message).toMatch(/^write error: Table validation failed: /)
      expect(result.message).toContain('Invalid input: expected object, received array')
      expect(existsSync(join(root, 'tables', 'dws_pay.yaml'))).toBe(false)
    })
  })

  describe('execute: event revert', () => {
    it('writes the event snapshot verbatim and pre-snapshots the current event', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      recordSnapshotOfKind(audit.store, 'user_login', 'event', EVENT_SNAPSHOT_YAML)
      const schema = createMockSchema(root, {
        loadEventDefinition: () => ({ name: 'user_login', description: 'edited login event' }),
      })
      const def = registerTool({ schema, audit })

      const result = await def.execute({ asset_name: 'user_login', to_version: 1 }, liveExec())

      expect(result).toEqual({
        reverted: true,
        asset_name: 'user_login',
        kind: 'event',
        from_version: 2,
        to_version: 1,
      })
      expect(readFileSync(join(root, 'events', '_suggested', 'user_login.yaml'), 'utf8')).toBe(EVENT_SNAPSHOT_YAML)
      expect(audit.store.getSnapshot('user_login', 2)).toMatchObject({
        content: 'name: user_login\ndescription: edited login event\n',
        kind: 'event',
      })
    })

    it('reports the substrate error when the event write is refused', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      // A snapshot whose YAML `name` disagrees with the asset it is filed under.
      recordSnapshotOfKind(audit.store, 'user_login', 'event', 'name: other_event\ndescription: mismatched\n')
      const def = registerTool({ schema: createMockSchema(root), audit })

      const result = await def.execute({ asset_name: 'user_login', to_version: 1 }, liveExec())

      expect(result).toEqual({
        reverted: false,
        asset_name: 'user_login',
        kind: 'event',
        to_version: 1,
        message: 'write failed: name mismatch: YAML name=other_event vs event_name=user_login',
      })
      expect(existsSync(join(root, 'events'))).toBe(false)
      expect(audit.recordTier2Write).not.toHaveBeenCalled()
    })
  })

  describe('execute: concept revert', () => {
    it('writes the concept snapshot to concepts/<name>.yaml without a pre-snapshot', async () => {
      const root = createSemanticRoot()
      const audit = createMockAudit()
      recordSnapshotOfKind(audit.store, 'churn', 'concept', CONCEPT_SNAPSHOT_YAML)
      const def = registerTool({ schema: createMockSchema(root), audit })

      const result = await def.execute({ asset_name: 'churn', to_version: 1 }, liveExec())

      expect(result).toEqual({ reverted: true, asset_name: 'churn', kind: 'concept', to_version: 1 })
      expect(readFileSync(join(root, 'concepts', 'churn.yaml'), 'utf8')).toBe(CONCEPT_SNAPSHOT_YAML)
      // Concepts have no loader on this seam, so nothing is pre-snapshotted.
      expect(audit.store.listSnapshots('churn').map(v => v.version)).toEqual([1])
      expect(audit.recordTier2Write.mock.calls).toEqual([
        ['revert_edit', { asset_name: 'churn', to_version: 1 }],
      ])
    })
  })

  describe('output.render', () => {
    it('renders a successful revert as a kind-tagged version line', () => {
      const def = registerTool()
      const out = def.output.render({}, { reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 3 })
      expect(out).toEqual([{ type: 'text', text: '[table] dws_pay: reverted to snapshot v3' }])
    })

    it('renders a failed revert as its message', () => {
      const def = registerTool()
      const out = def.output.render({}, {
        reverted: false,
        asset_name: 'dws_pay',
        kind: 'unknown',
        to_version: 4,
        message: 'no snapshot found for "dws_pay" at version 4',
      })
      expect(out).toEqual([{ type: 'text', text: 'no snapshot found for "dws_pay" at version 4' }])
    })

    it('renders a failed revert with no message as a generic failure', () => {
      const def = registerTool()
      const out = def.output.render({}, { reverted: false, asset_name: 'dws_pay', kind: 'table', to_version: 1 })
      expect(out).toEqual([{ type: 'text', text: 'revert failed' }])
    })

    it('renders list mode as pretty-printed version metadata', () => {
      const def = registerTool()
      const out = def.output.render({}, {
        asset_name: 'dws_pay',
        versions: [{ version: 1, kind: 'table' }],
      })
      expect(out).toEqual([{
        type: 'text',
        text: 'Available versions: [\n  {\n    "version": 1,\n    "kind": "table"\n  }\n]',
      }])
    })
  })

  describe('output.presentationMeta', () => {
    it('projects the result value through verbatim for both modes', () => {
      const def = registerTool()
      const reverted = { reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 3 }
      expect(def.output.presentationMeta!({}, reverted)).toBe(reverted)
      const listed = { asset_name: 'dws_pay', versions: [] }
      expect(def.output.presentationMeta!({}, listed)).toBe(listed)
    })
  })

  describe('presentCall', () => {
    it('titles a revert call with the asset and the target version', () => {
      const def = registerTool()
      expect(def.presentCall({ asset_name: 'dws_pay', to_version: 2 })).toEqual({
        card: 'generic',
        title: 'Revert: dws_pay → v2',
        kind: 'edit',
      })
    })

    it('titles a list-mode call as a snapshot listing', () => {
      const def = registerTool()
      expect(def.presentCall({ asset_name: 'dws_pay', list_versions: true })).toEqual({
        card: 'generic',
        title: 'Snapshots: dws_pay',
        kind: 'edit',
      })
    })
  })

  describe('presentResult', () => {
    it('presents nothing for an errored call', () => {
      const def = registerTool()
      expect(def.presentResult({ asset_name: 'dws_pay' }, toolResult({ isError: true }))).toBeUndefined()
    })

    it('presents list mode as a snapshot history card', () => {
      const def = registerTool()
      expect(def.presentResult(
        { asset_name: 'dws_pay' },
        toolResult({ meta: { asset_name: 'dws_pay', versions: [] } }),
      )).toEqual({ card: 'generic', title: 'Snapshot history: dws_pay' })
    })

    it('degrades to a failure card when the result carries no meta', () => {
      const def = registerTool()
      expect(def.presentResult({ asset_name: 'dws_pay' }, toolResult({})))
        .toEqual({ card: 'generic', title: 'Revert failed: dws_pay' })
    })

    it('presents a failure card when meta reports the revert did not happen', () => {
      const def = registerTool()
      expect(def.presentResult(
        { asset_name: 'dws_pay' },
        toolResult({ meta: { reverted: false, asset_name: 'dws_pay', kind: 'unknown', to_version: 4 } }),
      )).toEqual({ card: 'generic', title: 'Revert failed: dws_pay' })
    })

    it('presents the reverted kind, asset and version on success', () => {
      const def = registerTool()
      expect(def.presentResult(
        { asset_name: 'dws_pay' },
        toolResult({ meta: { reverted: true, asset_name: 'dws_pay', kind: 'table', to_version: 3 } }),
      )).toEqual({ card: 'generic', title: 'Reverted table: dws_pay → v3' })
    })
  })

  describe('revert round-trip (unit)', () => {
    it('snapshot content round-trips through record + get', () => {
      const audit = createMockAudit()
      const originalYaml = `table_name: dws_pay_order
description: Payment order fact table
domains:
  - payment
columns:
  - name: order_id
    type: STRING
    description: Order identifier
`
      const v = audit.store.recordSnapshot('dws_pay_order', 'table', originalYaml)
      expect(v).toBe(1)

      const retrieved = audit.store.getSnapshot('dws_pay_order', 1)
      expect(retrieved!.content).toBe(originalYaml)
      audit.close()
    })

    it('pre-revert snapshot enables undo-the-undo', () => {
      const audit = createMockAudit()

      // Simulate: original → edit (snapshot v1) → revert (snapshot v2 = current before revert)
      audit.store.recordSnapshot('dws_pay', 'table', 'original state')
      audit.store.recordSnapshot('dws_pay', 'table', 'edited state')

      // v1 = before first edit (original), v2 = before revert (edited)
      const v1 = audit.store.getSnapshot('dws_pay', 1)
      const v2 = audit.store.getSnapshot('dws_pay', 2)
      expect(v1!.content).toBe('original state')
      expect(v2!.content).toBe('edited state')

      // After reverting to v1, if user wants to undo the revert, they revert to v2
      audit.close()
    })
  })
})
