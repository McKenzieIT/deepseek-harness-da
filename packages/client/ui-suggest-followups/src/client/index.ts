// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { FollowupChips } from './FollowupChips.tsx'
import { en, zh, type FollowupKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The follow-up list copy: caption, list aria, send hint, expired hint, error box. */
    'suggest.followups': FollowupKey
  }
}

/** Namespace owning the follow-up list copy. */
const NS = 'suggest.followups'

export const inject = ['slots', 'sessions', 'locale'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-suggest-followups: dictionaries')
  const sessions: ISessions = ctx.sessions

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'suggest_followups',
    locale: NS,
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
