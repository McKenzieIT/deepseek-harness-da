#!/usr/bin/env node
/** Minimal MCP delegate for fault-sidecar Stage 0 tests. */

function send(value) { process.stdout.write(`${JSON.stringify(value)}\n`) }
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (line.trim() === '') continue
    const message = JSON.parse(line)
    if (message.id === undefined) continue
    if (message.method === 'initialize') {
      send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } })
    } else if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'execute', description: 'execute', inputSchema: { type: 'object' } }] } })
    } else if (message.method === 'tools/call' && message.params?.name === 'execute') {
      const outcome = { state: 'completed', columns: ['value'], rows: [[4563]], rowCount: 1, sql: message.params.arguments?.sql ?? '' }
      send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(outcome) }], isError: false } })
    } else {
      send({ jsonrpc: '2.0', id: message.id, result: {} })
    }
  }
})
