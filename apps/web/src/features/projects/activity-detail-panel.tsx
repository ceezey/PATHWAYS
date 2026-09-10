'use client'

import { approveProgress } from '@/lib/demo-state/projects'
import { getDemoState } from '@/lib/demo-state/store'
import { CheckCircle2, FileText, Pencil, RotateCcw, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'

import { ProgressBar, SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { Activity, Indicator } from '@/types/pathways'

import { ActivityStatusControl } from './activity-status-control'
import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'

const indicatorLabel = (indicatorIds: string[], indicators: Indicator[]) =>
  indicatorIds
    .map((indicatorId) => {
      const indicator = indicators.find((item) => item.id === indicatorId)
      return indicator ? `${indicator.code}: ${indicator.label}` : indicatorId
    })
    .join(', ')

const proofStatus = (activity: Activity) => {
  if (activity.submittedProof.length === 0) {
    return 'No proof submitted yet'
  }

  const latestProof = activity.submittedProof.at(-1)
  return `${latestProof?.status ?? 'Submitted'} - ${latestProof?.fileName ?? 'proof record'}`
}

export const ActivityDetailContent = ({
  activity,
  indicators,
  onEdit,
  onStatusChanged,
  onSubmitProof,
  canEdit,
  canChangeStatus,
  canReview,
  canSubmitProof,
}: {
  activity: Activity
  indicators: Indicator[]
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
  canEdit: boolean
  canChangeStatus: boolean
  canReview: boolean
  canSubmitProof: boolean
  onStatusChanged: (activity: Activity) => void
}) => (
  <div className="space-y-5">
    <div className="flex flex-wrap gap-2">
      {canChangeStatus ? (
        <ActivityStatusControl
          activity={activity}
          controlId={`activity-status-detail-${activity.id}`}
          onUpdated={onStatusChanged}
        />
      ) : (
        <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
      )}
    </div>
    <p className="text-sm leading-6 text-muted-foreground">{activity.description}</p>
    <ProgressBar
      label="Activity progress"
      tone={activity.status === 'Overdue' ? 'danger' : activity.progress >= 80 ? 'success' : 'info'}
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
        <dd className="mt-1 font-medium text-foreground">{activity.assignedTo.join(', ')}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted-foreground">Connected indicators</dt>
        <dd className="mt-1 font-medium text-foreground">
          {indicatorLabel(activity.indicatorIds, indicators)}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted-foreground">Journey stage reference</dt>
        <dd className="mt-1 font-medium text-foreground">{activity.journeyStageId}</dd>
      </div>
    </dl>
    <div className="rounded-sm border border-border bg-surface-subtle p-4">
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
            <li key={proof.id} className="break-all rounded-sm bg-background px-3 py-2">
              {proof.fileName} - {proof.status}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
    {activity.updateNotes.length > 0 ? (
      <div className="rounded-sm border border-border bg-surface-subtle p-4">
        <p className="text-sm font-medium text-foreground">Update history</p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {activity.updateNotes.map((update) => (
            <li key={update.id} className="rounded-sm bg-background px-3 py-2">
              {update.progress}% - {update.note}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    <div className="grid gap-2 sm:grid-cols-2">
      {canEdit ? (
        <Button className="gap-2" onClick={() => onEdit(activity)} type="button" variant="outline">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
      ) : null}
      {canSubmitProof ? (
        <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          Submit Update & Proof
        </Button>
      ) : null}
      {canReview ? (
        <>
          <Button
            className="gap-2"
            onClick={() => {
              try {
                approveProgress(activity.id, true)
                const saved = getDemoState().activities.find((item) => item.id === activity.id)
                if (saved) onStatusChanged(saved)
                toast.success('Progress approved and activity state updated.')
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Progress approval failed.')
              }
            }}
            type="button"
            variant="outline"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Approve progress
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              const reason = window.prompt('Enter the correction reason for the Project Officer:')
              if (reason === null) return
              try {
                approveProgress(activity.id, false, reason)
                const saved = getDemoState().activities.find((item) => item.id === activity.id)
                if (saved) onStatusChanged(saved)
                toast.success('Progress returned for correction with a reason.')
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'Progress could not be returned.',
                )
              }
            }}
            type="button"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Return for correction
          </Button>
        </>
      ) : null}
    </div>
  </div>
)

export const ActivityDetailPanel = ({
  activity,
  indicators,
  open,
  onEdit,
  onOpenChange,
  onStatusChanged,
  onSubmitProof,
  canEdit,
  canChangeStatus,
  canReview,
  canSubmitProof,
}: {
  activity: Activity | null
  indicators: Indicator[]
  open: boolean
  onEdit: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
  canEdit: boolean
  canChangeStatus: boolean
  canReview: boolean
  canSubmitProof: boolean
  onStatusChanged: (activity: Activity) => void
}) => (
  <Sheet onOpenChange={onOpenChange} open={open}>
    {activity ? (
      <SidePanel title={activity.title} description={`${activity.status} activity detail`}>
        <ActivityDetailContent
          activity={activity}
          canChangeStatus={canChangeStatus}
          canEdit={canEdit}
          canReview={canReview}
          canSubmitProof={canSubmitProof}
          indicators={indicators}
          onEdit={onEdit}
          onSubmitProof={onSubmitProof}
          onStatusChanged={onStatusChanged}
        />
      </SidePanel>
    ) : null}
  </Sheet>
)
