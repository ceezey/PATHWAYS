'use client'

import { Button } from '@/components/ui/button'
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
  type DecisionOutcome,
  type HumanAlert,
  type HumanRecommendation,
  type OutcomePreview,
  decisionOutcomes,
  reviewSchema,
} from '@/features/analytics/rules-human-contract'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useEffect, useRef, useState } from 'react'

type Props = {
  kind: 'alert' | 'recommendation'
  item: HumanAlert | HumanRecommendation
  mode: 'review' | 'outcome' | 'resolve' | 'dismiss'
  linkedAlert?: HumanAlert
  onCommitted: () => void
  onCancel: () => void
}
export function HumanReviewAction(props: Props) {
  const { profile, access } = useCurrentRole()
  const permission =
    props.kind === 'alert'
      ? props.mode === 'review'
        ? 'alerts.review'
        : 'alerts.outcome.record'
      : props.mode === 'review'
        ? 'recommendations.review'
        : 'recommendations.outcome.record'
  const owner = useSensitiveDraftOwner(
    profile,
    'human-review',
    permission,
    props.item.projectId,
    `${props.kind}:${props.item.id}:${props.item.revision}:${props.linkedAlert?.revision ?? ''}:${props.mode}`,
    access === 'ready',
  )
  if (!owner) return <output>Current access is being verified.</output>
  return <OwnedAction key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
}
function OwnedAction({
  kind,
  item,
  mode,
  linkedAlert,
  onCommitted,
  onCancel,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const { profile } = useCurrentRole()
  const currentProfile = useRef(profile)
  currentProfile.current = profile
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = () => mounted.current && owner.isCurrent()
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<DecisionOutcome | ''>('')
  const [preview, setPreview] = useState<OutcomePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const captured = useRef<{
    expectedRevision: string
    note: string
    clientOperationId: string
    outcome?: DecisionOutcome
    expectedAlertRevision?: string
  } | null>(null)
  const confirmationId = useRef<string | null>(null)
  const needsAlert =
    kind === 'recommendation' && (outcome === 'ACCEPT' || outcome === 'PARTIALLY_ACCEPT')
  const canWriteAlert = Boolean(
    linkedAlert && principalHasAtomicPermission(profile, 'alerts.outcome.record'),
  )
  const currentWriteSet = () =>
    isCurrent() &&
    (!needsAlert ||
      Boolean(
        linkedAlert &&
          principalHasAtomicPermission(currentProfile.current, 'alerts.outcome.record'),
      ))
  const submit = async () => {
    if (inFlight.current || !currentWriteSet()) return
    const parsed = reviewSchema.safeParse({
      expectedRevision: item.revision,
      note,
      clientOperationId: captured.current?.clientOperationId ?? crypto.randomUUID(),
    })
    if (!parsed.success || (mode === 'outcome' && !outcome)) {
      setNotice('Enter a note and choose an outcome when required.')
      return
    }
    if (!captured.current)
      captured.current = {
        ...parsed.data,
        ...(mode === 'outcome' && outcome ? { outcome } : {}),
        ...(needsAlert && linkedAlert ? { expectedAlertRevision: linkedAlert.revision } : {}),
      }
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      if (mode === 'review') {
        if (kind === 'alert') await rulesHumanClient.reviewAlert(item.id, captured.current)
        else await rulesHumanClient.reviewRecommendation(item.id, captured.current)
      } else if (mode === 'resolve' || mode === 'dismiss') {
        await rulesHumanClient.dispositionAlert(item.id, {
          ...captured.current,
          action: mode === 'resolve' ? 'RESOLVE' : 'DISMISS',
        })
      } else {
        if (!captured.current.outcome) return
        const body = { ...captured.current, outcome: captured.current.outcome }
        const value =
          kind === 'alert'
            ? await rulesHumanClient.previewAlert(item.id, body)
            : await rulesHumanClient.previewRecommendation(item.id, body)
        if (!currentWriteSet()) return
        const expectedKind =
          kind === 'alert'
            ? 'ALERT_OUTCOME'
            : needsAlert
              ? 'COMBINED_OUTCOME'
              : 'RECOMMENDATION_OUTCOME'
        if (
          value.operationKind !== expectedKind ||
          value.outcome !== body.outcome ||
          (kind === 'alert'
            ? value.alertRevision !== item.revision
            : value.recommendationRevision !== item.revision) ||
          (needsAlert && value.alertRevision !== linkedAlert?.revision) ||
          (!needsAlert && kind === 'recommendation' && value.alertRevision !== null)
        )
          throw new PathwaysClientError('The preview could not be validated.', 'network')
        confirmationId.current = crypto.randomUUID()
        setPreview(value)
        return
      }
      if (currentWriteSet()) {
        captured.current = null
        setNote('')
        setNotice('Recorded.')
        onCommitted()
      }
    } catch (error) {
      if (isCurrent())
        setNotice(
          error instanceof PathwaysClientError && error.status === 409
            ? 'This record changed. Reload it before another decision.'
            : 'A response was not confirmed. Retry this same request or reload the record.',
        )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  const confirm = async () => {
    if (!preview || !confirmationId.current || inFlight.current || !currentWriteSet()) return
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      setNotice('The preview expired. Request a new preview.')
      setPreview(null)
      confirmationId.current = null
      if (captured.current)
        captured.current = { ...captured.current, clientOperationId: crypto.randomUUID() }
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice('')
    try {
      const input = { previewId: preview.previewId, clientOperationId: confirmationId.current }
      const result =
        kind === 'alert'
          ? await rulesHumanClient.confirmAlert(item.id, input)
          : await rulesHumanClient.confirmRecommendation(item.id, input)
      if (!currentWriteSet()) return
      if (
        result.outcome !== preview.outcome ||
        (kind === 'alert'
          ? result.alertId !== item.id
          : result.recommendationId !== item.id ||
            result.alertId !== ('alertId' in item ? item.alertId : null))
      )
        throw new PathwaysClientError('The confirmation could not be validated.', 'network')
      captured.current = null
      setNote('')
      setPreview(null)
      onCommitted()
    } catch (error) {
      if (isCurrent())
        setNotice(
          error instanceof PathwaysClientError && error.status === 409
            ? 'The preview changed or expired. Reload the record before another decision.'
            : 'A response was not confirmed. Retry this same confirmation or reload the record.',
        )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  return (
    <section
      className="space-y-4 rounded-sm border border-border bg-background p-4"
      aria-label="Human review action"
    >
      {preview ? (
        <div className="space-y-3">
          <h3 className="font-semibold">Confirm outcome</h3>
          <p>{preview.message}</p>
          <p>{preview.recipientCount} recipients will receive an in-app notification.</p>
          <p className="text-sm text-muted-foreground">
            Preview expires {new Date(preview.expiresAt).toLocaleString()}.
          </p>
          <Button
            disabled={busy || !currentWriteSet()}
            onClick={() => void confirm()}
            type="button"
          >
            {busy ? 'Recording...' : 'Confirm and record outcome'}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {mode === 'outcome' ? (
            <div className="space-y-2">
              <Label htmlFor={`outcome-${item.id}`}>Outcome</Label>
              <Select
                disabled={busy || locked}
                required
                value={outcome}
                onValueChange={(value) => setOutcome(value as DecisionOutcome)}
              >
                <SelectTrigger aria-label="Outcome" id={`outcome-${item.id}`}>
                  <SelectValue placeholder="Choose an outcome" />
                </SelectTrigger>
                <SelectContent>
                  {decisionOutcomes.map((value) => (
                    <SelectItem
                      key={value}
                      value={value}
                      disabled={
                        kind === 'recommendation' &&
                        ['ACCEPT', 'PARTIALLY_ACCEPT'].includes(value) &&
                        !canWriteAlert
                      }
                    >
                      {value.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`note-${item.id}`}>Decision note</Label>
            <Textarea
              id={`note-${item.id}`}
              value={note}
              required
              maxLength={2000}
              disabled={busy || locked}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Notes are stored privately and are not shown in alert or recommendation history.
          </p>
          {kind === 'recommendation' && mode === 'outcome' && !canWriteAlert ? (
            <p className="text-sm">
              Accepting this recommendation requires current access to record an outcome on its
              linked alert.
            </p>
          ) : null}
          <Button disabled={busy || (needsAlert && !canWriteAlert)} type="submit">
            {busy
              ? 'Submitting...'
              : mode === 'outcome'
                ? 'Preview outcome'
                : mode === 'review'
                  ? 'Mark reviewed'
                  : mode === 'resolve'
                    ? 'Resolve alert'
                    : 'Dismiss alert'}
          </Button>
        </form>
      )}
      {notice ? <output className="block text-sm">{notice}</output> : null}
      <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
        Close
      </Button>
    </section>
  )
}
