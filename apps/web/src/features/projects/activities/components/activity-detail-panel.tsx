'use client'

import { useEffect, useRef } from 'react'

import { SidePanel } from '@/components/pathways'
import { AsyncState } from '@/components/pathways/async-state'
import { Sheet } from '@/components/ui/sheet'
import type {
  Activity,
  Indicator,
  JourneyStageConfig,
  ProjectIndicator,
  ProjectTeamMember,
} from '@/types/pathways'

import type { ExpenseBudgetReference } from '../../activity-expense-dialog'
import type { PendingExpense } from '../../activity-expense-review-dialog'
import { ActivityDetailContent } from './activity-detail-content'
import type { ActivityExpenseEntry } from './activity-detail-sections'

export const ActivityDetailPanel = ({
  activity,
  activityExpenses = [],
  canReadExpenses = false,
  budgetReferences = [],
  canDecideProof,
  canDecideExtension = false,
  focusExtension = false,
  canEdit,
  canLogExpense,
  canReadBudgets = false,
  loading = false,
  canRecordProgress = false,
  canSubmitProof,
  canRequestExtension,
  canOpenProof = false,
  canValidateExpense,
  canValidateProof,
  indicatorRows = [],
  indicators,
  journeyStages,
  onActivityChanged,
  onEdit,
  onExpensesChanged = () => {},
  onOpenChange,
  onSubmitProof,
  open,
  pendingExpenses = [],
  projectTeam = [],
  requestedExpenseId,
  requestedProofId,
}: {
  activity: Activity | null
  activityExpenses?: ActivityExpenseEntry[]
  canReadExpenses?: boolean
  budgetReferences?: ExpenseBudgetReference[]
  canDecideProof: boolean
  canDecideExtension?: boolean
  focusExtension?: boolean
  canEdit: boolean
  canLogExpense: boolean
  canReadBudgets?: boolean
  loading?: boolean
  canRecordProgress?: boolean
  canSubmitProof: boolean
  canRequestExtension: boolean
  canOpenProof?: boolean
  canValidateExpense: boolean
  canValidateProof: boolean
  indicatorRows?: ProjectIndicator[]
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  onActivityChanged: (activity: Activity) => void
  onEdit: (activity: Activity) => void
  onExpensesChanged?: () => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
  open: boolean
  pendingExpenses?: PendingExpense[]
  projectTeam?: ProjectTeamMember[]
  requestedExpenseId?: string
  requestedProofId?: string
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedActivityId = activity?.id

  useEffect(() => {
    if (!open || !requestedProofId || !loadedActivityId) return
    const frame = window.requestAnimationFrame(() => {
      document
      const target =
        document.getElementById(`activity-proof-${requestedProofId}`) ??
        document.querySelector(`[data-update-id="${CSS.escape(requestedProofId)}"]`)
      target?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, requestedProofId, loadedActivityId])

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {activity ? (
        <SidePanel
          containedScroll
          description={`${activity.status} activity detail`}
          onOverlayWheel={(event) => {
            const scrollArea = scrollRef.current
            if (!scrollArea || scrollArea.scrollHeight <= scrollArea.clientHeight) return
            event.preventDefault()
            scrollArea.scrollBy({ top: event.deltaY, behavior: 'auto' })
          }}
          scrollRef={scrollRef}
          title={activity.title}
        >
          <ActivityDetailContent
            activity={activity}
            activityExpenses={activityExpenses}
            canReadExpenses={canReadExpenses}
            budgetReferences={budgetReferences}
            canDecideProof={canDecideProof}
            canDecideExtension={canDecideExtension}
            focusExtension={focusExtension}
            canEdit={canEdit}
            canLogExpense={canLogExpense}
            canReadBudgets={canReadBudgets}
            canRecordProgress={canRecordProgress}
            canSubmitProof={canSubmitProof}
            canRequestExtension={canRequestExtension}
            canOpenProof={canOpenProof}
            canValidateExpense={canValidateExpense}
            canValidateProof={canValidateProof}
            indicatorRows={indicatorRows}
            indicators={indicators}
            journeyStages={journeyStages}
            onActivityChanged={onActivityChanged}
            onEdit={onEdit}
            onExpensesChanged={onExpensesChanged}
            onSubmitProof={onSubmitProof}
            pendingExpenses={pendingExpenses}
            projectTeam={projectTeam}
            requestedExpenseId={requestedExpenseId}
            requestedProofId={requestedProofId}
          />
        </SidePanel>
      ) : loading ? (
        <SidePanel description="Loading the current activity record." title="Activity detail">
          <AsyncState
            description="Fetching the activity record, proofs and expenses."
            status="loading"
            title="Loading activity"
          />
        </SidePanel>
      ) : null}
    </Sheet>
  )
}
