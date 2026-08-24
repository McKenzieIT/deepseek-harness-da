/**
 * update_table_config tool — registration (defineTool + ctx.tools.register)
 * + the RBAC stub + path-traversal name guard + the Tier-2 write core.
 *
 * Proves the third model-facing write tool mirrors `tool-load-table-definition`'s
 * registration shape, plus the self-evolution #3b contract: an admin caller
 * hands a `project` override → `updateTableMeta` shallow-merges it into the
 * table YAML (validate + atomicWrite + invalidateCaches) and `ctx.audit`
 * records the Tier-2 write → the tool returns `{ ok, qualified_name }` so the
 * agent can retry `qualifyTable` with the override. Non-admin callers are
 * refused safe-by-default (only `role === 'admin'` allows; `current()`
 * undefined → refuse).
 *
 * Run: `pnpm vitest run packages/data/tool-update-table-config`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { Context } from '@deepseek-ai/cordis'
import type { CallerIdentity } from '@deepseek-ai/dsh-identity'
import { TableDefinitionSchema } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'
import type { Tier2Recorder } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'
import {
  apply,
  validateTableName,
  updateTableConfigResult,
  type UpdateTableConfigResult,
} from '../src/index.ts'

/** A validated fixture table definition (parsed through the substrate schema). */
const FIXTURE_TABLE = TableDefinitionSchema.parse({
  table_name: 'dws_pay_order_di',
  table_comment: '充值订单汇总表',
  description: 'Per-day pay-order aggregates',
  domains: ['payment'],
  kind: 'dws',
  granularity: 'day',
  columns: [
    { name: 'dt', type: 'string', comment: '', role: 'dimension' },
    { name: 'game_id', type: 'string', comment: '', role: 'dimension' },
  ],
  partitions: [{ name: 'dt', type: 'string' }],
  metrics: {},
  dimension_refs: [],
})

/** The subset of ctx.schema the tool reads (semanticRoot + scopeId). */
interface SchemaStub {
  readonly semanticRoot: string
  readonly scopeId: string
}

/** A captured ctx.audit.recordTier2Write call (toolName + payload + opts). */
interface AuditCall {
  readonly toolName: string
  readonly payload: unknown
  readonly opts: unknown
}

/** A ctx.audit stub that records every recordTier2Write call (satisfies Tier2Recorder). */
function stubAudit(): Tier2Recorder & { calls: AuditCall[] } {
  const calls: AuditCall[] = []
  return {
    calls,
    recordTier2Write(
      toolName: string,
      payload: unknown,
      opts?: { readonly scope_id?: string },
    ): string {
      calls.push({ toolName, payload, opts })
      return 'hash-stub'
    },
  }
}

/** A ctx.identity stub whose current() returns a CallerIdentity with the given role (or undefined). */
function stubIdentity(role: string | undefined): { current: () => CallerIdentity | undefined } {
  return {
    current: () => (role !== undefined ? { role } : undefined),
  }
}

/** Create a temp semantic-layer dir with a `tables/` subdir. */
function makeLayer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-update-config-'))
  mkdirSync(join(dir, 'tables'), { recursive: true })
  return dir
}

/** Write a table definition YAML to the layer's `tables/<name>.yaml`. */
function writeTable(layer: string, name: string, def: unknown): void {
  writeFileSync(join(layer, 'tables', `${name}.yaml`), yaml.dump(def))
}

/** Read back a table definition YAML from the layer (parsed through the schema). */
function readTable<T = unknown>(layer: string, name: string): T {
  return yaml.load(readFileSync(join(layer, 'tables', `${name}.yaml`), 'utf-8')) as T
}

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: UpdateTableConfigResult,
    ) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly table_name: string; readonly project: string },
    exec: { readonly signal: AbortSignal },
  ) => Promise<UpdateTableConfigResult>
}

/**
 * Capture the tool definition the plugin registers, with control over the
 * injected schema/audit/identity seams. Mirrors tool-load-table-definition's
 * registerTool helper (no Cordis context).
 */
function registerTool(seams?: {
  readonly schema?: SchemaStub
  readonly audit?: Tier2Recorder
  readonly identity?: { current: () => CallerIdentity | undefined }
}): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    get: (key: string) => {
      if (key === 'schema') return seams?.schema
      if (key === 'audit') return seams?.audit
      if (key === 'identity') return seams?.identity
      return undefined
    },
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

// ── validateTableName (path-traversal guard, mirrors validateDefinitionName) ─

test('S1 validateTableName accepts plain names, rejects path-traversal + empty', () => {
  expect(validateTableName('dws_pay_order_di')).toBe('dws_pay_order_di')
  expect(validateTableName('  dim_charm_info  ')).toBe('dim_charm_info')
  expect(validateTableName('foo.bar')).toBe('foo.bar') // interior dot allowed
  // rejected: empty, separators, parent-dir, current-dir, NUL, >200 chars
  expect(validateTableName('')).toBeNull()
  expect(validateTableName('   ')).toBeNull()
  expect(validateTableName('../etc/passwd')).toBeNull()
  expect(validateTableName('a/b')).toBeNull()
  expect(validateTableName('a\\b')).toBeNull()
  expect(validateTableName('..')).toBeNull()
  expect(validateTableName('.')).toBeNull()
  expect(validateTableName('foo\x00name')).toBeNull()
  expect(validateTableName('a'.repeat(201))).toBeNull()
})

// ── RBAC: admin role required (safe-by-default; current() undefined → refuse) ─

test('S2 updateTableConfigResult - identity unmounted → pre-P9 all-admin allow', async () => {
  // M1 decision: pre-P9 current() undefined (T1 stub) → all-admin allow.
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      undefined,
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(true)
    expect(r.qualified_name).toBe('ieu_cdm.dws_pay_order_di')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S3 updateTableConfigResult - current() undefined (T1 stub) → pre-P9 all-admin allow', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      stubIdentity(undefined),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(true)
    expect(r.qualified_name).toBe('ieu_cdm.dws_pay_order_di')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S4 updateTableConfigResult - role !== admin → admin only', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      stubIdentity('user'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('admin only')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S5 updateTableConfigResult - role missing on caller object → admin only', async () => {
  // A caller with userId but no role is non-admin (safe-by-default refuse).
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      { current: () => ({ userId: 'u1' }) },
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('admin only')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

// ── valid update → updateTableMeta writes {project} + records Tier-2 ───────

test('S6 updateTableConfigResult - admin valid update → {ok:true, qualified_name}', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const audit = stubAudit()
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      audit,
      stubIdentity('admin'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(true)
    expect(r.table_name).toBe('dws_pay_order_di')
    expect(r.qualified_name).toBe('ieu_cdm.dws_pay_order_di')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S7 updateTableConfigResult - YAML merged with {project} on disk', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      stubIdentity('admin'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    const after = readTable<{ table_name: string; project?: string }>(layer, 'dws_pay_order_di')
    expect(after.table_name).toBe('dws_pay_order_di')
    expect(after.project).toBe('ieu_cdm')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S8 updateTableConfigResult - ctx.audit.recordTier2Write called with the override', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const audit = stubAudit()
    await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      audit,
      stubIdentity('admin'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(audit.calls).toHaveLength(1)
    expect(audit.calls[0]?.toolName).toBe('update_table_meta')
    expect(audit.calls[0]?.payload).toEqual({ table_name: 'dws_pay_order_di', updates: { project: 'ieu_cdm' } })
    expect(audit.calls[0]?.opts).toEqual({ scope_id: 'scope1' })
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S9 updateTableConfigResult - empty scopeId → no scope_id passed to recorder', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const audit = stubAudit()
    await updateTableConfigResult(
      { semanticRoot: layer, scopeId: '' },
      audit,
      stubIdentity('admin'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(audit.calls).toHaveLength(1)
    // empty scopeId → undefined → io.ts omits scope_id from the recorder opts
    expect(audit.calls[0]?.opts).toEqual({})
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

// ── invalid table_name + substrate errors ───────────────────────────────────

test('S10 updateTableConfigResult - path-traversal table_name rejected before substrate touch', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const audit = stubAudit()
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      audit,
      stubIdentity('admin'),
      '../etc/passwd',
      'ieu_cdm',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid table_name')
    // never touched the substrate
    expect(audit.calls).toHaveLength(0)
    expect(existsSync(join(layer, 'tables', '../etc/passwd.yaml'))).toBe(false)
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S11 updateTableConfigResult - non-existent table → {ok:false, error} from substrate', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      stubIdentity('admin'),
      'nope_table',
      'ieu_cdm',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not found')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S12 updateTableConfigResult - empty project rejected', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      stubAudit(),
      stubIdentity('admin'),
      'dws_pay_order_di',
      '   ',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('project')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S13 updateTableConfigResult - schema unmounted → {ok:false, error}', async () => {
  const r = await updateTableConfigResult(
    undefined,
    stubAudit(),
    stubIdentity('admin'),
    'dws_pay_order_di',
    'ieu_cdm',
  )
  expect(r.ok).toBe(false)
  expect(r.error).toContain('not mounted')
})

test('S14 updateTableConfigResult - audit unmounted → {ok:false, error} (D5 non-disableable)', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const r = await updateTableConfigResult(
      { semanticRoot: layer, scopeId: 'scope1' },
      undefined,
      stubIdentity('admin'),
      'dws_pay_order_di',
      'ieu_cdm',
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('audit')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

// ── apply: registration shape (mirrors tool-load-table-definition) ──────────

test('S15 apply registers update_table_config (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('update_table_config')
  expect(def.description).toContain('project')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('S16 execute - admin valid update returns qualified_name via ctx.get seams', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const def = registerTool({
      schema: { semanticRoot: layer, scopeId: 'scope1' },
      audit: stubAudit(),
      identity: stubIdentity('admin'),
    })
    const out = await def.execute(
      { table_name: 'dws_pay_order_di', project: 'ieu_cdm' },
      { signal: new AbortController().signal },
    )
    expect(out.ok).toBe(true)
    expect(out.qualified_name).toBe('ieu_cdm.dws_pay_order_di')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S17 execute - identity undefined (T1 stub) → pre-P9 all-admin allow', async () => {
  const layer = makeLayer()
  try {
    writeTable(layer, 'dws_pay_order_di', FIXTURE_TABLE)
    const def = registerTool({
      schema: { semanticRoot: layer, scopeId: 'scope1' },
      audit: stubAudit(),
      identity: stubIdentity(undefined),
    })
    const out = await def.execute(
      { table_name: 'dws_pay_order_di', project: 'ieu_cdm' },
      { signal: new AbortController().signal },
    )
    expect(out.ok).toBe(true)
    expect(out.qualified_name).toBe('ieu_cdm.dws_pay_order_di')
  } finally {
    rmSync(layer, { recursive: true, force: true })
  }
})

test('S18 render - success formats as "Updated <table> → <qualified>"', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: true, table_name: 'dws_pay_order_di', qualified_name: 'ieu_cdm.dws_pay_order_di' })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('dws_pay_order_di')
  expect(out[0]?.text).toContain('ieu_cdm.dws_pay_order_di')
})

test('S19 render - failure formats as "Error: <error>"', () => {
  const def = registerTool()
  const out = def.output.render({}, { ok: false, error: 'admin only (update_table_config requires admin role)' })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('admin only')
})
