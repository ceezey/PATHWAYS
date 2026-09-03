'use client'

import { ShieldAlert, UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type {
  Activity,
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { BeneficiaryDetail } from './beneficiary-detail'

type DetailData = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
  mediaProof: BeneficiaryMediaProofRecord[]
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; data: DetailData }
  | { status: 'restricted' }
  | { status: 'unavailable' }
  | { status: 'error' }

export const BeneficiaryDetailLoader = ({ beneficiaryId }: { beneficiaryId: string }) => {
  const { role } = usePrototypeRole()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let active = true

    const loadDetail = async () => {
      setState({ status: 'loading' })

      try {
        const beneficiary = await pathwaysClient.getBeneficiaryRecordForRole(role, beneficiaryId)
        const [projects, mediaProof, activityGroups, stageGroups] = await Promise.all([
          pathwaysClient.getProjectsForRole(role),
          pathwaysClient.getBeneficiaryMediaProofForRole(role, beneficiaryId),
          Promise.all(
            beneficiary.projectIds.map((projectId) => pathwaysClient.getActivities(projectId)),
          ),
          Promise.all(
            beneficiary.projectIds.map((projectId) => pathwaysClient.getJourneyStages(projectId)),
          ),
        ])

        if (active) {
          setState({
            status: 'ready',
            data: {
              beneficiary,
              projects,
              mediaProof,
              activities: activityGroups.flat(),
              stages: stageGroups.flat(),
            },
          })
        }
      } catch (error) {
        if (!active) {
          return
        }

        if (error instanceof PathwaysClientError && error.code === 'forbidden') {
          setState({ status: 'restricted' })
        } else if (error instanceof PathwaysClientError && error.code === 'not_found') {
          setState({ status: 'unavailable' })
        } else {
          setState({ status: 'error' })
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [beneficiaryId, loadAttempt, role])

  if (state.status === 'loading') {
    return (
      <AsyncState
        description="Checking whether this Beneficiary record is available to the current role."
        icon={ShieldAlert}
        status="loading"
        title="Checking Beneficiary record access"
      />
    )
  }

  if (state.status === 'ready') {
    return (
      <>
        <StatusMessage>Beneficiary record loaded.</StatusMessage>
        <BeneficiaryDetail {...state.data} />
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <AsyncState
        description="The Beneficiary record could not be loaded. Check your connection and try again."
        icon={UserRoundX}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Beneficiary record unavailable"
      />
    )
  }

  const restricted = state.status === 'restricted'

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <AsyncState
          description={
            restricted
              ? 'This record is outside the projects assigned to the current prototype role. No Beneficiary details or media were loaded.'
              : 'This Beneficiary record is not available in the current safe sample data.'
          }
          icon={restricted ? ShieldAlert : UserRoundX}
          status="empty"
          title={restricted ? 'Beneficiary record restricted' : 'Beneficiary record unavailable'}
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    </div>
  )
}
