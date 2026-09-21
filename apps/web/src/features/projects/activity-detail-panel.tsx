'use client'

import { Download, FileText, Pencil, Play, UploadCloud } from 'lucide-react'

import { ProgressBar, SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { Activity, Indicator } from '@/types/pathways'

import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'

const indicatorLabel = (indicatorIds: string[], indicators: Indicator[]) =>
  indicatorIds
    .map((indicatorId) => {
      const indicator = indicators.find((item) => item.id === indicatorId)
      return indicator ? `${indicator.code}: ${indicator.label}` : indicatorId
    })
    .join(', ')

const proofStatus = (activity: Activity) => {
  if (activity.submittedProof.length === 0) return 'No proof submitted yet'
  const latestProof = activity.submittedProof.at(-1)
  return `${latestProof?.status ?? 'Submitted'} - ${latestProof?.fileName ?? 'proof record'}`
}

export const ActivityDetailContent = ({
  activity,
  indicators,
  onEdit,
  onSubmitProof,
  onStart,
  onReview,
  onDownloadProof,
  canEdit,
  canReview,
  canSubmitProof,
}: {
  activity: Activity
  indicators: Indicator[]
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
  onStart: (activity: Activity) => void
  onReview: (activity: Activity, decision: 'APPROVE' | 'RETURN') => void
  onDownloadProof: (activity: Activity, proofId: string, fileName: string) => void
  canEdit: boolean
  canReview: boolean
  canSubmitProof: boolean
}) => {
  const pendingUpdate = activity.updateNotes
    .slice()
    .reverse()
    .find((update) => update.status === 'Submitted')
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{activity.description}</p>
      <ProgressBar
        label="Activity progress"
        tone={
          activity.status === 'Overdue' ? 'danger' : activity.progress >= 80 ? 'success' : 'info'
        }
        value={activity.progress}
      />
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Dates</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(activity.startDate)} to {formatDate(activity.dueDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Beneficiaries reached</dt>
          <dd className="mt-1 font-medium text-foreground">
            {activity.beneficiariesReached} of {activity.targetBeneficiaries}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Allocated budget</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatCurrency(activity.budgetAllocation)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Logged budget</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatCurrency(activity.budgetLogged)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Assigned users</dt>
          <dd className="mt-1 font-medium text-foreground">
            {activity.assignedTo.join(', ') || 'None'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Connected indicators</dt>
          <dd className="mt-1 font-medium text-foreground">
            {indicatorLabel(activity.indicatorIds, indicators) || 'None'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Journey stage mappings</dt>
          <dd className="mt-1 font-medium text-foreground">
            {activity.journeyStageIds.length ? activity.journeyStageIds.join(', ') : 'Not mapped'}
          </dd>
        </div>
      </dl>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Submitted proof</p>
            <p className="mt-1 text-sm text-muted-foreground">{proofStatus(activity)}</p>
          </div>
        </div>
        {activity.submittedProof.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {activity.submittedProof.map((proof) => (
              <li
                key={proof.id}
                className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="break-all">
                  {proof.fileName} - {proof.status}
                </span>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => onDownloadProof(activity, proof.id, proof.fileName)}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {activity.updateNotes.length > 0 ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Update history</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {activity.updateNotes.map((update) => (
              <li key={update.id} className="rounded-md bg-muted/50 px-3 py-2">
                <p className="font-medium text-foreground">
                  {update.progress}% · {update.status}
                </p>
                <p className="mt-1">{update.note}</p>
                <p className="mt-1 text-xs">
                  Submitted by {update.submittedBy} ·{' '}
                  {new Date(update.submittedAt).toLocaleString()}
                </p>
                {update.reviewReason ? (
                  <p className="mt-1 text-xs">Review: {update.reviewReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {canEdit && activity.storedStatus === 'NOT_STARTED' ? (
          <Button className="gap-2" onClick={() => onStart(activity)} type="button">
            <Play className="h-4 w-4" aria-hidden="true" />
            Start Activity
          </Button>
        ) : null}
        {canEdit && ['NOT_STARTED', 'IN_PROGRESS'].includes(activity.storedStatus) ? (
          <Button
            className="gap-2"
            onClick={() => onEdit(activity)}
            type="button"
            variant="outline"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
        ) : null}
        {canSubmitProof && activity.storedStatus === 'IN_PROGRESS' ? (
          <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Submit Update & Proof
          </Button>
        ) : null}
        {canReview && activity.storedStatus === 'FOR_REVIEW' && pendingUpdate ? (
          <>
            <Button className="gap-2" onClick={() => onReview(activity, 'APPROVE')} type="button">
              Approve Update
            </Button>
            <Button
              className="gap-2"
              onClick={() => onReview(activity, 'RETURN')}
              type="button"
              variant="outline"
            >
              Return for Revision
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export const ActivityDetailPanel = ({
  activity,
  indicators,
  open,
  onEdit,
  onOpenChange,
  onSubmitProof,
  onStart,
  onReview,
  onDownloadProof,
  canEdit,
  canReview,
  canSubmitProof,
}: {
  activity: Activity | null
  indicators: Indicator[]
  open: boolean
  onEdit: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
  onStart: (activity: Activity) => void
  onReview: (activity: Activity, decision: 'APPROVE' | 'RETURN') => void
  onDownloadProof: (activity: Activity, proofId: string, fileName: string) => void
  canEdit: boolean
  canReview: boolean
  canSubmitProof: boolean
}) => (
  <Sheet onOpenChange={onOpenChange} open={open}>
    {activity ? (
      <SidePanel title={activity.title} description={`${activity.status} activity detail`}>
        <ActivityDetailContent
          activity={activity}
          canEdit={canEdit}
          canReview={canReview}
          canSubmitProof={canSubmitProof}
          indicators={indicators}
          onDownloadProof={onDownloadProof}
          onEdit={onEdit}
          onReview={onReview}
          onStart={onStart}
          onSubmitProof={onSubmitProof}
        />
      </SidePanel>
    ) : null}
  </Sheet>
)
