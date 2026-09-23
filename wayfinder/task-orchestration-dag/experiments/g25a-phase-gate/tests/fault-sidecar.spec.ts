/** Stage 0 protocol tests for the controlled query fault proxy. */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SIDECAR = resolve(import.meta.dirname, '../fixtures/fault-sidecar.mjs')
const DELEGATE = resolve(import.meta.dirname, '../fixtures/fake-query-sidecar.mjs')
const children: ChildProcessWithoutNullStreams[] = []

afterEach(async () => {
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await once(child, 'exit')
  }))
})

function start(mode: 'transient_then_ok' | 'always_fail', failFirstN = 1) {
  const child = spawn(process.execPath, [SIDECAR], {
    env: {
      ...process.env,
      G25A_FAULT_MODE: mode,
      G25A_FAIL_FIRST_N: String(failFirstN),
      G25A_DELEGATE_SIDECAR: DELEGATE,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.push(child)
  let buffer = ''
  const pending: ((value: unknown) => void)[] = []
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.trim() !== '') pending.shift()?.(JSON.parse(line))
    }
  })
  const request = (message: unknown): Promise<any> => {
    const response = new Promise(resolveResponse => pending.push(resolveResponse))
    child.stdin.write(`${JSON.stringify(message)}\n`)
    return response
  }
  return { child, request }
}

async function initialize(request: (message: unknown) => Promise<any>): Promise<void> {
  await request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
}

const execute = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'execute', arguments: { scope_id: '10000251', sql: 'SELECT 1' } },
})

function outcome(response: any): any {
  return JSON.parse(response.result.content[0].text)
}

describe('fault-sidecar', () => {
  it('fails exactly the configured transient prefix, then delegates', async () => {
    const { request } = start('transient_then_ok', 1)
    await initialize(request)
    expect(outcome(await request(execute(2)))).toMatchObject({ state: 'failed', failureKind: 'transport' })
    expect(outcome(await request(execute(3)))).toMatchObject({ state: 'completed', rows: [[4563]] })
  })

  it('fails every execute request in persistent mode', async () => {
    const { request } = start('always_fail')
    await initialize(request)
    expect(outcome(await request(execute(2))).state).toBe('failed')
    expect(outcome(await request(execute(3))).state).toBe('failed')
  })
})
