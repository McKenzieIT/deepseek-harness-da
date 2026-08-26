/**
 * DashScope (AGA AI Gateway) native-protocol wire format. Types only.
 *
 * Source of truth: live probe 2026-08-19 (`research/p2-dashscope-wire.md` §1) +
 * reverse-bi `libs/rbi-llm/src/rbi_llm/providers/dashscope.py` + 调用文档-emp-414028.
 *
 * Native protocol (NOT OpenAI-compatible): messages in `input.messages`, tools in
 * `parameters.tools`, response in `output.choices[].message`, streaming via header
 * `X-DashScope-SSE: enable` + `parameters.incremental_output: true` (delta events,
 * NO `[DONE]`, terminate on `finish_reason` real value), `request_id` in the body
 * (not response headers). No `enable_thinking`/`thinking_budget`/`tool_stream`/
 * `stream_options` — thinking is model-bound.
 *
 * @module dsh-llm-dashscope/types
 */

/** Request body for `POST {baseURL}` (baseURL is the full generation path). */
export interface WireRequest {
  model: string
  input: { messages: WireMessage[] }
  parameters: WireParameters
}

/** Request `parameters`. `result_format` fixed; `incremental_output` always true (the harness always streams). */
export interface WireParameters {
  result_format: 'message'
  incremental_output: true
  max_tokens?: number
  temperature?: number
  /** AGA Gateway: tools MUST live here, NOT at top level (top-level tools are silently dropped — live-confirmed). */
  tools?: WireTool[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: text-only in phase 1 (the protocol supports a multimodal content array, not serialized here). */
export interface WireUserMessage {
  role: 'user'
  content: string
}

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/**
 * Assistant-role history message. `content` is "" (never null) on tool-call-only turns — some
 * gateways reject null. `reasoning_content` is replayed only on tool-call turns (the thinking-mode
 * passback rule, mirrored from llm-deepseek; native passback not separately probed).
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string | null
  reasoning_content?: string
  tool_calls?: WireToolCall[]
}

/** One entry of the request `input.messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `parameters.tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (or a non-streaming response body). */
export interface WireChunk {
  output?: { choices?: WireChoice[] }
  /** Arrives on every streaming event (cumulative — take the latest) and on non-streaming responses. */
  usage?: WireUsage
  /** Top-level on success and error bodies (the gateway's per-request id; NOT a response header). */
  request_id?: string
  /** Error body fields (HTTP non-2xx, or "200 + error body" failures). */
  code?: string
  message?: string
  /** Some error bodies nest under `error`. */
  error?: { code?: string; message?: string; request_id?: string }
}

/**
 * One streamed/non-streamed choice. `finish_reason` is the literal string `"null"` on non-terminal
 * streaming events; a real value (`"stop"`/`"tool_calls"`/`"length"`) on the terminal event.
 */
export interface WireChoice {
  finish_reason?: string | null
  message?: WireDelta
  index?: number
}

/**
 * The message of one choice. `content` is a string (text models) OR an array of `{text}` parts
 * (thinking/multimodal models); delta fragments in streaming.
 */
export interface WireDelta {
  role?: string
  content?: string | WireContentPart[] | null
  /**
   * Thinking chain. Delta fragments in streaming (ASSUMPTION: `incremental_output:true` makes
   * reasoning_content delta, consistent with content — confirmed for content, not separately probed
   * for reasoning; verify via the key-gated e2e). Absent on non-thinking models.
   * May arrive as a string or as an array of `{text}` parts (same shape as content on some models).
   */
  reasoning_content?: string | WireContentPart[] | null
  tool_calls?: WireToolCallDelta[]
}

/** One part of a multimodal content array. */
export interface WireContentPart {
  text?: string
  image?: string
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index?: number
  /** Present on the first delta of each call only. */
  id?: string
  type?: 'function'
  function?: {
    /** Present on the first delta of each call only. */
    name?: string
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string
  }
}

/**
 * Wire token accounting. `input_tokens`/`output_tokens` are native names;
 * `prompt_tokens_details.cached_tokens` is the OpenAI-compat spelling of cache hits (present even
 * at 0). `output_tokens` INCLUDES reasoning tokens on thinking models; `output_tokens_details.
 * reasoning_tokens` breaks them out.
 */
export interface WireUsage {
  input_tokens: number
  output_tokens: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number; text_tokens?: number }
  input_tokens_details?: { text_tokens?: number }
}
