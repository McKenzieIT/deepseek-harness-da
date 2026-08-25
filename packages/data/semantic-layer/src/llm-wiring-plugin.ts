/**
 * Cordis plugin that wires `ctx.llm` into `ctx.schema`'s enrichment seam.
 *
 * When both services are mounted, this plugin creates a TextLlm adapter from
 * `ctx.llm.stream()` + `BlockAssembler` and calls `wireEnrichmentLlm`. After
 * this, `discoverRelations` / `discoverEventRelations` / the on-write hook
 * run the LLM semantic round (G3 two-round strategy).
 *
 * Mount via the bundle patch as a separate row with id `enrichment-llm-wiring`.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/llm-wiring-plugin
 */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { wireEnrichmentLlm, type TextLlm } from './index.ts'

export const name = 'enrichment-llm-wiring'
export const inject = ['schema', 'llm']

export interface Config {
  readonly provider?: string
  readonly model?: string
}

export const Config: z<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
})

export function apply(ctx: Context, config: Config = {}): void {
  const provider = config.provider || 'aga'
  const model = config.model || 'qwen3.7-max'

  const textLlm: TextLlm = {
    async text(prompt: string): Promise<string> {
      const assembler = new BlockAssembler()
      const options = {
        provider,
        model,
        messages: [
          createUserMessage({
            content: [{ type: 'text' as const, text: prompt }],
            source: { kind: 'plugin' as const, plugin: 'enrichment-llm-wiring' },
          }),
        ],
      }
      for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
      const text = assembler.blocks()
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join('')
      if (text.length === 0) {
        throw new Error('enrichment-llm-wiring: LLM returned no text blocks')
      }
      return text
    },
  }

  wireEnrichmentLlm(ctx.schema, textLlm)
  ctx.logger.info(`enrichment-llm-wiring: wired ${provider}/${model} into ctx.schema enrichment`)
}
