/**
 * Translate DashScope native SSE payloads into the harness `StreamChunk` protocol, with one
 * stateful harness block per content, reasoning, or tool-call index. `finish_reason` is the
 * literal string `"null"` on non-terminal events; a real value (`"stop"`/`"tool_calls"`/
 * `"length"`) terminates the stream — there is NO `[DONE]` sentinel. Usage is cumulative per
 * event (the latest is kept). `message.content` may be a string (text models) or an array of
 * `{text}` parts (thinking/multimodal models); both map to `text-delta`.
 *
 * ASSUMPTION (verify via the key-gated e2e): with `incremental_output: true`,
 * `reasoning_content` and `tool_calls[].function.arguments` are delta fragments — consistent
 * with `content` (confirmed delta by probe 3). The e2e exercises a streaming thinking model +
 * streaming tool-call to confirm; if the gateway ships full snapshots instead, accumulation
 * would duplicate and the e2e will catch it.
 *
 * @module dsh-llm-dashscope/translate
 */

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { WireChunk, WireDelta, WireUsage } from './types.ts'

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/** The textual delta of a `message.content` that may be a string or an array of `{text}` parts. */
function textDeltaOf(content: WireDelta['content']): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => part?.text ?? '').join('')
  return ''
}

/**
 * Map the wire `finish_reason` vocabulary to the harness FinishReason.
 * @param reason - the wire `finish_reason` string (already known non-`"null"`).
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
 */
export function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'tool_calls': return { kind: 'tool-calls' }
    case 'length': return { kind: 'max-tokens' }
    default:
      return { kind: 'error', failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() } }
  }
}

/**
 * Map wire usage fields. `input_tokens` INCLUDES cache hits (the OpenAI-compat
 * `prompt_tokens_details.cached_tokens` spelling reports them); the harness TokenUsage
 * convention is DISJOINT counts, so cache reads are subtracted out of `inputTokens`.
 * `output_tokens` includes reasoning tokens on thinking models; `output_tokens_details.
 * reasoning_tokens` breaks them out.
 * @param usage - wire usage from any event (cumulative — the latest is kept upstream).
 * @returns disjoint harness counts; cache/reasoning fields present only when the wire reported them.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens
  const reasoning = usage.output_tokens_details?.reasoning_tokens
  return {
    inputTokens: usage.input_tokens - (cacheRead ?? 0),
    outputTokens: usage.output_tokens,
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}

/** Assemble the final ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/**
 * Consume SSE `data` payloads and yield StreamChunks. The terminal event (whose `finish_reason`
 * is a real value, not the literal `"null"`) closes all open blocks, emits the latest `usage`,
 * and yields `finish`; nothing follows. A stream that ends without a terminal `finish_reason`
 * aborts with `STREAM_CLOSED` (truncation). Malformed JSON aborts with `MALFORMED_RESPONSE`.
 * @param payloads - SSE `data` payloads from {@link parseSse}.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are deferred to the terminal event.
 *   A `stop` (or absent) finish with no opened blocks is a degenerate provider completion and maps
 *   to an `EMPTY_RESPONSE` error finish instead of a successful empty message.
 */
export async function* translate(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const toolBlocks = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined

  function open(kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  for await (const payload of payloads) {
    let chunk: WireChunk
    try {
      chunk = JSON.parse(payload) as WireChunk
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    for (const choice of chunk.output?.choices ?? []) {
      // Termination is via finish_reason alone (independent of message presence) — check before
      // the message skip, so a terminal event with no message still terminates (not STREAM_CLOSED).
      if (typeof choice.finish_reason === 'string' && choice.finish_reason !== 'null') {
        pendingFinish = mapFinishReason(choice.finish_reason)
      }
      const message = choice.message
      if (message === undefined) continue

      // Reasoning first: thinking mode interleaves it before text.
      const reasoningRaw = message.reasoning_content
      const reasoning = typeof reasoningRaw === 'string' ? reasoningRaw
        : Array.isArray(reasoningRaw) ? (reasoningRaw as Array<{ text?: string }>).map(part => part?.text ?? '').join('')
          : ''
      if (reasoning.length > 0) {
        if (!reasoningBlock) {
          reasoningBlock = open('reasoning')
          yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }
        }
        reasoningBlock.text += reasoning
        yield { type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning }
      }

      const text = textDeltaOf(message.content)
      if (text.length > 0) {
        if (!textBlock) {
          textBlock = open('text')
          yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
        }
        textBlock.text += text
        yield { type: 'text-delta', index: textBlock.index, text }
      }

      for (const call of message.tool_calls ?? []) {
        const idx = call.index ?? 0
        let block = toolBlocks.get(idx)
        if (!block) {
          block = open('tool-call')
          toolBlocks.set(idx, block)
          yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
        }
        if (call.id !== undefined) block.callId = call.id
        if (call.function?.name !== undefined) block.name = call.function.name
        const fragment = call.function?.arguments ?? ''
        block.text += fragment
        yield {
          type: 'tool-call-delta',
          index: block.index,
          id: CallId(block.callId ?? ''),
          ...block.name !== undefined ? { name: block.name } : {},
          argumentsDelta: fragment,
        }
      }

    }

    // Usage may arrive on every event (cumulative) — keep the latest.
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage)

    if (pendingFinish !== undefined) {
      // Terminal event: close blocks, emit usage, then finish (nothing after).
      for (const block of order) {
        yield { type: 'block-end', index: block.index, block: closeBlock(block) }
      }
      if (pendingUsage) yield { type: 'usage', usage: pendingUsage }
      const reason = pendingFinish
      yield {
        type: 'finish',
        reason: reason.kind === 'stop' && order.length === 0
          ? {
            kind: 'error',
            failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
          }
          : reason,
      }
      return
    }
  }

  // parseSse yielded to EOF without a terminal finish_reason — truncation.
  throw new LlmError('SSE stream ended without a terminal finish_reason', 'STREAM_CLOSED')
}
