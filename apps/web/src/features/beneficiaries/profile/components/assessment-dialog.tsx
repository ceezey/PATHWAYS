'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { assessmentTypeLabel, formatDate } from '../../beneficiaries.utils'
import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'
import { SummaryRow } from './summary-row'

export const AssessmentDialog = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'assessmentOpen'
    | 'setAssessmentOpen'
    | 'orderedAssessments'
    | 'assessmentStageLabel'
    | 'assessmentChange'
  >
}) => {
  const {
    assessmentOpen,
    setAssessmentOpen,
    orderedAssessments,
    assessmentStageLabel,
    assessmentChange,
  } = detail
  return (
    <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assessment results</DialogTitle>
          <DialogDescription>Pre-test and post-test results for this enrollment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {orderedAssessments.map((item) => (
            <div className="rounded-lg border border-border bg-surface-subtle p-4" key={item.id}>
              <p className="text-sm text-muted-foreground">
                {assessmentTypeLabel[item.type]}, {assessmentStageLabel(item.stageId)},{' '}
                {formatDate(item.assessedAt)}
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {item.score} / {item.maximumScore}
              </p>
            </div>
          ))}
          {assessmentChange !== null ? (
            <SummaryRow
              label="Change from pre-test to post-test"
              value={`${assessmentChange > 0 ? '+' : ''}${assessmentChange}`}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
