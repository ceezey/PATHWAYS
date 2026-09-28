'use client'

import { useEffect, useId, useRef } from 'react'

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
 * When Stop (or a failure) removes the focused Stop button, focus moves to Resume
 * once it is enabled. `focusOnMount` moves focus to the panel heading when it first
 * appears, for flows where the control that started processing goes away.
 */
export function ImportProcessingPanel({
  state,
  progress,
  note,
  onStop,
  onResume,
  canResume = true,
  focusOnMount = false,
}: {
  state: ImportProcessingState
  progress: ImportProcessingProgress
  note?: string
  onStop: () => void
  onResume?: () => void
  canResume?: boolean
  focusOnMount?: boolean
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const previousState = useRef(state)
  const focusResume = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on mount only.
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const wasRunning = previousState.current === 'running' || previousState.current === 'stopping'
    if (wasRunning && (state === 'stopped' || state === 'failed')) focusResume.current = true
    previousState.current = state
    if (focusResume.current && canResume && resumeRef.current) {
      focusResume.current = false
      resumeRef.current.focus()
    }
  }, [state, canResume])

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
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="import-processing-panel"
    >
      <h3
        className="text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
      >
        Import processing
      </h3>
      <ProgressBar label="Rows handled" tone={tone} value={importProcessingPercent(progress)} />
      <output aria-live="polite" className="block text-sm text-foreground">
        {statusText(state, progress, note)}
      </output>
      {state === 'running' || state === 'stopping' ? (
        <Button disabled={state === 'stopping'} onClick={onStop} type="button" variant="outline">
          {state === 'stopping' ? 'Stopping...' : 'Stop processing'}
        </Button>
      ) : (state === 'stopped' || state === 'failed') && onResume ? (
        <Button disabled={!canResume} onClick={onResume} ref={resumeRef} type="button">
          Resume processing
        </Button>
      ) : null}
    </section>
  )
}
