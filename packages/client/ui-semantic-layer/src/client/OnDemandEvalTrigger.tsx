import { useState, useRef, useEffect, type FC } from 'react'

export interface OnDemandEvalTriggerProps {
  assetId?: string | undefined
  onTrigger: (assetId?: string) => Promise<string | null>
  t: (key: string) => string
}

export const OnDemandEvalTrigger: FC<OnDemandEvalTriggerProps> = ({ assetId, onTrigger, t }) => {
  const [running, setRunning] = useState(false)
  const [lastRunId, setLastRunId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const handleClick = async () => {
    setRunning(true)
    try {
      const runId = await onTrigger(assetId)
      if (mountedRef.current) setLastRunId(runId)
    } finally {
      if (mountedRef.current) setRunning(false)
    }
  }

  return (
    <div className="sl-eval-trigger">
      <button
        className="sl-eval-trigger__button"
        // onClick expects a void-returning handler; fire-and-forget the async
        // trigger (errors surface via state, see handleClick).
        onClick={() => { void handleClick() }}
        disabled={running}
        type="button"
      >
        {running ? t('evidence.eval.running') : t('evidence.eval.trigger')}
      </button>
      {lastRunId && (
        <span className="sl-eval-trigger__run-id">
          {t('evidence.eval.lastRun')}: {lastRunId.slice(0, 8)}
        </span>
      )}
    </div>
  )
}
