'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AsyncState, SidePanel } from '@/components/pathways'
import { Sheet } from '@/components/ui/sheet'
import type { useCurrentRole } from '@/hooks/use-current-role'
import { activitiesClient } from '@/lib/api/activities'
import { indicatorsClient } from '@/lib/api/indicators'
import type { Activity, Indicator } from '@/types/pathways'

import { ActivityDetailPanel, ActivityProofDialog } from '@/features/projects'
import type { DashboardActivityTarget } from '../dashboard.utils'

export const DashboardActivityReviewPanel = ({
  role,
  target,
  onActivityChanged,
  onClose,
}: {
  role: ReturnType<typeof useCurrentRole>['role']
  target: DashboardActivityTarget | null
  onActivityChanged: () => void
  onClose: () => void
}) => {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [proofActivity, setProofActivity] = useState<Activity | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    if (!target) {
      setActivity(null)
      setIndicators([])
      setProofActivity(null)
      setStatus('idle')
      return
    }

    let mounted = true
    setStatus('loading')

    Promise.all([
      activitiesClient.getActivity(target.projectId, target.activityId),
      indicatorsClient.getIndicators(target.projectId),
    ])
      .then(([activityRecord, indicatorRecords]) => {
        if (!mounted) return
        setActivity(activityRecord)
        setIndicators(indicatorRecords)
        setStatus('success')
      })
      .catch(() => {
        if (!mounted) return
        setActivity(null)
        setIndicators([])
        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [loadAttempt, target])

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  if (status === 'success' && activity) {
    return (
      <>
        <ActivityDetailPanel
          activity={activity}
          canDecideProof={role === 'Project Manager'}
          canDecideExtension={role === 'Project Manager'}
          canEdit={false}
          canLogExpense={role === 'Project Officer'}
          canRequestExtension={role === 'Project Officer'}
          canSubmitProof={role === 'Project Officer'}
          canValidateExpense={role === 'Monitoring and Evaluation Officer'}
          canValidateProof={role === 'Monitoring and Evaluation Officer'}
          indicators={indicators}
          journeyStages={[]}
          onActivityChanged={(updatedActivity) => {
            setActivity(updatedActivity)
            onActivityChanged()
          }}
          onEdit={() => undefined}
          onOpenChange={handleOpenChange}
          onSubmitProof={setProofActivity}
          open={Boolean(target)}
          requestedExpenseId={target?.expenseId}
          requestedProofId={target?.proofId}
        />
        <ActivityProofDialog
          activity={proofActivity}
          onOpenChange={(open) => {
            if (!open) setProofActivity(null)
          }}
          onSubmitted={(updatedActivity) => {
            setActivity(updatedActivity)
            setProofActivity(null)
            onActivityChanged()
          }}
          open={Boolean(proofActivity)}
        />
      </>
    )
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={Boolean(target)}>
      <SidePanel
        description="Open the selected project activity without leaving Dashboard."
        title="Activity details"
      >
        <AsyncState
          description={
            status === 'error'
              ? 'The activity proof could not be loaded. Try again from this panel.'
              : 'Loading the selected activity and its submitted proof.'
          }
          icon={status === 'error' ? AlertTriangle : Loader2}
          onRetry={status === 'error' ? () => setLoadAttempt((attempt) => attempt + 1) : undefined}
          status={status === 'error' ? 'error' : 'loading'}
          title={status === 'error' ? 'Review unavailable' : 'Loading review'}
        />
      </SidePanel>
    </Sheet>
  )
}
