'use client'

import { CheckCircle2, FileText, Pencil, RotateCcw, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'

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
  onSubmitProof,
}: {
  activity: Activity
  indicators: Indicator[]
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
}) => (
  <div className="space-y-5">
    <div className="flex flex-wrap gap-2">
      <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
      <StatusBadge tone="info">Prototype activity</StatusBadge>
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
        <dt className="text-muted-foreground">Journey-stage placeholder</dt>
        <dd className="mt-1 font-medium text-foreground">{activity.journeyStageId}</dd>
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
            <li key={proof.id} className="break-all rounded-md bg-muted/50 px-3 py-2">
              {proof.fileName} - {proof.status}
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
              {update.progress}% - {update.note}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    <div className="grid gap-2 sm:grid-cols-2">
      <Button className="gap-2" onClick={() => onEdit(activity)} type="button" variant="outline">
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit
      </Button>
      <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
        <UploadCloud className="h-4 w-4" aria-hidden="true" />
        Submit Update & Proof
      </Button>
      <Button
        className="gap-2"
        onClick={() =>
          toast.success('Approve complete is a Phase 4 prototype placeholder.', {
            description:
              'Final approval will be enforced after RBAC and backend review endpoints exist.',
          })
        }
        type="button"
        variant="outline"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Approve Complete
      </Button>
      <Button
        className="gap-2"
        onClick={() =>
          toast.info('Returned for revision in prototype view.', {
            description: 'This placeholder does not write to the backend.',
          })
        }
        type="button"
        variant="outline"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Return for Revision
      </Button>
    </div>
  </div>
)

export const ActivityDetailPanel = ({
  activity,
  indicators,
  open,
  onEdit,
  onOpenChange,
  onSubmitProof,
}: {
  activity: Activity | null
  indicators: Indicator[]
  open: boolean
  onEdit: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
}) => (
  <Sheet onOpenChange={onOpenChange} open={open}>
    {activity ? (
      <SidePanel title={activity.title} description={`${activity.status} activity detail`}>
        <ActivityDetailContent
          activity={activity}
          indicators={indicators}
          onEdit={onEdit}
          onSubmitProof={onSubmitProof}
        />
      </SidePanel>
    ) : null}
  </Sheet>
)
