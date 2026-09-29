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
 * Focus is restored in both directions across each control that removes the
 * currently focused button: Stop (or a failure) hands focus to Resume once it is
 * enabled, and Resume hands focus back to Stop. Reaching "complete" unmounts
 * whichever control was focused, so focus that was inside the panel moves to the
 * panel heading instead of falling to the document body. `focusOnMount` moves
 * focus to the panel heading when it first appears, for flows where the control
 * that started processing goes away.
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
  const stopRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const previousState = useRef(state)
  const pendingFocus = useRef<'resume' | 'stop' | 'heading' | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on mount only.
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [])

  // A transition is detected here, during render, rather than in an effect: once a
  // control that held focus is unmounted, the browser forces focus to the document
  // body as part of that same commit, before any effect for this render can run. By
  // the time render runs, `sectionRef.current` and `document.activeElement` still
  // reflect the previous commit, so this is the last correct point to ask "was focus
  // inside the panel". The actual `.focus()` call is deferred to the effect below,
  // since imperative focus must not run during render.
  if (previousState.current !== state) {
    const previousValue = previousState.current
    const wasRunning = previousValue === 'running' || previousValue === 'stopping'
    const wasStoppedOrFailed = previousValue === 'stopped' || previousValue === 'failed'
    if (wasRunning && (state === 'stopped' || state === 'failed')) {
      pendingFocus.current = 'resume'
    } else if (wasStoppedOrFailed && state === 'running') {
      pendingFocus.current = 'stop'
    } else if (wasRunning && state === 'complete') {
      const hadFocus = Boolean(sectionRef.current?.contains(document.activeElement))
      if (hadFocus) pendingFocus.current = 'heading'
    }
    previousState.current = state
  }

  useEffect(() => {
    if (pendingFocus.current === 'resume' && canResume && resumeRef.current) {
      pendingFocus.current = null
      resumeRef.current.focus()
    } else if (pendingFocus.current === 'stop' && stopRef.current) {
      pendingFocus.current = null
      stopRef.current.focus()
    } else if (pendingFocus.current === 'heading' && headingRef.current) {
      pendingFocus.current = null
      headingRef.current.focus()
    }
  })

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
      ref={sectionRef}
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
        <Button
          disabled={state === 'stopping'}
          onClick={onStop}
          ref={stopRef}
          type="button"
          variant="outline"
        >
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
