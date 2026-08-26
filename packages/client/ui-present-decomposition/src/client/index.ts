import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { DecompositionCard } from './DecompositionCard.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'present_decomposition' }, DecompositionCard))
}
