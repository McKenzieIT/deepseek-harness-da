import type { ToolCallBlock, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { FollowupChipsInjected } from './index.ts'
import css from './FollowupChips.module.css'

export interface Suggestion {
  label: string
  value: string
}

export interface FollowupChipsProps {
  block: ToolCallBlock
  useSession: <S>(sel: (s: ConversationSnapshot) => S, eq?: (a: S, b: S) => boolean) => S
  submit: FollowupChipsInjected['submit']
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
  const latestTurn = turnOrder[turnOrder.length - 1]
  const timing = snapshot.turnTimings.get(latestTurn)
  if (!timing) return true
  return block.time >= timing.startTime
}

function SkeletonState() {
  return (
    <div className={css.skeleton}>
      <div className={css.skeletonChip} style={{ width: '90px' }} />
      <div className={css.skeletonChip} style={{ width: '120px' }} />
      <div className={css.skeletonChip} style={{ width: '80px' }} />
    </div>
  )
}

function FallbackContent({ block }: { block: ToolCallBlock & { kind: 'tool-result' } }) {
  const text = block.content.map(c => ('text' in c ? c.text : '')).join('\n')
  return (
    <div className={css.fallback}>
      <pre className={css.fallbackText}>{text}</pre>
    </div>
  )
}

export function FollowupChips({ block, useSession, submit }: FollowupChipsProps) {
  const visible = useSession(snapshot => isLatestTurn(block, snapshot))

  if (!visible) return null

  if (!('kind' in block)) {
    return <SkeletonState />
  }

  if (block.call === null) {
    return <FallbackContent block={block} />
  }

  const suggestions = parseSuggestions(block.call.argsRaw)
  if (suggestions === null) {
    return <FallbackContent block={block} />
  }

  return (
    <div className={css.row}>
      {suggestions.map(s => (
        <button
          key={s.value}
          type="button"
          className={css.chip}
          onClick={() => submit(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
