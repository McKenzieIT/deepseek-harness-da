/** Pure extraction of G25a Attempt evidence from one durable Session log. */

import { lastAssistantStreamChunk, type ContentBlock, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Token buckets reported by all model calls in one Attempt. */
export interface AttemptUsage {
  readonly uncachedInputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly outputTokens: number
  readonly reasoningTokens: number
}

/** One model-requested tool call paired with its durable result when present. */
export interface ObservedToolCall {
  readonly callId: string
  readonly name: string
  readonly argumentsText: string
  readonly arguments: unknown
  readonly callSeq: number
  readonly resultSeq?: number
  readonly isError?: boolean
  readonly resultText?: string
  readonly error?: { readonly name: string; readonly code: string }
}

/** Query state reconstructed from query_data's model-facing result. */
export type ObservedQueryState = 'completed' | 'pending' | 'failed' | 'missing'

/** One query_data invocation and the result evidence exposed to the model. */
export interface ObservedQueryAttempt extends ObservedToolCall {
  readonly sql?: string
  readonly scopeId?: string
  readonly state: ObservedQueryState
  readonly failureKind?: string
  readonly errorText?: string
  readonly columns?: readonly string[]
  readonly rows?: readonly (readonly string[])[]
  readonly rowCount?: number
}

/** Deterministic evidence extracted before any grading decision. */
export interface SessionObservation {
  readonly finalAnswer: string
  readonly firstUserText: string
  readonly toolNames: readonly string[]
  readonly assistantMessages: readonly string[]
  readonly toolCalls: readonly ObservedToolCall[]
  readonly queryAttempts: readonly ObservedQueryAttempt[]
  readonly clarifications: readonly string[]
  readonly modelCalls: number
  readonly successfulQueries: number
  readonly usage: AttemptUsage
  readonly wallClockMs: number
}

const zeroUsage = (): AttemptUsage => ({
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
})

function textFromBlocks(blocks: readonly ContentBlock[]): string {
  return blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
}

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function usageOf(event: SessionEvent): TokenUsage | undefined {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  return lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
}

function addUsage(total: AttemptUsage, sample: TokenUsage): AttemptUsage {
  return {
    uncachedInputTokens: total.uncachedInputTokens + sample.inputTokens,
    cacheReadTokens: total.cacheReadTokens + (sample.cacheReadTokens ?? 0),
    cacheWriteTokens: total.cacheWriteTokens + (sample.cacheWriteTokens ?? 0),
    outputTokens: total.outputTokens + sample.outputTokens,
    reasoningTokens: total.reasoningTokens + (sample.reasoningTokens ?? 0),
  }
}

interface ParsedQueryResult {
  readonly state: ObservedQueryState
  readonly failureKind?: string
  readonly errorText?: string
  readonly columns?: readonly string[]
  readonly rows?: readonly (readonly string[])[]
  readonly rowCount?: number
}

function parseQueryResult(text: string | undefined, isError: boolean | undefined): ParsedQueryResult {
  if (text === undefined) return { state: 'missing' }
  const failure = /^Query failed \(([^)]+)\):\s*([\s\S]*)$/u.exec(text)
  if (failure !== null) {
    return { state: 'failed', failureKind: failure[1], errorText: failure[2] }
  }
  if (isError === true) return { state: 'failed', failureKind: 'tool_error', errorText: text }
  if (text.startsWith('Query still running')) return { state: 'pending' }
  const lines = text.split('\n')
  const countLine = lines.at(-1)
  const count = countLine === undefined ? null : /^\((\d+) rows?\)$/u.exec(countLine)
  if (count === null) return { state: 'missing' }
  const body = lines.slice(0, -1).filter(line => !line.startsWith('result_id: ') && !line.startsWith('(... '))
  if (body.length === 0) return { state: 'completed', rows: [], rowCount: Number(count[1]) }
  const [header, ...rows] = body
  return {
    state: 'completed',
    columns: header.split('\t'),
    rows: rows.map(row => row.split('\t')),
    rowCount: Number(count[1]),
  }
}

function clarificationFrom(call: ObservedToolCall): string | undefined {
  if (call.name !== 'present_clarification' || call.arguments === null || typeof call.arguments !== 'object') return undefined
  const record = call.arguments as Record<string, unknown>
  for (const key of ['question', 'text', 'message']) {
    if (typeof record[key] === 'string' && record[key] !== '') return record[key]
  }
  return undefined
}

/**
 * Extract the immutable observation used by scoring and analysis.
 * @param events - complete Session events for one Attempt.
 * @param wallClockMs - measured elapsed time outside the Session.
 * @returns model, tool, query, answer, and cost evidence.
 */
export function observeSession(events: readonly SessionEvent[], wallClockMs: number): SessionObservation {
  const assistants: string[] = []
  let usage = zeroUsage()
  let modelCalls = 0
  let firstUserText = ''
  let toolNames: string[] = []
  const calls = new Map<string, ObservedToolCall>()
  const order: string[] = []

  for (const event of events) {
    if (event.type === 'request/header' && toolNames.length === 0) {
      toolNames = (event.data.header.tools ?? []).map(tool => tool.name).sort()
      continue
    }
    if (event.type === 'user/message' && firstUserText === '') {
      firstUserText = textFromBlocks(event.data.content)
      continue
    }
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      modelCalls += 1
      const sample = usageOf(event)
      if (sample !== undefined) usage = addUsage(usage, sample)
      if (event.type === 'assistant/message') {
        const text = textFromBlocks(event.data.message.content)
        if (text !== '') assistants.push(text)
      }
      continue
    }
    if (event.type === 'tool/call') {
      const callId = String(event.data.callId)
      calls.set(callId, {
        callId,
        name: event.data.name,
        argumentsText: event.data.arguments,
        arguments: parseArguments(event.data.arguments),
        callSeq: event.seq,
      })
      order.push(callId)
      continue
    }
    if (event.type !== 'tool/result') continue
    const block = event.data.message.content[0]
    if (block.type !== 'tool-result') continue
    const callId = String(block.toolCallId)
    const prior = calls.get(callId)
    if (prior === undefined) continue
    calls.set(callId, {
      ...prior,
      resultSeq: event.seq,
      isError: block.isError === true,
      resultText: textFromBlocks(block.content),
      ...(event.data.error === undefined ? {} : { error: event.data.error }),
    })
  }

  const toolCalls = order.flatMap(callId => {
    const found = calls.get(callId)
    return found === undefined ? [] : [found]
  })
  const queryAttempts: ObservedQueryAttempt[] = toolCalls
    .filter(call => call.name === 'query_data')
    .map((call) => {
      const args = call.arguments !== null && typeof call.arguments === 'object'
        ? call.arguments as Record<string, unknown>
        : {}
      return {
        ...call,
        ...(typeof args.sql === 'string' ? { sql: args.sql } : {}),
        ...(typeof args.scope_id === 'string' ? { scopeId: args.scope_id } : {}),
        ...parseQueryResult(call.resultText, call.isError),
      }
    })
  const clarifications = toolCalls.flatMap(call => {
    const question = clarificationFrom(call)
    return question === undefined ? [] : [question]
  })

  return {
    finalAnswer: assistants.at(-1) ?? '',
    firstUserText,
    toolNames,
    assistantMessages: assistants,
    toolCalls,
    queryAttempts,
    clarifications,
    modelCalls,
    successfulQueries: queryAttempts.filter(query => query.state === 'completed').length,
    usage,
    wallClockMs,
  }
}
