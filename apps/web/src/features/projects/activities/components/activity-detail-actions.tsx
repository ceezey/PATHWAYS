import {
  BellRing,
  CalendarClock,
  Flag,
  Pencil,
  ReceiptText,
  TrendingUp,
  UploadCloud,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Activity } from '@/types/pathways'

export const ActivityDetailActions = ({
  activity,
  canLogExpense,
  canRaiseEscalation,
  canRequestExtension,
  onEdit,
  onSubmitProof,
  ownIncompleteProof,
  setExpenseOpen,
  setEscalationOpen,
  setExplainDelayOpen,
  setExtensionOpen,
  setProgressOpen,
  showEdit,
  showExplainDelay,
  showRecordProgress,
  showSubmitProof,
}: {
  activity: Activity
  canLogExpense: boolean
  canRaiseEscalation: boolean
  canRequestExtension: boolean
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
  ownIncompleteProof: boolean
  setExpenseOpen: (open: boolean) => void
  setEscalationOpen: (open: boolean) => void
  setExplainDelayOpen: (open: boolean) => void
  setExtensionOpen: (open: boolean) => void
  setProgressOpen: (open: boolean) => void
  showEdit: boolean
  showExplainDelay: boolean
  showRecordProgress: boolean
  showSubmitProof: boolean
}) => (
  <div className="sticky bottom-0 -mx-1 grid grid-cols-1 gap-2 border-t border-border bg-card/95 px-1 pb-1 pt-4 backdrop-blur">
    {showEdit ? (
      <Button className="gap-2" onClick={() => onEdit(activity)} type="button" variant="outline">
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit activity
      </Button>
    ) : null}
    {showSubmitProof && activity.status !== 'Completed' ? (
      <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
        <UploadCloud className="h-4 w-4" aria-hidden="true" />
        {ownIncompleteProof ? 'Resume proof upload' : 'Submit Update & Proof'}
      </Button>
    ) : null}
    {showRecordProgress && activity.storedStatus === 'IN_PROGRESS' ? (
      <Button
        className="gap-2"
        onClick={() => setProgressOpen(true)}
        type="button"
        variant="outline"
      >
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        Record progress
      </Button>
    ) : null}
    {showExplainDelay ? (
      <Button
        className="gap-2"
        onClick={() => setExplainDelayOpen(true)}
        type="button"
        variant="outline"
      >
        <BellRing className="h-4 w-4" aria-hidden="true" />
        Explain delay
      </Button>
    ) : null}
    {canLogExpense ? (
      <Button
        className="gap-2"
        onClick={() => setExpenseOpen(true)}
        type="button"
        variant="outline"
      >
        <ReceiptText className="h-4 w-4" aria-hidden="true" />
        Log expense
      </Button>
    ) : null}
    {canRequestExtension &&
    activity.status !== 'Completed' &&
    activity.storedStatus !== 'CANCELLED' ? (
      <Button
        className="gap-2"
        onClick={() => setExtensionOpen(true)}
        type="button"
        variant="outline"
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        Request an extension
      </Button>
    ) : null}
    {canRaiseEscalation &&
    activity.status !== 'Completed' &&
    activity.storedStatus !== 'CANCELLED' ? (
      <Button
        className="gap-2"
        onClick={() => setEscalationOpen(true)}
        type="button"
        variant="outline"
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        Raise escalation
      </Button>
    ) : null}
  </div>
)
