'use client'
import { SourceMutationRecovery } from './source-mutation-recovery'

import { DialogShell, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { pathwaysClient } from '@/lib/services/pathways-client'
import {
  SourceMutationRecoveryError,
  isSourceReplay,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import type { Activity, ActivityProof } from '@/types/pathways'
import { useEffect, useRef, useState } from 'react'
import { ActivityProofFiles } from './activity-proof-files'
import { PrivateProofInspection } from './private-proof-inspection'

type Props = {
  activity: Activity
  mode: 'validate' | 'decide'
  open: boolean
  proof: ActivityProof | null
  onOpenChange: (open: boolean) => void
  onUpdated: (activity: Activity) => void
}
// Show the server's own reason when it gave one (a 403 or 409 explains itself, for example that
// the update is no longer awaiting review). Only a failure with no usable reason keeps the
// generic "could not be confirmed" wording, because then the outcome really is unknown.
function reviewFailureMessage(caught: unknown) {
  if (caught instanceof SourceMutationRecoveryError && caught.message) return caught.message
  // PathwaysClientError carries the HTTP status; matched by shape so the check does not depend
  // on which module instance raised it.
  const failure = caught as { name?: unknown; message?: unknown; status?: unknown } | null
  if (
    failure?.name === 'PathwaysClientError' &&
    typeof failure.message === 'string' &&
    failure.message &&
    (failure.status === 400 ||
      failure.status === 403 ||
      failure.status === 409 ||
      failure.status === 422)
  )
    return failure.status === 409
      ? `${failure.message} Reload the activity to see its current state.`
      : failure.message
  return 'The review could not be confirmed. Reload the activity before trying again.'
}

export function ActivityProofReviewDialog(props: Props) {
  const { profile, access } = useCurrentRole()
  const { session } = useSession()
  const enabled =
    props.open &&
    props.mode === 'validate' &&
    props.proof?.status === 'Submitted' &&
    access === 'ready' &&
    session?.user.id === profile?.id &&
    profile?.roles[0] === 'MONITORING_AND_EVALUATION_OFFICER'
  const owner = useSensitiveDraftOwner(
    profile,
    'activity-update-review',
    'evidence.review',
    props.activity.projectId,
    JSON.stringify([props.activity.id, props.proof?.updateId, props.proof?.updateUpdatedAt]),
    enabled,
  )
  return owner && props.proof ? (
    <OwnedReview
      key={`${owner.generation}:${owner.key}`}
      {...props}
      owner={owner}
      proof={props.proof}
    />
  ) : null
}
function OwnedReview({
  activity,
  open,
  proof,
  onOpenChange,
  onUpdated,
  owner,
}: Props & {
  proof: ActivityProof
  owner: SensitiveDraftOwner
}) {
  const { profile } = useCurrentRole()
  const mutationContext = useSourceMutationContext(
    profile,
    'evidence.review',
    activity.projectId,
    JSON.stringify([proof.updateId, proof.updateUpdatedAt]),
    open,
  )
  const [decision, setDecision] = useState<'APPROVE' | 'RETURN'>('APPROVE')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = () => mounted.current && owner.isCurrent()
  const update = activity.updateNotes.find(
    (entry) => entry.id === proof.updateId && entry.status === 'Submitted',
  )
  const ready = Boolean(update && update.updatedAt === proof.updateUpdatedAt)
  const progressOnly = update?.kind === 'progress'
  const submit = async () => {
    if (!current() || !mutationContext?.isCurrent() || pending.current || !ready) return
    if (!reason.trim() || reason.trim().length > 1000) {
      setNotice('Enter a review reason using 1 to 1000 characters.')
      return
    }
    pending.current = true
    setBusy(true)
    setNotice('')
    try {
      const updated = await pathwaysClient.reviewActivityUpdate(
        activity.projectId,
        activity.id,
        proof.updateId,
        decision,
        reason.trim(),
        proof.updateUpdatedAt,
        mutationContext,
      )
      if (!current() || !mutationContext.isCurrent()) return
      const record = isSourceReplay(updated)
        ? await pathwaysClient.getActivity(activity.projectId, activity.id)
        : updated
      if (!current() || !mutationContext.isCurrent()) return
      if (isSourceReplay(updated))
        sourceMutationTickets.finishAcknowledgement(mutationContext, updated.requestId)
      onUpdated(record)
      if (current()) onOpenChange(false)
    } catch (caught) {
      if (current()) setNotice(reviewFailureMessage(caught))
    } finally {
      pending.current = false
      if (current()) setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy && current()) onOpenChange(next)
      }}
    >
      <DialogShell
        title="Review activity update"
        description="An assigned M&E reviewer approves or returns this exact pending update."
      >
        <SourceMutationRecovery
          context={mutationContext}
          prefix={`/projects/${activity.projectId}/activities/${activity.id}/updates/${proof.updateId}/review`}
          onRecovered={async () => {
            const record = await pathwaysClient.getActivity(activity.projectId, activity.id)
            return () => {
              onUpdated(record)
              onOpenChange(false)
            }
          }}
        />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{activity.title}</p>
              <p className="text-sm">Submitted progress: {update?.progress ?? 'Unavailable'}%</p>
            </div>
            <StatusBadge tone="warning">Submitted</StatusBadge>
          </div>
          {progressOnly ? (
            <p className="rounded-sm border border-border bg-surface-subtle p-3 text-sm">
              Progress note without proof files: {update?.note}
            </p>
          ) : (
            <ActivityProofFiles proof={proof} />
          )}
          {ready && !progressOnly && (
            <PrivateProofInspection
              projectId={activity.projectId}
              activityId={activity.id}
              updateId={proof.updateId}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {progressOnly
              ? 'Approval updates the recorded progress only. It does not verify proof or complete the activity.'
              : 'Approval preserves submitted progress. The activity completes only when an approved update reaches 100%.'}
          </p>
          <div className="space-y-2">
            <Label htmlFor="activity-proof-decision">Review decision</Label>
            <Select
              disabled={busy || !ready}
              value={decision}
              onValueChange={(value) => {
                if (current() && !pending.current && (value === 'APPROVE' || value === 'RETURN'))
                  setDecision(value)
              }}
            >
              <SelectTrigger id="activity-proof-decision" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVE">Approve update</SelectItem>
                <SelectItem value="RETURN">Return for revision</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-proof-reason">Review reason</Label>
            <Textarea
              id="activity-proof-reason"
              maxLength={1000}
              required
              aria-required="true"
              disabled={busy || !ready}
              value={reason}
              onChange={(event) => {
                if (current() && !pending.current) setReason(event.target.value)
              }}
            />
          </div>
          {!ready && <p role="alert">This update changed. Reload the activity before reviewing.</p>}
          {notice && (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !ready || !reason.trim()}
              onClick={() => void submit()}
            >
              {busy
                ? 'Saving review...'
                : decision === 'APPROVE'
                  ? 'Approve update'
                  : 'Return for revision'}
            </Button>
          </DialogFooter>
        </div>
      </DialogShell>
    </Dialog>
  )
}
