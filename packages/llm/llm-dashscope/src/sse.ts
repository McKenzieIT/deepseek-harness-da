/**
 * Decode a DashScope native SSE byte stream into event `data` payloads. Framing — chunk
 * reassembly, UTF-8/CRLF/BOM handling, comment and non-data field skipping, multi-`data:` joining
 * — is `eventsource-parser`'s. Comments (the `:HTTP_STATUS/200` keep-alive lines) are reported
 * only through an optional transport-activity callback, which the idle watchdog pulses on.
 *
 * Unlike OpenAI-compatible streams, DashScope native has NO `[DONE]` sentinel: termination is the
 * payload's `finish_reason` real value (the literal string `"null"` marks non-terminal events),
 * detected by `translate`. So this parser just yields non-empty `data` payloads until the stream
 * ends; truncation (stream end without a terminal `finish_reason`) is `translate`'s to raise.
 *
 * @module dsh-llm-dashscope/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'

/**
 * Parse an SSE byte stream into `data` payloads. Empty-data events (keep-alive) are skipped.
 * Yields until the stream ends; the caller (`translate`) detects the terminal `finish_reason`
 * and emits `finish`.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @returns each event's non-empty `data` payload in arrival order.
 */
export async function* parseSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<string> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const { data } of events) {
    if (data.length > 0) yield data
  }
}
