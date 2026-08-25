/**
 * SemanticLayerShell — sidebar footer-action trigger that opens or resumes
 * the semantic-layer management agent session. Clicking the button finds the
 * existing session with `agentPreset === 'semantic-layer-management'` and
 * opens it, or creates a new one when none exists.
 *
 * Receives the `SidebarFooterActionOwnerProps` owner share (`{ wide }`) and
 * the inject factory's action callback.
 */
import clsx from 'clsx'
import {
  IconDataOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SemanticLayerShell.module.css'

export interface SemanticLayerShellProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
  /** Locale-bound translate for this namespace. */
  t: TranslateNS<'semanticLayer'>
  /** Open or create the management agent session. */
  openOrCreateSession: () => void
}

export function SemanticLayerShell({ wide, t, openOrCreateSession }: SemanticLayerShellProps) {
  return (
    <Tooltip label={t('title')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.triggerRail)}
        onClick={openOrCreateSession}
      >
        <IconDataOutline16 size={wide ? 16 : 18} />
        {wide && <span className={css.label}>{t('title')}</span>}
      </button>
    </Tooltip>
  )
}
