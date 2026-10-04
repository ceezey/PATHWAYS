'use client'

import type { ActivityExtension, ActivityExtensionStatus } from '@pathways/shared'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

import { formatDate } from './activity-utils'

const statusLabel: Record<ActivityExtensionStatus, string> = {
  PENDING: 'Awaiting verification',
  VERIFIED: 'Awaiting approval',
  RETURNED: 'Returned',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
}
const statusTone = (status: ActivityExtensionStatus) =>
  status === 'APPROVED'
    ? 'success'
    : status === 'PENDING' || status === 'VERIFIED'
      ? 'warning'
      : 'danger'

type Decision = 'VERIFY' | 'RETURN' | 'APPROVE' | 'DECLINE'
const decisionLabel: Record<Decision, string> = {
  VERIFY: 'Verify',
  RETURN: 'Return',
  APPROVE: 'Approve',
  DECLINE: 'Decline',
}
const decisionPast: Record<Decision, string> = {
  VERIFY: 'verified',
  RETURN: 'returned',
  APPROVE: 'approved',
  DECLINE: 'declined',
}

export const ActivityExtensionPanel = ({
  activity,
  canVerify,
  canDecide,
  refreshKey = 0,
  onDecided,
}: {
  activity: Activity
  canVerify: boolean
  canDecide: boolean
  refreshKey?: number
  onDecided: () => void
}) => {
  const [latest, setLatest] = useState<ActivityExtension | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Decision | null>(null)
  const [error, setError] = useState('')
  const [clientMutationId, setClientMutationId] = useState(() => crypto.randomUUID())

  const load = useCallback(async () => {
    try {
      const rows = await pathwaysClient.listActivityExtensions(activity.projectId, activity.id)
      setLatest(rows[0] ?? null)
    } catch {
      setLatest(null)
    }
  }, [activity.projectId, activity.id])

  useEffect(() => {
    void refreshKey
    void load()
  }, [load, refreshKey])

  if (!latest) return null
  const actions: Decision[] =
    latest.status === 'PENDING' && canVerify
      ? ['VERIFY', 'RETURN']
      : latest.status === 'VERIFIED' && canDecide
        ? ['APPROVE', 'DECLINE']
        : []
  const visibleNote =
    latest.status === 'RETURNED'
      ? latest.verificationNote
      : latest.status === 'DECLINED' || latest.status === 'APPROVED'
        ? latest.decisionNote
        : null

  const act = async (decision: Decision) => {
    if (busy) return
    const trimmed = note.trim()
    if (trimmed.length < 10 || trimmed.length > 2000) {
      setError('Enter a note of 10 to 2000 characters.')
      return
    }
    setBusy(decision)
    setError('')
    try {
      if (decision === 'VERIFY' || decision === 'RETURN') {
        await pathwaysClient.verifyActivityExtension(activity.projectId, activity.id, latest.id, {
          decision,
          note: trimmed,
          expectedUpdatedAt: latest.updatedAt,
        })
      } else {
        await pathwaysClient.decideActivityExtension(activity.projectId, activity.id, latest.id, {
          decision,
          note: trimmed,
          expectedUpdatedAt: latest.updatedAt,
          activityExpectedUpdatedAt: activity.updatedAt,
          clientMutationId,
        })
      }
      toast.success(`Extension ${decisionPast[decision]}.`)
      setNote('')
      setClientMutationId(crypto.randomUUID())
      await load()
      onDecided()
    } catch (caught) {
      setError(
        caught instanceof PathwaysClientError && caught.status === 409
          ? 'This request changed; reload before deciding.'
          : caught instanceof Error
            ? caught.message
            : 'The extension could not be updated.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="Extension request" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Extension request</h3>
        <StatusBadge tone={statusTone(latest.status)}>{statusLabel[latest.status]}</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        New end date {formatDate(latest.requestedEndDate)}, requested by {latest.requestedBy.name}.
      </p>
      <p className="text-sm leading-6">{latest.reason}</p>
      {visibleNote ? <p className="text-sm text-muted-foreground">Note: {visibleNote}</p> : null}
      {actions.length ? (
        <div className="space-y-2">
          <Label htmlFor="extension-review-note">Note</Label>
          <Textarea
            disabled={busy !== null}
            id="extension-review-note"
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <div className="flex flex-wrap gap-2">
            {actions.map((decision, index) => (
              <Button
                className="gap-2"
                disabled={busy !== null}
                key={decision}
                onClick={() => void act(decision)}
                type="button"
                variant={index === 0 ? 'default' : 'outline'}
              >
                {busy === decision ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {decisionLabel[decision]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
