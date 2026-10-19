'use client'

import type { ActivityEscalation, ActivityEscalationStatus } from '@pathways/shared'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type EscalationStep, activityEscalationsClient } from '@/lib/api/activity-escalations'
import { PathwaysClientError } from '@/lib/api/core/request'
import type { Activity } from '@/types/pathways'

import { formatDate } from '../activities.utils'

const statusLabel: Record<ActivityEscalationStatus, string> = {
  OPEN: 'Open',
  FORWARDED: 'Forwarded to program',
  RESOLVED: 'Resolved',
}
const statusTone = (status: ActivityEscalationStatus) =>
  status === 'RESOLVED' ? 'success' : 'warning'

const stepLabel: Record<EscalationStep, string> = {
  forward: 'Forward',
  resolve: 'Resolve',
  'program-resolve': 'Resolve',
}
const stepPast: Record<EscalationStep, string> = {
  forward: 'forwarded',
  resolve: 'resolved',
  'program-resolve': 'resolved',
}

/** Project tier forwards or resolves open rows; program tier resolves forwarded rows; null is status only. */
export type EscalationTier = 'PROJECT' | 'PROGRAM' | null

export const ActivityEscalationPanel = ({
  activity,
  tier,
  userId,
  focus = false,
  refreshKey = 0,
}: {
  activity: Activity
  tier: EscalationTier
  userId?: string
  focus?: boolean
  refreshKey?: number
}) => {
  const [rows, setRows] = useState<ActivityEscalation[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<EscalationStep | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(
        await activityEscalationsClient.listActivityEscalations(activity.projectId, activity.id),
      )
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [activity.projectId, activity.id])

  useEffect(() => {
    void refreshKey
    void load()
  }, [load, refreshKey])

  // A dashboard link scrolls to the loaded escalations and focuses the note.
  const sectionRef = useRef<HTMLElement>(null)
  const loaded = rows.length > 0
  useEffect(() => {
    if (!focus || !loaded) return
    sectionRef.current?.scrollIntoView({ block: 'center' })
    sectionRef.current
      ?.querySelector<HTMLTextAreaElement>('textarea')
      ?.focus({ preventScroll: true })
  }, [focus, loaded])

  if (!rows.length && !loadError) return null
  const latest = rows[0]
  const steps: EscalationStep[] = !latest
    ? []
    : tier === 'PROJECT' && latest.status === 'OPEN'
      ? latest.raisedBy.id === userId
        ? ['forward']
        : ['resolve', 'forward']
      : tier === 'PROGRAM' &&
          latest.status === 'FORWARDED' &&
          latest.raisedBy.id !== userId &&
          latest.forwardedBy?.id !== userId
        ? ['program-resolve']
        : []

  const act = async (step: EscalationStep) => {
    if (busy) return
    const trimmed = note.trim()
    if (trimmed.length < 10 || trimmed.length > 2000) {
      setError('Enter a note of 10 to 2000 characters.')
      return
    }
    setBusy(step)
    setError('')
    try {
      await activityEscalationsClient.stepActivityEscalation(
        activity.projectId,
        activity.id,
        latest.id,
        step,
        { note: trimmed, expectedUpdatedAt: latest.updatedAt },
      )
      toast.success(`Escalation ${stepPast[step]}.`)
      setNote('')
      await load()
    } catch (caught) {
      const conflict = caught instanceof PathwaysClientError && caught.status === 409
      if (conflict) await load()
      setError(
        conflict
          ? 'This escalation changed and was reloaded; review it and decide again.'
          : caught instanceof Error
            ? caught.message
            : 'The escalation could not be updated.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="Escalations" ref={sectionRef} className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">Escalations</h3>
      {rows.map((row) => (
        <div className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0" key={row.id}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(row.status)}>{statusLabel[row.status]}</StatusBadge>
            {row.resolutionLevel ? (
              <span className="text-xs text-muted-foreground">
                {row.resolutionLevel === 'PROGRAM' ? 'Program level' : 'Project level'}
              </span>
            ) : null}
          </div>
          <p className="text-sm leading-6">{row.reason}</p>
          <p className="text-xs text-muted-foreground">
            Raised by {row.raisedBy.name} on {formatDate(row.raisedAt)}
          </p>
          {row.forwardNote && row.forwardedBy ? (
            <p className="text-sm text-muted-foreground">
              Forwarded by {row.forwardedBy.name}: {row.forwardNote}
            </p>
          ) : null}
          {row.resolutionNote && row.resolvedBy ? (
            <p className="text-sm text-muted-foreground">
              Resolved by {row.resolvedBy.name}: {row.resolutionNote}
            </p>
          ) : null}
        </div>
      ))}
      {steps.length ? (
        <div className="space-y-2">
          <Label htmlFor="escalation-note">Note</Label>
          <Textarea
            aria-describedby="escalation-note-hint"
            aria-invalid={error ? true : undefined}
            disabled={busy !== null}
            id="escalation-note"
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <p className="text-xs text-muted-foreground" id="escalation-note-hint">
            Do not include beneficiary names or contact details.
          </p>
          <div className="flex flex-wrap gap-2">
            {steps.map((step, index) => (
              <Button
                className="gap-2"
                disabled={busy !== null}
                key={step}
                onClick={() => void act(step)}
                type="button"
                variant={index === 0 ? 'default' : 'outline'}
              >
                {busy === step ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {stepLabel[step]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {loadError && !rows.length ? (
        <p className="text-sm text-muted-foreground" role="alert">
          Escalations could not be loaded.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
