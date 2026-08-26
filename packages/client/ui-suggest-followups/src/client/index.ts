import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { FollowupChips } from './FollowupChips.tsx'

export const inject = ['slots', 'sessions'] as const

export function apply(ctx: ClientContext): void {
  const sessions: ISessions = ctx.sessions

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'suggest_followups',
    inject: (sessionId: SessionId): FollowupChipsInjected => ({
      submit: (text: string) => {
        const scoped = sessions.scope(sessionId)
        if (scoped === undefined) return
        const conversation = scoped.get('conversation')
        if (conversation === undefined) return
        void conversation.send(text)
      },
    }),
  }, FollowupChips))
}

export interface FollowupChipsInjected {
  submit: (text: string) => void
}
