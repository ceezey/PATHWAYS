'use client'

import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
import {
  flagActivityProof,
  reviewValidatedActivityProof,
  validateActivityProof,
} from '@/lib/demo-state/projects'
import type { Activity, ActivityProof } from '@/types/pathways'

import { ActivityProofFiles } from './activity-proof-files'

export const ActivityProofReviewDialog = ({
  activity,
  mode,
  onOpenChange,
  onUpdated,
  open,
  proof,
}: {
  activity: Activity
  mode: 'validate' | 'decide'
  onOpenChange: (open: boolean) => void
  onUpdated: (activity: Activity) => void
  open: boolean
  proof: ActivityProof | null
}) => {
  const [reason, setReason] = useState('')
  const [validationDecision, setValidationDecision] = useState<'Validate' | 'Flag'>('Validate')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void proof?.id
    if (!open) return
    setReason('')
    setValidationDecision('Validate')
    setError('')
  }, [open, proof?.id])

  if (!proof) return null

  const version = proof.version ?? activity.submittedProof.indexOf(proof) + 1
  const progress = proof.progress ?? activity.progress
  const completesActivity = progress === 100

  const runDecision = (approved?: boolean) => {
    if (submitting) return
    setSubmitting(true)
    setError('')

    try {
      const updated =
        mode === 'validate'
          ? validationDecision === 'Validate'
            ? validateActivityProof(activity.id, proof.id)
            : flagActivityProof(activity.id, proof.id)
          : reviewValidatedActivityProof(activity.id, proof.id, Boolean(approved), reason)
      onUpdated(updated)
      toast.success(
        mode === 'validate'
          ? validationDecision === 'Validate'
            ? `Proof version ${version} validated.`
            : `Proof version ${version} flagged as insufficient.`
          : approved
            ? completesActivity
              ? `Proof version ${version} approved; activity completed.`
              : `Proof version ${version} approved; activity remains in progress.`
            : `Proof version ${version} returned for revision.`,
      )
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The proof decision could not be saved.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen)
      }}
      open={open}
    >
      <DialogShell
        title={mode === 'validate' ? 'Review & validate proof' : `Review proof version ${version}`}
        description={
          mode === 'validate'
            ? 'Review the submitted proof list, tag the exact version, then submit your review.'
            : 'Confirm the exact M&E-validated version before recording the next decision.'
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface-subtle p-4">
            <div>
              <p className="text-sm font-medium text-foreground">{activity.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">Submitted progress: {progress}%</p>
              {proof.beneficiariesReachedThisSession !== undefined ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Beneficiaries this session: {proof.beneficiariesReachedThisSession} · Proposed
                  total: {proof.beneficiariesReachedTotal}
                </p>
              ) : null}
            </div>
            <StatusBadge tone={proof.status === 'Validated' ? 'success' : 'warning'}>
              {proof.status}
            </StatusBadge>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Submitted proofs</p>
            <div className="mt-2">
              <ActivityProofFiles proof={proof} />
            </div>
          </div>
          {mode === 'validate' ? (
            <div className="space-y-2">
              <Label htmlFor="proof-validation-decision">Review decision</Label>
              <Select
                onValueChange={(value) => setValidationDecision(value as 'Validate' | 'Flag')}
                value={validationDecision}
              >
                <SelectTrigger id="proof-validation-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Validate">Validate</SelectItem>
                  <SelectItem value="Flag">Flag as insufficient</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <p className="text-sm font-medium text-foreground">Notes</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {proof.note || 'No note was recorded.'}
            </p>
          </div>
          {mode === 'decide' ? (
            <div className="space-y-2">
              <Label htmlFor="proof-return-reason">Return reason</Label>
              <Textarea
                className="min-h-24"
                id="proof-return-reason"
                onChange={(event) => {
                  setReason(event.target.value)
                  if (error) setError('')
                }}
                placeholder="Required only when returning this version for revision."
                value={reason}
              />
            </div>
          ) : null}
          {mode === 'decide' && progress !== 100 ? (
            <p className="rounded-sm border border-info/25 bg-info-subtle p-3 text-sm text-info">
              This validated version records {progress}% progress. Approval records this update and
              keeps the activity active; completion occurs only when an approved update reaches
              100%.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {mode === 'validate' ? (
              <Button
                className="gap-2"
                disabled={submitting}
                onClick={() => runDecision()}
                type="button"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                Submit review
              </Button>
            ) : (
              <>
                <Button
                  className="gap-2"
                  disabled={submitting || !reason.trim()}
                  onClick={() => runDecision(false)}
                  type="button"
                  variant="outline"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Return for revision
                </Button>
                <Button
                  className="gap-2"
                  disabled={submitting}
                  onClick={() => runDecision(true)}
                  type="button"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {completesActivity ? 'Approve & complete' : 'Approve update'}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogShell>
    </Dialog>
  )
}
