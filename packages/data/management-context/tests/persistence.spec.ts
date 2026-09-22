/** Required management bindings remain readable through the shipping JSONL backend. */
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { DataScopeId } from '../src/types.ts'
import { dataScopeProjectionDefinition } from '../src/projection.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('reads a required binding after closing and reopening the JSONL backend', async () => {
  const root = await mkdtemp(join(tmpdir(), 'management-binding-'))
  roots.push(root)
  const writer = new Context()
  contexts.push(writer)
  await writer.plugin(SessionStore)
  await writer.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  const session = writer.sessions.create(SessionId('bound'), { meta: { cwd: root } })
  const event = session.append('data-scope/bound', {
    workspaceId: WorkspaceId('workspace-a'), dataScopeId: DataScopeId('scope-a'),
  })
  const handle = await writer.sessionPersistence.create(session.header)
  await handle.append([event])
  await handle.close()
  await writer.fiber.dispose()

  const reader = new Context()
  contexts.push(reader)
  await reader.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  const reopened = await reader.sessionPersistence.open(session.id, 'read')
  try {
    const { events } = await reopened.read()
    expect(events).toEqual([event])
    expect(events[0]).not.toHaveProperty('ignorable')
    expect(events.reduce(dataScopeProjectionDefinition.apply, null)).toEqual({ dataScopeId: 'scope-a' })
  } finally {
    await reopened.close()
  }
})
