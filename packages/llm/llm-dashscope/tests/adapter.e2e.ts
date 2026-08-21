/**
 * Real-API e2e for the direct-fetch DashScope adapter, against the AGA AI Gateway (DashScope
 * native protocol). Key-gated — skips entirely without $DASHSCOPE_API_KEY (see vitest.e2e.config.ts).
 *
 * These cases also verify the translate.ts ASSUMPTION: with `incremental_output: true`,
 * `reasoning_content` and `tool_calls[].function.arguments` stream as delta fragments
 * (consistent with `content`). A streaming thinking model + a streaming tool-call round-trip
 * confirm it; if the gateway shipped full snapshots, assembly would duplicate and these fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { CallId, createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message, ToolSchema } from '@deepseek-ai/dsh-llm'
import * as LlmDashScope from '@deepseek-ai/dsh-llm-dashscope'
import type { Config } from '@deepseek-ai/dsh-llm-dashscope'
import { assemble, type AssembledResult } from './assemble.ts'

const FLASH = 'qwen-flash'
const PLUS = 'qwen-plus'
const THINKING = 'qwen3.6-plus'
const contexts: Context[] = []
let identityHome: string

beforeEach(async () => {
  identityHome = await mkdtemp(join(tmpdir(), 'dsh-dashscope-e2e-'))
  vi.stubEnv('DSH_HOME', identityHome)
})

async function harness(config: Partial<Config> = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmDashScope, config)
  return ctx
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllEnvs()
  await rm(identityHome, { recursive: true, force: true })
})

function ask(text: string): Message[] {
  return [createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'test' },
  })]
}

function textOf(result: AssembledResult): string {
  return result.message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

const weatherTool: ToolSchema = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
}

describe.skipIf(!process.env.DASHSCOPE_API_KEY)('llm-dashscope e2e (real AGA gateway)', () => {
  it('serves a non-streaming-shape text request over the streaming adapter', async () => {
    const ctx = await harness()
    const result = await assemble(ctx, {
      model: FLASH,
      messages: ask('Reply with exactly the word: pong'),
      maxTokens: 50,
    })
    expect(result.finish.kind).toBe('stop')
    expect(textOf(result).toLowerCase()).toContain('pong')
    expect(result.usage?.inputTokens).toBeGreaterThan(0)
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
  })

  it('streams raw chunks in protocol order (block-start … usage before finish)', async () => {
    const ctx = await harness()
    const kinds: string[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'aga',
      model: FLASH,
      messages: ask('Count from 1 to 5, digits only.'),
      maxTokens: 50,
    })) {
      kinds.push(chunk.type)
    }
    expect(kinds[0]).toBe('block-start')
    expect(kinds.at(-1)).toBe('finish')
    expect(kinds.filter(kind => kind === 'finish')).toHaveLength(1)
    expect(kinds.indexOf('usage')).toBeLessThan(kinds.indexOf('finish'))
  })

  it('streams a thinking model with reasoning before text (delta assumption)', async () => {
    const ctx = await harness()
    const result = await assemble(ctx, {
      model: THINKING,
      messages: ask('Which is larger, 9.11 or 9.8? Answer with just the number.'),
      maxTokens: 2000,
    })
    expect(result.finish.kind).toBe('stop')
    expect(result.message.content.some(block => block.type === 'reasoning')).toBe(true)
    expect(textOf(result)).toContain('9.8')
    expect(result.usage?.reasoningTokens).toBeGreaterThan(0)
  })

  it('streams a tool-call round trip with reasoning passback', async () => {
    const ctx = await harness()
    const first = await assemble(ctx, {
      model: PLUS,
      messages: ask('What is the weather in Paris? Use the get_weather tool.'),
      tools: [weatherTool],
      maxTokens: 2000,
    })
    expect(first.finish.kind).toBe('tool-calls')
    const call = first.message.content.find(block => block.type === 'tool-call')
    expect(call).toBeDefined()
    if (call?.type !== 'tool-call') throw new Error('expected a tool-call')
    expect(call.name).toBe('get_weather')
    expect(JSON.parse(call.arguments)).toMatchObject({ city: expect.stringMatching(/paris/i) as string })

    const second = await assemble(ctx, {
      model: PLUS,
      messages: [
        ...ask('What is the weather in Paris? Use the get_weather tool.'),
        createMessage({ role: 'assistant', content: first.message.content, source: { kind: 'plugin', plugin: 'test' } }),
        createUserMessage({
          content: [{ type: 'tool-result', toolCallId: CallId(call.id), content: [{ type: 'text', text: 'Sunny, 22°C' }] }],
          source: { kind: 'plugin', plugin: 'test' },
        }),
      ],
      tools: [weatherTool],
      maxTokens: 2000,
    })
    expect(second.finish.kind).toBe('stop')
    expect(textOf(second).toLowerCase()).toMatch(/sunny|22/)
  })
})
