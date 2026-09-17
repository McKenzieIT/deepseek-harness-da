#!/usr/bin/env node
/** MCP proxy that injects repeatable query failures before delegating to the real sidecar. */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const mode = process.env.G25A_FAULT_MODE ?? 'none'
if (!['none', 'transient_then_ok', 'always_fail'].includes(mode)) {
  process.stderr.write(`[g25a-fault-sidecar] invalid G25A_FAULT_MODE ${JSON.stringify(mode)}\n`)
  process.exit(2)
}
const parsedFailFirst = Number(process.env.G25A_FAIL_FIRST_N ?? '1')
if (!Number.isSafeInteger(parsedFailFirst) || parsedFailFirst < 0) {
  process.stderr.write('[g25a-fault-sidecar] G25A_FAIL_FIRST_N must be a non-negative integer\n')
  process.exit(2)
}
const delegatePath = process.env.G25A_DELEGATE_SIDECAR
  ?? resolve(import.meta.dirname, '../../../../../packages/query/query-maxcompute/dev/maxc-sidecar.mjs')
const delegate = spawn(process.execPath, [delegatePath, ...process.argv.slice(2)], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})
let executeCount = 0
let inputEnded = false
let terminating = false

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function injectedFailure(message) {
  const sql = message.params?.arguments?.sql ?? ''
  const outcome = {
    state: 'failed',
    error: 'G25a injected transport failure',
    failureKind: 'transport',
    sql,
  }
  send({
    jsonrpc: '2.0',
    id: message.id,
    result: { content: [{ type: 'text', text: JSON.stringify(outcome) }], isError: false },
  })
}

function shouldInject(message) {
  if (message.id === undefined || message.method !== 'tools/call' || message.params?.name !== 'execute') return false
  executeCount += 1
  return mode === 'always_fail' || (mode === 'transient_then_ok' && executeCount <= parsedFailFirst)
}

delegate.stdout.pipe(process.stdout)
delegate.stderr.pipe(process.stderr)
delegate.on('error', (error) => {
  process.stderr.write(`[g25a-fault-sidecar] delegate spawn failed: ${error.message}\n`)
  process.exitCode = 1
})
delegate.on('exit', (code, signal) => {
  if (terminating) process.exit(0)
  if (inputEnded) return
  process.stderr.write(`[g25a-fault-sidecar] delegate exited unexpectedly: code=${String(code)} signal=${String(signal)}\n`)
  process.exit(code ?? 1)
})

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (line.trim() === '') continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      delegate.stdin.write(`${line}\n`)
      continue
    }
    if (shouldInject(message)) injectedFailure(message)
    else delegate.stdin.write(`${line}\n`)
  }
})
process.stdin.on('end', () => {
  inputEnded = true
  delegate.stdin.end()
})
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    inputEnded = true
    terminating = true
    if (!delegate.kill(signal)) process.exit(0)
  })
}
