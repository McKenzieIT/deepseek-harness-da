/**
 * Serialize harness messages into DashScope (AGA Gateway) native protocol. User text is joined;
 * assistant text becomes `content`, tool calls become `tool_calls`, and tool results become
 * separate tool messages — all nested under `input.messages`. Assistant reasoning is replayed as
 * `reasoning_content` only on tool-call turns (the thinking-mode passback rule, mirrored from
 * llm-deepseek; native passback behavior not separately probed — see `research/p2-dashscope-wire.md`).
 * Tools live in `parameters.tools` (AGA-specific: top-level tools are silently dropped — live-confirmed).
 * Core image blocks are rejected (this wire route is text-only in phase 1).
 * @module dsh-llm-dashscope/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireToolCall, WireTool } from './types.ts'

/**
 * Adapter-level request defaults (from plugin config). The native protocol has no per-request
 * thinking knob (thinking is model-bound, controlled by model selection), so this carries nothing
 * today; kept as a seam for future adapter-owned defaults.
 */
export interface RequestDefaults {}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject core image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The DashScope chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls: WireToolCall[] = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — NEVER null. Pure tool-call turns: the passback rule replays
    // message.content verbatim (which is "") and some gateways reject null. Reasoning-ONLY turns:
    // content must still be SET, or a null here poisons the session log and bricks later turns.
    content: text,
    // Passback rule: reasoning_content returns on tool-call turns; ignored on plain turns
    // (drop it there to save tokens).
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone `{role:'tool'}` messages;
 * the harness puts each tool result in its own user-role message, so a mixed user message
 * contributes its text first and its tool results as separate wire messages after.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export function serializeMessages(messages: Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    // user role: tool results ride in user messages in the harness vocabulary, but DashScope
    // wants them as role:'tool' messages.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Build the full native wire request. Always streaming (`incremental_output: true`, the
 * `X-DashScope-SSE` header is added by the adapter); optional fields are omitted rather than sent
 * as null, so provider defaults apply. No `stream`/`stream_options`/`enable_thinking`/
 * `thinking_budget`/`tool_stream` — the native protocol carries none of these.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param _defaults - adapter-level request defaults (from plugin config); the native protocol has
 * no per-request thinking knob, so this carries nothing today and is kept as a seam for future
 * adapter-owned defaults.
 * @returns the DashScope native chat-generation request body.
 */
export function serializeRequest(options: GenerateOptions, _defaults: RequestDefaults = {}): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  // NOTE: options.stop is intentionally NOT serialized — the DashScope native protocol's
  // stop-sequence support is unprobed (调用文档 §3 lists max_tokens/temperature only); silently
  // dropped in phase 1. Add when the gateway's stop support is confirmed.
  return {
    model: options.model,
    input: { messages },
    parameters: {
      result_format: 'message',
      incremental_output: true,
      ...tools !== undefined && tools.length > 0 ? { tools } : {},
      ...options.temperature !== undefined ? { temperature: options.temperature } : {},
      ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    },
  }
}
