import type { KeyboardEvent } from 'react'
import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { FollowupChipsInjected } from './index.ts'
import type { FollowupKey } from './locales.ts'
import css from './FollowupChips.module.css'

export interface Suggestion {
  label: string
  value: string
}

export interface FollowupChipsProps {
  block: ToolCallBlock
  useSession: <S>(sel: (s: ConversationSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  submit: FollowupChipsInjected['submit']
  t: (key: FollowupKey) => string
}

function parseSuggestions(argsRaw: string): Suggestion[] | null {
  try {
    const parsed = JSON.parse(argsRaw) as { suggestions?: unknown }
    if (!parsed || !Array.isArray(parsed.suggestions)) return null
    const suggestions = parsed.suggestions as Suggestion[]
    if (suggestions.length === 0) return null
    for (const s of suggestions) {
      if (typeof s.label !== 'string' || typeof s.value !== 'string') return null
    }
    return suggestions
  } catch {
    return null
  }
}

function isLatestTurn(block: ToolCallBlock, snapshot: ConversationSnapshot): boolean {
  if (!('kind' in block)) return true
  const turnOrder = snapshot.chat.timeline.turnOrder
  if (turnOrder.length === 0) return true
  const latestTurn = turnOrder[turnOrder.length - 1] as number
  const timing = snapshot.turnTimings.get(latestTurn)
  if (!timing) return true
  return block.time >= timing.startTime
}

function SkeletonState() {
  return (
    <div className={css.skeleton} aria-hidden="true">
      <div className={css.skeletonRow} />
      <div className={css.skeletonRow} />
      <div className={css.skeletonRow} />
    </div>
  )
}

function FallbackContent({ block }: { block: ToolCallBlock & { kind: 'tool-result' } }) {
  const text = (block as unknown as { content: readonly { text?: string }[] }).content.map(c => c.text ?? '').join('\n')
  return (
    <div className={css.fallback}>
      <pre className={css.fallbackText}>{text}</pre>
    </div>
  )
}

function ErrorState({ detail, t }: { detail: string; t: FollowupChipsProps['t'] }) {
  return (
    <div className={css.error} role="alert">
      <div className={css.errorTitle}>{t('error')}</div>
      {detail !== '' && <div className={css.errorDetail}>{detail}</div>}
      <div className={css.errorHint}>{t('errorHint')}</div>
    </div>
  )
}

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

/** Roving focus: arrow/home/end keys move focus among the enabled rows. */
function handleListKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (!NAV_KEYS.has(e.key)) return
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-followup-item]:not([disabled])'),
  )
  if (items.length === 0) return
  e.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  let next = 0
  if (e.key === 'ArrowDown') next = (current + 1 + items.length) % items.length
  if (e.key === 'ArrowUp') next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
  if (e.key === 'Home') next = 0
  if (e.key === 'End') next = items.length - 1
  const target = items[next]
  /* v8 ignore next 1 -- next is always an in-range index of items */
  if (target === undefined) return
  target.focus()
}

/**
 * Follow-up list (prototype variant B): one row per suggestion with the label
 * primary and the full query value visible underneath — clicking a row submits
 * the value as a new conversation message. Rows from older turns stay in the
 * transcript as disabled rows instead of vanishing; a failed tool call renders
 * an error box instead of silently showing stale chips.
 */
export function FollowupChips({ block, useSession, submit, t }: FollowupChipsProps) {
  const current = useSession(snapshot => isLatestTurn(block, snapshot))

  if (!('kind' in block)) {
    return <SkeletonState />
  }

  if (block.call === null) {
    return <FallbackContent block={block} />
  }

  if (block.isError) {
    const detail = (block as unknown as { content: readonly { text?: string }[] })
      .content.map(c => c.text ?? '').join('\n').trim()
    return <ErrorState detail={detail} t={t} />
  }

  const suggestions = parseSuggestions(block.call.argsRaw)
  if (suggestions === null) {
    return <FallbackContent block={block} />
  }

  return (
    <div>
      <div className={css.caption}>{t('caption')}</div>
      <ul className={css.list} aria-label={t('listAria')} onKeyDown={handleListKeyDown}>
        {suggestions.map((s, i) => (
          <li key={`${i}:${s.label}`} className={css.itemWrap}>
            <button
              type="button"
              data-followup-item=""
              className={css.item}
              disabled={!current}
              title={current ? undefined : t('expired')}
              aria-label={t('sendAria').replace('{label}', s.label)}
              tabIndex={i === 0 ? 0 : -1}
              onClick={() => { submit(s.value) }}
            >
              <span className={css.itemMain}>
                <span className={css.label}>{s.label}</span>
                <span className={css.value}>{s.value}</span>
              </span>
              {current && <span className={css.send} aria-hidden="true">{t('send')} ↵</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
