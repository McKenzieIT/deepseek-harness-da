import { describe, expect, it } from 'vitest'
import { parseSse } from '../src/sse.ts'

function streamOf(chunks: string[]): ReadableStream<BufferSource> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function drain(stream: ReadableStream<BufferSource>): Promise<string[]> {
  const out: string[] = []
  for await (const data of parseSse(stream)) out.push(data)
  return out
}

describe('parseSse', () => {
  it('yields non-empty data payloads in arrival order', async () => {
    expect(await drain(streamOf(['data: a\n\n', 'data: b\n\n']))).toEqual(['a', 'b'])
  })

  it('skips empty-data keep-alive events', async () => {
    expect(await drain(streamOf([': keep-alive\n\n', 'data: x\n\n']))).toEqual(['x'])
  })

  it('parses native id/event/comment framing and yields only data', async () => {
    const frame = 'id:1\nevent:result\n:HTTP_STATUS/200\ndata: {"output":{}}\n\n'
    expect(await drain(streamOf([frame]))).toEqual(['{"output":{}}'])
  })

  it('joins multi-line data fields', async () => {
    expect(await drain(streamOf(['data: line1\ndata: line2\n\n']))).toEqual(['line1\nline2'])
  })

  it('ends cleanly without a [DONE] sentinel (native has none)', async () => {
    // No throw on EOF — termination is the payload's finish_reason, handled by translate.
    expect(await drain(streamOf(['data: a\n\n', 'data: b\n\n']))).toEqual(['a', 'b'])
  })

  it('reports comments through the onComment callback (idle watchdog pulse)', async () => {
    const comments: string[] = []
    await (async () => {
      for await (const _ of parseSse(streamOf([': HTTP_STATUS/200\n\n', 'data: x\n\n']), c => comments.push(c))) { /* drain */ }
    })()
    expect(comments).toEqual(['HTTP_STATUS/200'])
  })
})
