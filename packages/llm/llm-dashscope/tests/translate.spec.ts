import { describe, expect, it } from 'vitest'
import { CallId, EMPTY_RESPONSE_CODE } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { translate, mapFinishReason, mapUsage } from '../src/translate.ts'
import type { WireUsage } from '../src/types.ts'

async function* payloadsOf(arr: readonly string[]): AsyncGenerator<string> {
  for (const a of arr) yield a
}

async function run(arr: readonly string[]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of translate(payloadsOf(arr))) out.push(chunk)
  return out
}

function kinds(chunks: readonly StreamChunk[]): string[] {
  return chunks.map(c => c.type)
}

describe('translate', () => {
  it('streams a text delta and terminates on finish_reason stop (no [DONE])', async () => {
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"role":"assistant","content":"hello"}}]},"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4,"prompt_tokens_details":{"cached_tokens":0}},"request_id":"r"}',
      '{"output":{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":""}}]},"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4,"prompt_tokens_details":{"cached_tokens":0}},"request_id":"r"}',
    ])
    expect(kinds(chunks)).toEqual(['block-start', 'text-delta', 'block-end', 'usage', 'finish'])
    const text = chunks.find(c => c.type === 'text-delta')
    expect(text && text.type === 'text-delta' && text.text).toBe('hello')
    const usage = chunks.find(c => c.type === 'usage')
    // cached_tokens:0 is present on the real wire (even at 0) → cacheReadTokens:0 reported.
    expect(usage && usage.type === 'usage' && usage.usage).toEqual({ inputTokens: 3, outputTokens: 1, cacheReadTokens: 0 })
    const finish = chunks.find(c => c.type === 'finish')
    expect(finish && finish.type === 'finish' && finish.reason).toEqual({ kind: 'stop' })
  })

  it('ignores the literal "null" finish_reason; EOF without a real value is truncation', async () => {
    await expect(run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"content":"x"}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
    ])).rejects.toMatchObject({ code: 'STREAM_CLOSED' })
  })

  it('streams reasoning before text', async () => {
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"role":"assistant","reasoning_content":"think"}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
      '{"output":{"choices":[{"finish_reason":"null","message":{"content":"answer"}}]},"usage":{"input_tokens":1,"output_tokens":2}}',
      '{"output":{"choices":[{"finish_reason":"stop","message":{"content":""}}]},"usage":{"input_tokens":1,"output_tokens":2}}',
    ])
    expect(kinds(chunks)).toEqual(['block-start', 'reasoning-delta', 'block-start', 'text-delta', 'block-end', 'block-end', 'usage', 'finish'])
  })

  it('joins an array content (multimodal) into a text delta', async () => {
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"content":[{"text":"9.8"}]}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
      '{"output":{"choices":[{"finish_reason":"stop","message":{"content":""}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
    ])
    const text = chunks.find(c => c.type === 'text-delta')
    expect(text && text.type === 'text-delta' && text.text).toBe('9.8')
  })

  it('assembles tool-call fragments by index into one tool-call block', async () => {
    // arguments fragments "{" + "}" concatenate to "{}" (avoids JSON-escape pitfalls in the fixture).
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"role":"assistant","content":"","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{"}}]}}]},"usage":{"input_tokens":10,"output_tokens":1}}',
      '{"output":{"choices":[{"finish_reason":"null","message":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]},"usage":{"input_tokens":10,"output_tokens":2}}',
      '{"output":{"choices":[{"finish_reason":"tool_calls","message":{"content":""}}]},"usage":{"input_tokens":10,"output_tokens":2}}',
    ])
    const blockEnd = chunks.find(c => c.type === 'block-end' && c.block.type === 'tool-call')
    expect(blockEnd).toBeDefined()
    if (blockEnd !== undefined && blockEnd.type === 'block-end' && blockEnd.block.type === 'tool-call') {
      expect(blockEnd.block.id).toBe(CallId('call_1'))
      expect(blockEnd.block.name).toBe('get_weather')
      expect(blockEnd.block.arguments).toBe('{}')
    }
    const finish = chunks.find(c => c.type === 'finish')
    expect(finish && finish.type === 'finish' && finish.reason).toEqual({ kind: 'tool-calls' })
  })

  it('subtracts cached_tokens to keep usage DISJOINT', () => {
    const u = mapUsage({ input_tokens: 100, output_tokens: 5, prompt_tokens_details: { cached_tokens: 30 } } as WireUsage)
    expect(u).toEqual({ inputTokens: 70, outputTokens: 5, cacheReadTokens: 30 })
  })

  it('reports reasoning_tokens when present', () => {
    const u = mapUsage({ input_tokens: 10, output_tokens: 327, output_tokens_details: { reasoning_tokens: 319 } } as WireUsage)
    expect(u).toEqual({ inputTokens: 10, outputTokens: 327, reasoningTokens: 319 })
  })

  it('maps finish reasons', () => {
    expect(mapFinishReason('stop')).toEqual({ kind: 'stop' })
    expect(mapFinishReason('tool_calls')).toEqual({ kind: 'tool-calls' })
    expect(mapFinishReason('length')).toEqual({ kind: 'max-tokens' })
    expect(mapFinishReason('content_filter')).toMatchObject({ kind: 'error' })
  })

  it('turns a stop with no content into an EMPTY_RESPONSE error finish', async () => {
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"stop","message":{"content":""}}]},"usage":{"input_tokens":1,"output_tokens":0}}',
    ])
    const finish = chunks.find(c => c.type === 'finish')
    expect(finish && finish.type === 'finish' && finish.reason).toMatchObject({ kind: 'error', failure: { code: EMPTY_RESPONSE_CODE } })
  })

  it('rejects malformed JSON with MALFORMED_RESPONSE', async () => {
    await expect(run(['{not json}'])).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('terminates on a finish_reason event even with no message field', async () => {
    // A terminal event (finish_reason:"stop") with NO message must still terminate — termination
    // is via finish_reason alone (spec §3), independent of message presence. (translate.ts R2 fix.)
    const chunks = await run([
      '{"output":{"choices":[{"finish_reason":"null","message":{"content":"hi"}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
      '{"output":{"choices":[{"finish_reason":"stop"}]},"usage":{"input_tokens":1,"output_tokens":1}}',
    ])
    const finish = chunks.find(c => c.type === 'finish')
    expect(finish && finish.type === 'finish' && finish.reason).toEqual({ kind: 'stop' })
  })
})
