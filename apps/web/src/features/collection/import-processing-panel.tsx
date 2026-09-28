'use client'

import { ProgressBar } from '@/components/pathways'
import { Button } from '@/components/ui/button'

import { type ImportProcessingProgress, importProcessingPercent } from './import-auto-continue'

export type ImportProcessingState = 'running' | 'stopping' | 'stopped' | 'failed' | 'complete'

function summary(progress: ImportProcessingProgress) {
  const detail = [
    `${progress.processed} processed`,
    progress.unprocessed ? `${progress.unprocessed} held for review` : null,
    progress.failed ? `${progress.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return `${progress.handled} of ${progress.total} rows handled (${detail})`
}

function statusText(
  state: ImportProcessingState,
  progress: ImportProcessingProgress,
  note?: string,
) {
  if (state === 'running') return `Processing rows: ${summary(progress)}.`
  if (state === 'stopping') return `Stopping after the current group of rows: ${summary(progress)}.`
  if (state === 'complete') return `Processing finished: ${summary(progress)}.`
  if (state === 'stopped') return `Processing stopped: ${summary(progress)}. Resume to continue.`
  return `Processing paused: ${summary(progress)}.${note ? ` ${note}` : ''} Resume to continue.`
}

/**
 * Accessible progress for automatic import processing. The live region announces
 * each server checkpoint; Stop takes effect after the in-flight request returns.
 */
export function ImportProcessingPanel({
  state,
  progress,
  note,
  onStop,
  onResume,
  canResume = true,
}: {
  state: ImportProcessingState
  progress: ImportProcessingProgress
  note?: string
  onStop: () => void
  onResume?: () => void
  canResume?: boolean
}) {
  const tone =
    state === 'failed'
      ? 'danger'
      : state === 'complete'
        ? 'success'
        : state === 'running'
          ? 'info'
          : 'warning'
  return (
    <section
      aria-label="Import processing"
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="import-processing-panel"
    >
      <ProgressBar
        label="Import processing"
        tone={tone}
        value={importProcessingPercent(progress)}
      />
      <output aria-live="polite" className="block text-sm text-foreground">
        {statusText(state, progress, note)}
      </output>
      {state === 'running' || state === 'stopping' ? (
        <Button disabled={state === 'stopping'} onClick={onStop} type="button" variant="outline">
          {state === 'stopping' ? 'Stopping...' : 'Stop processing'}
        </Button>
      ) : (state === 'stopped' || state === 'failed') && onResume ? (
        <Button disabled={!canResume} onClick={onResume} type="button">
          Resume processing
        </Button>
      ) : null}
    </section>
  )
}
